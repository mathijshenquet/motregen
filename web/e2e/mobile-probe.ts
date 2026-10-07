import type { PerfMonitor } from '../src/core/perf'
import type { SelfProfilerTrace } from '../src/core/profile-recorder'

export interface MobileProbe {
  splashGoneMs: number | null
  ttfhMs: number | null
  histogramSource: string
  stop: () => Promise<{ trace: SelfProfilerTrace | null; startedAt: number; error: string | null }>
}

declare global {
  interface Window { __mobileProbe: MobileProbe }
}

export function installMobileProbe(): void {
  type ProfilerInstance = { stop: () => Promise<SelfProfilerTrace> }
  const Profiler = (globalThis as typeof globalThis & { Profiler?: new(options: { sampleInterval: number; maxBufferSize: number }) => ProfilerInstance }).Profiler
  const startedAt = performance.now()
  let profiler: ProfilerInstance | null = null
  let error: string | null = null
  try {
    if (Profiler) profiler = new Profiler({ sampleInterval: 10, maxBufferSize: 10_000 })
    else error = 'JS Self-Profiling niet beschikbaar'
  } catch (failure) { error = String(failure) }
  const probe: MobileProbe = {
    splashGoneMs: null,
    ttfhMs: null,
    histogramSource: 'loadtrace, bemonsterd op DOM-mutatie/100 ms',
    stop: async () => {
      clearInterval(timer)
      observer.disconnect()
      try { return { trace: await profiler?.stop() ?? null, startedAt, error } }
      catch (failure) { return { trace: null, startedAt, error: String(failure) } }
    },
  }
  window.__mobileProbe = probe
  const sample = () => {
    const splash = document.querySelector('.map-splash')
    const splashStyle = splash ? getComputedStyle(splash) : null
    if (probe.splashGoneMs === null && splash?.getAttribute('aria-hidden') === 'true' && (splashStyle?.visibility === 'hidden' || splashStyle?.display === 'none' || Number(splashStyle?.opacity) <= 0.01)) {
      probe.splashGoneMs = performance.now()
    }
    if (probe.ttfhMs !== null) return
    const monitor = (window as Window & { __motregenPerf?: PerfMonitor }).__motregenPerf
    if (!monitor) return
    const nativeReady = (monitor.snapshot() as ReturnType<PerfMonitor['snapshot']> & { windowReadyMs?: Record<string, number> }).windowReadyMs?.rain_rate
    if (nativeReady !== undefined) {
      probe.ttfhMs = nativeReady
      probe.histogramSource = 'U52 window-ready:rain_rate'
      return
    }
    const marks = monitor.loads.snapshot().marks
    const timeline = marks.findLast((mark) => mark.kind === 'timeline')
    const rain = marks.findLast((mark) => mark.kind === 'rain')
    if (timeline?.kind !== 'timeline' || rain?.kind !== 'rain') return
    const needed = timeline.frames.flatMap((frame, index) => Math.abs(frame.epoch - timeline.now) <= 3_600_000 ? [index] : [])
    const loaded = new Set(rain.loaded)
    if (needed.length > 0 && needed.every((index) => loaded.has(index))) probe.ttfhMs = performance.now()
  }
  const observer = new MutationObserver(sample)
  const start = () => observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['aria-hidden', 'class', 'data-load-stage'] })
  if (document.documentElement) start()
  else document.addEventListener('DOMContentLoaded', start, { once: true })
  const timer = setInterval(sample, 100)
}
