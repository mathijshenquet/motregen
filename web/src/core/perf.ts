/** Cumulatieve tellers van de kaart en de isolijnlaag (die per laag-instantie opnieuw begint). */
export interface IsolineCounters {
  repaints: number
  rainUploads?: number
  rainDraws?: number
  isolineDraws?: number
  windDraws?: number
  passes?: number
  composites?: number
  passPixels?: number
  compositePixels?: number
  passMs?: number
  compositeMs?: number
  timing?: 'gpu' | 'cpu'
  /** Vectorlijnen: tracer-rondes (worker), ms per ronde, segmenten, ringen en vervaagde lusjes. */
  traces?: number
  traceMs?: number
  segments?: number
  rings?: number
  fadedRings?: number
  labelRounds: number
  labels: number
  /** Frame-index-coördinaat van de laatst gezette isolijnsnede. */
  sliceTime?: number
  /** 0–1: dekking van de gevoelstemperatuur op de gekozen tijd (buiten de uurframes: uitfade). */
  coverage?: number
}

export interface IsolineRates {
  repaintsPerSecond: number
  rainDrawsPerSecond: number
  windDrawsPerSecond: number
  rainUploadsPerSecond: number
  passesPerSecond: number
  passMs: number | null
  compositeMs: number | null
  /** Offscreen pixels per pass (laatste venster). */
  passPixels: number | null
  timing: 'gpu' | 'cpu'
  labels: number
  /** null zonder vectorlijnen. */
  vector: { tracesPerSecond: number; traceMs: number; segments: number; rings: number; fadedRings: number } | null
}

/** Tempo's tussen twee tellerstanden; een teruggelopen teller (nieuwe laag) telt vanaf nul. */
export function isolineRates(previous: IsolineCounters, next: IsolineCounters, elapsedMs: number): IsolineRates {
  const delta = (key: 'repaints' | 'passes' | 'passPixels' | 'rainDraws' | 'windDraws' | 'rainUploads' | 'traces') => {
    const before = previous[key] ?? 0, after = next[key] ?? 0
    return after >= before ? after - before : after
  }
  const seconds = Math.max(elapsedMs, 1) / 1_000
  const passes = delta('passes')
  return {
    repaintsPerSecond: delta('repaints') / seconds,
    rainDrawsPerSecond: delta('rainDraws') / seconds,
    windDrawsPerSecond: delta('windDraws') / seconds,
    rainUploadsPerSecond: delta('rainUploads') / seconds,
    passesPerSecond: passes / seconds,
    passMs: next.passes ? next.passMs ?? null : null,
    compositeMs: next.composites ? next.compositeMs ?? null : null,
    passPixels: passes ? delta('passPixels') / passes : null,
    timing: next.timing ?? 'cpu',
    labels: next.labels,
    vector: next.traces ? { tracesPerSecond: delta('traces') / seconds, traceMs: next.traceMs ?? 0, segments: next.segments ?? 0, rings: next.rings ?? 0, fadedRings: next.fadedRings ?? 0 } : null,
  }
}

export type PerfResourceKind = 'manifest' | 'chunks' | 'tiles' | 'other'

export interface PerfResourceTotals {
  requests: number
  bytes: number
}

export interface PerfSnapshot {
  capturedAt: string
  ttfrMs: number | null
  scrub: { samples: number; p50Ms: number | null; p95Ms: number | null }
  fps: number | null
  network: Record<PerfResourceKind | 'total', PerfResourceTotals>
  manifestAgeMs: number | null
}

interface ResourceEntry {
  name: string
  initiatorType: string
  transferSize: number
}

export interface PerfEnvironment {
  now: () => number
  wallNow: () => number
  resources: () => ResourceEntry[]
  requestFrame: (callback: FrameRequestCallback) => number
  cancelFrame: (handle: number) => void
}

const sampleCapacity = 256
const loadTraceCapacity = 4_000

export type LoadLayer = 'header' | 'map' | 'motion' | 'prefetch' | 'L0' | 'L1' | 'L2' | 'refresh'

export interface LoadRequestTrace {
  id: number
  url: string
  range: [number, number]
  priority: string
  layer: LoadLayer
  frames: number[]
  startMs: number
  responseMs?: number
  endMs?: number
  bytes: number
  error?: string
}

