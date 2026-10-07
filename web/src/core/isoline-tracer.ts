import type { Grid } from './contract'
import type { PreparedField } from './isoline-field'
import { blendSlice, buildSegments, ringFadeRaster, shortRings, traceContours, type SegmentStats, type ShortRing } from './isoline-contours'
import { sliceWeights } from './isoline-spline'

export interface TraceRequest {
  /** Frame-index-coördinaat van de snede. */
  time: number
  /** Tijdvenster: 0 lineair, 1 kubische B-spline (zoals de shader). */
  window: number
  step: number
  toleranceCells: number
  ringKm: number
  gradient?: [number, number]
}

export interface TraceResult {
  request: TraceRequest
  data: Float32Array
  /** Korte ringen van deze snede: de lijnlabels erop vervagen mee. */
  rings: ShortRing[]
  /** (niveau, fade) per roostercel rond vervaagde ringen, voor de vulling; undefined = geen. */
  ringFade?: Float32Array
  stats: SegmentStats & { points: number; ms: number }
}

/** De uurvelden en het traceren zelf; draait in de worker, of synchroon zonder Worker (tests). */
export class TraceCore {
  private readonly fields: Array<PreparedField | undefined>

  constructor(readonly grid: Grid, readonly depth: number) {
    this.fields = new Array<PreparedField | undefined>(depth)
  }

  setLayer(index: number, field: PreparedField | undefined): void {
    this.fields[index] = field
  }

  trace(request: TraceRequest): TraceResult | undefined {
    const started = performance.now()
    const weights = sliceWeights(request.time, this.depth, request.window).filter(({ weight }) => weight > 0)
    const fields = weights.map(({ index }) => this.fields[index])
    if (!fields.length || fields.some((field) => !field)) return undefined
    const slice = fields.length === 1 ? fields[0]! : blendSlice(fields as PreparedField[], weights.map(({ weight }) => weight))
    const contours = traceContours(slice, this.grid, { step: request.step, toleranceCells: request.toleranceCells })
    const { data, stats } = buildSegments(contours, { ringKm: request.ringKm, gradient: request.gradient })
    const points = contours.reduce((sum, contour) => sum + contour.points.length / 2, 0)
    const rings = shortRings(contours, request.ringKm, request.toleranceCells)
    return { request, data, rings, ringFade: ringFadeRaster(rings, this.grid.width, this.grid.height), stats: { ...stats, points, ms: performance.now() - started } }
  }
}

export type TracerMessage =
  | { type: 'init'; grid: Grid; depth: number }
  | { type: 'layer'; index: number; values: Float32Array | null; valid: Float32Array | null }
  | { type: 'trace'; id: number; request: TraceRequest }

export type TracerReply = { id: number; result: TraceResult | undefined }

/**
 * Contouren buiten de main thread. De worker houdt de uurvelden (één kopie per uurlaag) en
 * krijgt per snede alleen de tijd; latest-wins: hooguit één verzoek onderweg en één wachtend.
 */
export class ContourTracer {
  private worker?: Worker
  private core?: TraceCore
  private readonly fields: Array<PreparedField | undefined>
  private busy = false
  private pending?: TraceRequest
  private id = 0
  private paused = false

  constructor(private readonly grid: Grid, private readonly depth: number, private readonly done: (result: TraceResult | undefined) => void) {
    this.fields = new Array<PreparedField | undefined>(depth)
    if (typeof Worker === 'undefined') {
      this.core = new TraceCore(grid, depth)
      return
    }
    this.startWorker()
  }

  private startWorker(): void {
    const worker = new Worker(new URL('./isoline-tracer.worker.ts', import.meta.url), { type: 'module' })
    this.worker = worker
    worker.onmessage = ({ data }: MessageEvent<TracerReply>) => {
      if (worker !== this.worker) return
      if (data.id !== this.id) return
      this.busy = false
      this.done(data.result)
      this.pump()
    }
    this.post({ type: 'init', grid: this.grid, depth: this.depth })
    this.fields.forEach((field, index) => {
      if (field) this.postLayer(index, field)
    })
  }

  setLayer(index: number, field: PreparedField | undefined): void {
    this.fields[index] = field
    if (this.core) { this.core.setLayer(index, field); return }
    if (this.paused) return
    this.postLayer(index, field)
  }

  private postLayer(index: number, field: PreparedField | undefined): void {
    // Kopieën: het veld blijft ook in de labelcache van de app in gebruik.
    const values = field ? field.values.slice() : null, valid = field ? field.valid.slice() : null
    this.post({ type: 'layer', index, values, valid }, values && valid ? [values.buffer, valid.buffer] : [])
  }

  request(request: TraceRequest): void {
    if (this.paused) return
    this.pending = request
    this.pump()
  }

  setPaused(paused: boolean): void {
    if (paused === this.paused) return
    this.paused = paused
    this.pending = undefined
    if (this.core) return
    if (paused) {
      this.worker?.terminate()
      this.worker = undefined
      this.busy = false
      this.id++
    } else {
      this.startWorker()
    }
  }

  dispose(): void {
    this.paused = true
    this.worker?.terminate()
    this.worker = undefined
    this.pending = undefined
    this.busy = false
  }

  private pump(): void {
    if (this.paused || this.busy || !this.pending) return
    const request = this.pending
    this.pending = undefined
    if (this.core) {
      this.done(this.core.trace(request))
      return
    }
    this.busy = true
    this.post({ type: 'trace', id: ++this.id, request })
  }

  private post(message: TracerMessage, transfer: Transferable[] = []): void {
    this.worker?.postMessage(message, transfer)
  }
}
