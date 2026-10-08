/** Cumulatieve tellers van de kaart en de isolijnlaag (die per laag-instantie opnieuw begint). */
export interface IsolineCounters {
  repaints: number
  rainUploads?: number
  rainDraws?: number
  isolineDraws?: number
  windDraws?: number
  passes?: number
  blankDraws?: number
  blankReasons?: { slice: number; palette: number; fill: number }
  blankAt?: number[]
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
  /** Bereik van het temperatuurpalet (U25b). */
  paletteRange?: { low: number; high: number }
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
  /** Splash-eerlijk (MIP-19): eerste regenframe én de basemap-tiles van het eerste beeld getekend. */
  ttfrMs: number | null
  firstRainMs: number | null
  basemapReadyMs: number | null
  /** Histogram nu ± 1 u compleet (`window-ready:rain_rate`). */
  ttfhMs: number | null
  /** Eerste frame-wissel van de regenlaag terwijl de tijdlijn afspeelt (MIP-19 §De lat). */
  ttfpMs: number | null
  /** Tijd na de splash waarin een zichtbaar slot leeg was terwijl zijn data nog kwam. */
  blankVisibleMs: number
  /**
   * Hetzelfde als oppervlak: lege zichtbare slots geïntegreerd over de tijd na de splash, in
   * slot-seconden. Eén ontbrekende randbalk weegt zo niet even zwaar als een leeg histogram.
   */
  blankSlotSeconds: number
  /** Als `blankSlotSeconds`, maar als aandeel van de zichtbare slots: seconden "volledig leeg"-equivalent. */
  blankShareSeconds: number
  /** Eerste zichtbare regenbalk met een waarde. */
  firstBarMs: number | null
  scrub: { samples: number; p50Ms: number | null; p95Ms: number | null }
  fps: number | null
  network: Record<PerfResourceKind | 'total', PerfResourceTotals>
  manifestAgeMs: number | null
  phases: Partial<Record<PerfPhase, PerfPhaseSummary>>
  longFrames: LongFrameSummary[]
  /** Per veld: ms sinds timeOrigin tot het venster nu ± 1 u voor het eerst compleet was. */
  windowReadyMs: Record<string, number>
}

export const PERF_STORAGE_KEY = 'motregen-perf'
export const PERF_COLD_STORAGE_KEY = 'motregen-perf-cold'

export const PERF_PHASES = [
  'frame-decode',
  'texture-upload',
  'isoline-trace',
  'isoline-blit',
  'wind-step',
  'scrubber-paint',
  'table-render',
  'basemap-tile',
] as const

export type PerfPhase = typeof PERF_PHASES[number]

export interface PerfPhaseSummary {
  count: number
  p50Ms: number
  p95Ms: number
}

/** Mijlpaal op de tijdlijn: van timeOrigin tot het venster nu ± 1 u van dit veld compleet was (U52). */
export type WindowReadyMeasure = `window-ready:${string}`

/** Mijlpalen van de koude start (MIP-19), elk van timeOrigin tot het moment zelf. */
export type LoadMilestone = 'first-map-image' | 'first-rain' | 'basemap-ready' | 'ttfr' | 'ttfp' | 'first-bar'

export interface PerfMeasure {
  phase: PerfPhase | WindowReadyMeasure | `milestone:${LoadMilestone}` | 'blank-visible'
  startTime: number
  duration: number
  detail?: Record<string, unknown>
}

export interface LongFrameScript {
  duration: number
  sourceURL: string
  sourceFunctionName: string
  invoker: string
}

export interface LongFrameSummary {
  startTime: number
  duration: number
  blockingDuration: number
  scripts: LongFrameScript[]
}