export interface LoadFrameTrace {
  url: string
  frameIndex: number
  layer: LoadLayer
  requestId: number | null
  requestedMs: number
  bytesReadyMs?: number
  decodedMs?: number
}

export type LoadMarkTrace =
  | { kind: 'schedule'; t: number; layer: LoadLayer; field: string; indexes: number[]; reason: string }
  | { kind: 'start'; t: number; layer: LoadLayer; field: string; indexes: number[] }
  | { kind: 'stage'; t: number; stage: string }
  | { kind: 'rain'; t: number; loaded: number[]; total: number }
  | { kind: 'timeline'; t: number; now: number; horizonEnd: number; frames: Array<{ url: string; frameIndex: number; epoch: number; source: string }> }

export interface LoadTraceSnapshot {
  requests: LoadRequestTrace[]
  frames: LoadFrameTrace[]
  marks: LoadMarkTrace[]
}

/** Laadtijdlijn voor het Playwright-laadprofiel (U1); goedkoop genoeg om altijd aan te staan. */
export class LoadTrace {
  private readonly requests: LoadRequestTrace[] = []
  private readonly frames = new Map<string, LoadFrameTrace>()
  private readonly marks: LoadMarkTrace[] = []
  private nextId = 0

  constructor(private readonly now: () => number) {}

  request(url: string, range: [number, number], priority: string, layer: LoadLayer, frames: number[]): LoadRequestTrace {
    const trace: LoadRequestTrace = { id: ++this.nextId, url, range, priority, layer, frames, startMs: this.now(), bytes: 0 }
    if (this.requests.length < loadTraceCapacity) this.requests.push(trace)
    for (const frameIndex of frames) this.frame(url, frameIndex, layer).requestId ??= trace.id
    return trace
  }

  response(trace: LoadRequestTrace): void { trace.responseMs = this.now() }
  received(trace: LoadRequestTrace, bytes: number): void { trace.bytes += bytes }
  finished(trace: LoadRequestTrace, error?: unknown): void {
    trace.endMs = this.now()
    if (error !== undefined) trace.error = error instanceof Error ? error.message : String(error)
  }

  frame(url: string, frameIndex: number, layer: LoadLayer): LoadFrameTrace {
    const key = `${url}#${frameIndex}`
    let trace = this.frames.get(key)
    if (!trace) {
      trace = { url, frameIndex, layer, requestId: null, requestedMs: this.now() }
      if (this.frames.size < loadTraceCapacity) this.frames.set(key, trace)
    }
    return trace
  }

  frameBytesReady(url: string, frameIndex: number): void {
    const trace = this.frames.get(`${url}#${frameIndex}`)
    if (trace) trace.bytesReadyMs ??= this.now()
  }

  frameDecoded(url: string, frameIndex: number): void {
    const trace = this.frames.get(`${url}#${frameIndex}`)
    if (trace) trace.decodedMs ??= this.now()
  }

  mark(mark: DistributiveOmit<LoadMarkTrace, 't'>): void {
    if (this.marks.length < loadTraceCapacity) this.marks.push({ ...mark, t: this.now() } as LoadMarkTrace)
  }

  snapshot(): LoadTraceSnapshot {
    return { requests: this.requests.map((trace) => ({ ...trace })), frames: [...this.frames.values()].map((trace) => ({ ...trace })), marks: [...this.marks] }
  }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never

export class PerfMonitor {
  private ttfrMs: number | null = null
  private manifestGeneratedAt: number | null = null
  private pendingScrubAt: number | null = null
  private readonly scrubSamples = new Float64Array(sampleCapacity)
  private scrubSampleCount = 0
  private scrubSampleCursor = 0
  private frameHandle: number | null = null
  private fpsWindowStart: number | null = null
  private fpsFrames = 0
  private fpsValue: number | null = null
  readonly loads: LoadTrace

  constructor(private readonly environment: PerfEnvironment) {
    this.loads = new LoadTrace(environment.now)
  }

  start(): void {
    if (this.frameHandle !== null) return
    this.frameHandle = this.environment.requestFrame(this.frameTick)
  }

  stop(): void {
    if (this.frameHandle === null) return
    this.environment.cancelFrame(this.frameHandle)
    this.frameHandle = null
  }

