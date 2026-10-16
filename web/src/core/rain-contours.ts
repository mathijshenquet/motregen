import type { Grid } from './contract'
import { buildSegments, traceContours } from './isoline-contours'
import { recordPerfPhase } from './perf'

export interface RainContours {
  levels: Array<{ level: number; data: Float32Array }>
  milliseconds: number
}

export function traceRainContours(bytes: Uint8Array, grid: Grid, levels: readonly number[]): RainContours {
  const started = performance.now()
  const values = Float32Array.from(bytes, (value) => value === 255 ? 0 : value)
  const valid = new Float32Array(values.length).fill(1)
  const contours = traceContours({ values, valid }, grid, { step: 1, levels, toleranceCells: 0.025 })
  return {
    levels: levels.map((level) => ({ level, data: buildSegments(contours.filter((contour) => contour.level === level), { ringKm: 0 }).data })),
    milliseconds: performance.now() - started,
  }
}

export interface RainContourEntry {
  result?: RainContours
  pending: boolean
}

interface TraceJob {
  entry: RainContourEntry
  bytes: Uint8Array
  levels: readonly number[]
}

export interface RainContourMessage {
  grid: Grid
  bytes: Uint8Array
  levels: readonly number[]
}

export class RainContourTracer {
  private readonly cache = new WeakMap<Uint8Array, Map<string, RainContourEntry>>()
  private worker?: Worker
  private busy?: TraceJob
  private queue: TraceJob[] = []

  constructor(private readonly grid: Grid, private readonly repaint: () => void) {}

  get(frame: Uint8Array, samplingKey: string, levels: readonly number[], read: () => Uint8Array): RainContourEntry {
    let variants = this.cache.get(frame)
    if (!variants) {
      variants = new Map()
      this.cache.set(frame, variants)
    }
    const key = `${samplingKey}:${levels.join(',')}`
    let entry = variants.get(key)
    if (!entry) {
      entry = { pending: false }
      variants.set(key, entry)
    }
    if (!entry.result && !entry.pending) {
      entry.pending = true
      this.queue.push({ entry, bytes: read(), levels })
      this.pump()
    }
    return entry
  }

  retain(entries: readonly RainContourEntry[]): void {
    this.queue = this.queue.filter((job) => {
      if (entries.includes(job.entry)) return true
      job.entry.pending = false
      return false
    })
  }

  dispose(): void {
    this.worker?.terminate()
    this.worker = undefined
    this.busy = undefined
    this.queue = []
  }

  private pump(): void {
    if (this.busy) return
    const job = this.queue.shift()
    if (!job) return
    this.busy = job
    if (typeof Worker === 'undefined') {
      this.complete(traceRainContours(job.bytes, this.grid, job.levels))
      return
    }
    if (!this.worker) {
      this.worker = new Worker(new URL('./rain-contours.worker.ts', import.meta.url), { type: 'module' })
      this.worker.onmessage = ({ data }: MessageEvent<RainContours>) => this.complete(data)
    }
    this.worker.postMessage({ grid: this.grid, bytes: job.bytes, levels: job.levels } satisfies RainContourMessage, [job.bytes.buffer])
  }

  private complete(result: RainContours): void {
    const job = this.busy
    if (!job) return
    job.entry.result = result
    job.entry.pending = false
    this.busy = undefined
    recordPerfPhase('isoline-trace', result.milliseconds, { layer: 'rain', segments: result.levels.reduce((total, level) => total + level.data.length / 6, 0) })
    this.repaint()
    this.pump()
  }
}