export interface PerfTraceSlice {
  measures: PerfMeasure[]
  longFrames: LongFrameSummary[]
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
const phaseWindowMs = 30_000
const detailedEntryCapacity = 10_000
let detailedMeasurementsEnabled = false
let activeMonitor: PerfMonitor | undefined

export function perfPhasesEnabled(): boolean {
  return detailedMeasurementsEnabled
}

export function measurePerfPhase<T>(phase: PerfPhase, operation: () => T, detail?: Record<string, unknown>): T {
  if (!detailedMeasurementsEnabled) return operation()
  const startTime = performance.now()
  const name = `motregen:${phase}`
  try {
    return operation()
  } finally {
    const duration = performance.now() - startTime
    // Eén measure op tijdstempels, zonder benoemde marks: twee marks plus drie keer opruimen per fase
    // kostte in de PO-opname van 2026-10-07 zelf 1,3 s hoofddraad.
    performance.measure(name, { start: startTime, duration, detail })
    performance.clearMeasures(name)
    activeMonitor?.recordPhase({ phase, startTime, duration, detail })
  }
}

/** Legt werkduur uit een worker of eventpaar vast op de tijdlijn van de hoofdpagina. */
export function recordPerfPhase(phase: PerfPhase, duration: number, detail?: Record<string, unknown>, endTime = performance.now()): void {
  if (!detailedMeasurementsEnabled || !Number.isFinite(duration) || duration < 0) return
  const startTime = Math.max(0, endTime - duration)
  const name = `motregen:${phase}`
  performance.measure(name, { start: startTime, duration, detail })
  performance.clearMeasures(name)
  activeMonitor?.recordPhase({ phase, startTime, duration, detail })
}

/** `?perf` zet de vlag, `?perf=0` wist hem, `?perf=start` start bovendien meteen een koude-startopname van deze lading (PO 2026-10-07). */
export function configurePerfMode(url: URL, storage: Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>): boolean {
  if (url.searchParams.has('perf')) {
    const value = url.searchParams.get('perf')
    if (value === '0') {
      storage.removeItem(PERF_STORAGE_KEY)
      storage.removeItem(PERF_COLD_STORAGE_KEY)
    } else {
      storage.setItem(PERF_STORAGE_KEY, '1')
      if (value === 'start') storage.setItem(PERF_COLD_STORAGE_KEY, '1')
    }
    return url.searchParams.get('perf') !== '0'
  }
  const coldStart = storage.getItem(PERF_STORAGE_KEY) === '1' && storage.getItem(PERF_COLD_STORAGE_KEY) === '1'
  if (!coldStart) storage.removeItem(PERF_STORAGE_KEY)
  return coldStart
}

export function consumeColdProfile(storage: Pick<Storage, 'getItem' | 'removeItem'>): boolean {
  const requested = storage.getItem(PERF_COLD_STORAGE_KEY) === '1'
  if (requested) {
    storage.removeItem(PERF_COLD_STORAGE_KEY)
    storage.removeItem(PERF_STORAGE_KEY)
  }
  return requested
}

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
  private firstRainMs: number | null = null
  private basemapReadyMs: number | null = null
  private ttfrMs: number | null = null
  private ttfpMs: number | null = null
  private shownRainFrame: number | undefined
  private splashGoneMs: number | null = null
  private blankSlots = 0
  private blankSinceMs: number | null = null
  private blankVisibleMs = 0
  private visibleSlots = 0
  private blankAreaSince: number | null = null
  private blankSlotMs = 0
  private blankShareMs = 0
  private firstBarMs: number | null = null
  private manifestGeneratedAt: number | null = null
  private pendingScrubAt: number | null = null
  private readonly scrubSamples = new Float64Array(sampleCapacity)
  private scrubSampleCount = 0
  private scrubSampleCursor = 0
  private frameHandle: number | null = null
  private fpsWindowStart: number | null = null
  private fpsFrames = 0
  private fpsValue: number | null = null
  private readonly measures: PerfMeasure[] = []
  private readonly longFrames: LongFrameSummary[] = []
  private readonly windowReady = new Map<string, number>()
  private longFrameObserver?: PerformanceObserver
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