  setManifestGenerated(generated: string): void {
    const epoch = Date.parse(generated)
    this.manifestGeneratedAt = Number.isFinite(epoch) ? epoch : null
  }

  markScrubInput(): void {
    this.pendingScrubAt = this.environment.now()
  }

  markRainFrameCommitted(): void {
    const now = this.environment.now()
    this.ttfrMs ??= now
    if (this.pendingScrubAt === null) return
    this.scrubSamples[this.scrubSampleCursor] = Math.max(0, now - this.pendingScrubAt)
    this.scrubSampleCursor = (this.scrubSampleCursor + 1) % sampleCapacity
    this.scrubSampleCount = Math.min(sampleCapacity, this.scrubSampleCount + 1)
    this.pendingScrubAt = null
  }

  snapshot(): PerfSnapshot {
    const samples = Array.from(this.scrubSamples.subarray(0, this.scrubSampleCount)).sort((left, right) => left - right)
    const network = resourceTotals(this.environment.resources())
    return {
      capturedAt: new Date(this.environment.wallNow()).toISOString(),
      ttfrMs: rounded(this.ttfrMs),
      scrub: {
        samples: this.scrubSampleCount,
        p50Ms: percentile(samples, 0.5),
        p95Ms: percentile(samples, 0.95),
      },
      fps: rounded(this.fpsValue),
      network,
      manifestAgeMs: this.manifestGeneratedAt === null ? null : Math.max(0, this.environment.wallNow() - this.manifestGeneratedAt),
    }
  }

  private readonly frameTick = (timestamp: number): void => {
    if (this.fpsWindowStart === null || timestamp - this.fpsWindowStart > 2_500) {
      this.fpsWindowStart = timestamp
      this.fpsFrames = 0
    } else {
      this.fpsFrames++
      const elapsed = timestamp - this.fpsWindowStart
      if (elapsed >= 1_000) {
        this.fpsValue = this.fpsFrames * 1_000 / elapsed
        this.fpsWindowStart = timestamp
        this.fpsFrames = 0
      }
    }
    this.frameHandle = this.environment.requestFrame(this.frameTick)
  }
}

export function installPerfMonitor(): PerfMonitor {
  const monitor = new PerfMonitor({
    now: () => performance.now(),
    wallNow: () => Date.now(),
    resources: () => performance.getEntriesByType('resource') as PerformanceResourceTiming[],
    requestFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: (handle) => cancelAnimationFrame(handle),
  })
  performance.setResourceTimingBufferSize(2_000)
  monitor.start()
  window.__motregenPerf = monitor
  return monitor
}

function resourceTotals(entries: ResourceEntry[]): Record<PerfResourceKind | 'total', PerfResourceTotals> {
  const totals: Record<PerfResourceKind | 'total', PerfResourceTotals> = {
    manifest: { requests: 0, bytes: 0 },
    chunks: { requests: 0, bytes: 0 },
    tiles: { requests: 0, bytes: 0 },
    other: { requests: 0, bytes: 0 },
    total: { requests: 0, bytes: 0 },
  }
  for (const entry of entries) {
    const kind = resourceKind(entry)
    const bytes = Math.max(0, entry.transferSize || 0)
    totals[kind].requests++
    totals[kind].bytes += bytes
    totals.total.requests++
    totals.total.bytes += bytes
  }
  return totals
}

function resourceKind(entry: ResourceEntry): PerfResourceKind {
  const url = new URL(entry.name, 'http://localhost')
  if (url.pathname.endsWith('/manifest.json')) return 'manifest'
  if (url.pathname.includes('/chunks/') || url.pathname.endsWith('.mrf')) return 'chunks'
  if (entry.initiatorType === 'img' || url.pathname.includes('/tiles/') || /\.(?:pbf|png|jpe?g|webp)$/i.test(url.pathname)) return 'tiles'
  return 'other'
}

function percentile(sorted: number[], fraction: number): number | null {
  if (!sorted.length) return null
  return rounded(sorted[Math.ceil(sorted.length * fraction) - 1]!)
}

function rounded(value: number | null): number | null {
  return value === null ? null : Math.round(value * 10) / 10
}

declare global {
  interface Window {
    __motregenPerf: PerfMonitor
  }
}
