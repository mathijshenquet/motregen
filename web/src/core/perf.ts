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

  constructor(private readonly environment: PerfEnvironment) {}

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