  setDetailedEnabled(enabled: boolean): void {
    detailedMeasurementsEnabled = enabled
    activeMonitor = this
    if (!enabled) {
      this.longFrameObserver?.disconnect()
      this.longFrameObserver = undefined
      return
    }
    if (this.longFrameObserver || typeof PerformanceObserver === 'undefined' || !PerformanceObserver.supportedEntryTypes?.includes('long-animation-frame')) return
    this.longFrameObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) this.recordLongFrame(longFrame(entry))
    })
    this.longFrameObserver.observe({ type: 'long-animation-frame', buffered: true })
  }

  recordPhase(measure: PerfMeasure): void {
    this.measures.push({ ...measure, detail: measure.detail && { ...measure.detail } })
    if (this.measures.length > detailedEntryCapacity) this.measures.splice(0, this.measures.length - detailedEntryCapacity)
  }

  recordLongFrame(frame: LongFrameSummary): void {
    this.longFrames.push({ ...frame, scripts: frame.scripts.map((script) => ({ ...script })) })
    if (this.longFrames.length > detailedEntryCapacity) this.longFrames.splice(0, this.longFrames.length - detailedEntryCapacity)
  }

  traceSlice(startTime = 0, endTime = Number.POSITIVE_INFINITY): PerfTraceSlice {
    const within = (start: number, duration: number) => start <= endTime && start + duration >= startTime
    return {
      measures: this.measures.filter((entry) => within(entry.startTime, entry.duration)).map((entry) => ({ ...entry, detail: entry.detail && { ...entry.detail } })),
      longFrames: this.longFrames.filter((entry) => within(entry.startTime, entry.duration)).map((entry) => ({ ...entry, scripts: entry.scripts.map((script) => ({ ...script })) })),
    }
  }

  setManifestGenerated(generated: string): void {
    const epoch = Date.parse(generated)
    this.manifestGeneratedAt = Number.isFinite(epoch) ? epoch : null
  }

  /** Alleen het eerste moment per veld telt: de koude start, niet een latere locatiewissel. */
  markWindowReady(field: string): void {
    if (this.windowReady.has(field)) return
    const now = this.environment.now()
    this.windowReady.set(field, now)
    if (!detailedMeasurementsEnabled) return
    performance.measure(`motregen:window-ready:${field}`, { start: 0, end: now })
    this.recordPhase({ phase: `window-ready:${field}`, startTime: 0, duration: now })
  }

  markScrubInput(): void {
    this.pendingScrubAt = this.environment.now()
  }

  private markMilestone(milestone: LoadMilestone, now: number): void {
    if (!detailedMeasurementsEnabled) return
    performance.measure(`motregen:milestone:${milestone}`, { start: 0, end: now })
    this.recordPhase({ phase: `milestone:${milestone}`, startTime: 0, duration: now })
  }

  private settleFirstRender(now: number): void {
    if (this.ttfrMs !== null || this.firstRainMs === null || this.basemapReadyMs === null) return
    this.ttfrMs = now
    this.markMilestone('ttfr', now)
  }

  /** De basemap-tiles van het eerste beeld zijn getekend. */
  markBasemapReady(): void {
    if (this.basemapReadyMs !== null) return
    const now = this.environment.now()
    this.basemapReadyMs = now
    this.markMilestone('basemap-ready', now)
    this.settleFirstRender(now)
  }

  markSplashGone(): void {
    if (this.splashGoneMs !== null) return
    this.splashGoneMs = this.environment.now()
    if (this.blankSlots > 0) this.blankSinceMs = this.splashGoneMs
    this.blankAreaSince = this.splashGoneMs
  }

  /** Aantal zichtbare slots dat nu leeg is (niet geladen, niet als fog getekend). */
  /** Telt het oppervlak bij tot `now` met de slotstand die tot nu gold. */
  private settleBlankArea(now: number): void {
    if (this.blankAreaSince === null) return
    const elapsed = now - this.blankAreaSince
    this.blankAreaSince = now
    this.blankSlotMs += this.blankSlots * elapsed
    if (this.visibleSlots > 0) this.blankShareMs += this.blankSlots / this.visibleSlots * elapsed
  }

  setBlankVisibleSlots(blankSlots: number, visibleSlots = blankSlots): void {
    const now = this.environment.now()
    this.settleBlankArea(now)
    if (this.firstBarMs === null && visibleSlots > blankSlots) {
      this.firstBarMs = now
      this.markMilestone('first-bar', now)
    }
    const wasBlank = this.blankSlots > 0
    this.blankSlots = blankSlots
    this.visibleSlots = visibleSlots
    if (this.splashGoneMs === null || wasBlank === blankSlots > 0) return
    if (blankSlots > 0) {
      this.blankSinceMs = now
      return
    }
    const startTime = this.blankSinceMs ?? now
    this.blankSinceMs = null
    this.blankVisibleMs += now - startTime
    if (!detailedMeasurementsEnabled) return
    performance.measure('motregen:blank-visible', { start: startTime, end: now })
    this.recordPhase({ phase: 'blank-visible', startTime, duration: now - startTime })
  }

  /**
   * `shown` is het linker regenframe van dit getekende beeld. Wisselt dat tijdens afspelen, dan
   * loopt de tijdlijn ook echt op het scherm: een bewegende cursor boven een stilstaande kaart telt niet.
   */
  markRainFrameCommitted(shown?: { frameEpoch: number; playing: boolean }): boolean {
    const now = this.environment.now()
    let firstPlayback = false
    if (this.firstRainMs === null) {
      this.firstRainMs = now
      this.markMilestone('first-rain', now)
      this.settleFirstRender(now)
    }
    if (shown) {
      if (shown.playing && this.ttfpMs === null && this.shownRainFrame !== undefined && shown.frameEpoch !== this.shownRainFrame) {
        this.ttfpMs = now
        this.markMilestone('ttfp', now)
        firstPlayback = true
      }
      this.shownRainFrame = shown.frameEpoch
    }
    if (this.pendingScrubAt === null) return firstPlayback
    this.scrubSamples[this.scrubSampleCursor] = Math.max(0, now - this.pendingScrubAt)
    this.scrubSampleCursor = (this.scrubSampleCursor + 1) % sampleCapacity
    this.scrubSampleCount = Math.min(sampleCapacity, this.scrubSampleCount + 1)
    this.pendingScrubAt = null
    return firstPlayback
  }

  snapshot(): PerfSnapshot {
    const samples = Array.from(this.scrubSamples.subarray(0, this.scrubSampleCount)).sort((left, right) => left - right)
    const network = resourceTotals(this.environment.resources())
    const cutoff = this.environment.now() - phaseWindowMs
    const phases: Partial<Record<PerfPhase, PerfPhaseSummary>> = {}
    for (const phase of PERF_PHASES) {
      const durations = this.measures.filter((entry) => entry.phase === phase && entry.startTime + entry.duration >= cutoff)
        .map((entry) => entry.duration).sort((left, right) => left - right)
      if (durations.length) phases[phase] = { count: durations.length, p50Ms: percentile(durations, 0.5)!, p95Ms: percentile(durations, 0.95)! }
    }
    return {
      capturedAt: new Date(this.environment.wallNow()).toISOString(),
      ttfrMs: rounded(this.ttfrMs),
      firstRainMs: rounded(this.firstRainMs),
      basemapReadyMs: rounded(this.basemapReadyMs),
      ttfhMs: rounded(this.windowReady.get('rain_rate') ?? null),
      ttfpMs: rounded(this.ttfpMs),
      blankVisibleMs: Math.round(this.blankVisibleMs + (this.blankSinceMs === null ? 0 : this.environment.now() - this.blankSinceMs)),
      ...this.blankArea(),
      firstBarMs: rounded(this.firstBarMs),
      scrub: {
        samples: this.scrubSampleCount,
        p50Ms: percentile(samples, 0.5),
        p95Ms: percentile(samples, 0.95),
      },
      fps: rounded(this.fpsValue),
      network,
      manifestAgeMs: this.manifestGeneratedAt === null ? null : Math.max(0, this.environment.wallNow() - this.manifestGeneratedAt),
      phases,
      windowReadyMs: Object.fromEntries([...this.windowReady].map(([field, readyMs]) => [field, Math.round(readyMs)])),
      longFrames: this.longFrames.filter((entry) => entry.startTime + entry.duration >= cutoff)
        .sort((left, right) => right.duration - left.duration).slice(0, 5)
        .map((entry) => ({ ...entry, scripts: entry.scripts.map((script) => ({ ...script })) })),
    }
  }

  private blankArea(): { blankSlotSeconds: number; blankShareSeconds: number } {
    const running = this.blankAreaSince === null ? 0 : this.environment.now() - this.blankAreaSince
    const share = this.visibleSlots > 0 ? this.blankSlots / this.visibleSlots : 0
    return {
      blankSlotSeconds: Math.round((this.blankSlotMs + this.blankSlots * running) / 100) / 10,
      blankShareSeconds: Math.round((this.blankShareMs + share * running) / 10) / 100,
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
  activeMonitor = monitor
  window.__motregenPerf = monitor
  return monitor
}

interface LongAnimationFrameEntryLike extends PerformanceEntry {
  blockingDuration?: number
  scripts?: Array<{
    duration?: number
    sourceURL?: string
    sourceFunctionName?: string
    invoker?: string
  }>
}

function longFrame(entry: PerformanceEntry): LongFrameSummary {
  const frame = entry as LongAnimationFrameEntryLike
  return {
    startTime: frame.startTime,
    duration: frame.duration,
    blockingDuration: frame.blockingDuration ?? 0,
    scripts: [...frame.scripts ?? []]
      .sort((left, right) => (right.duration ?? 0) - (left.duration ?? 0))
      .slice(0, 5)
      .map((script) => ({
        duration: script.duration ?? 0,
        sourceURL: script.sourceURL ?? '',
        sourceFunctionName: script.sourceFunctionName ?? '',
        invoker: script.invoker ?? '',
      })),
  }
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
  if (entry.initiatorType === 'img' || url.pathname.includes('/tiles/') || /\.(?:pmtiles|pbf|png|jpe?g|webp)$/i.test(url.pathname)) return 'tiles'
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
