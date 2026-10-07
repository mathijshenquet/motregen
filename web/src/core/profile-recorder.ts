import type { PerfMeasure, PerfMonitor, PerfTraceSlice } from './perf'

export interface SelfProfilerTrace {
  resources: string[]
  frames: Array<{ name: string; resourceId?: number; line?: number; column?: number }>
  stacks: Array<{ parentId?: number; frameId: number }>
  samples: Array<{ timestamp: number; stackId?: number }>
}

interface ProfilerLike extends EventTarget {
  readonly sampleInterval: number
  stop: () => Promise<SelfProfilerTrace>
}

type ProfilerConstructor = new(options: { sampleInterval: number; maxBufferSize: number }) => ProfilerLike

export interface ChromeTrace {
  traceEvents: ChromeTraceEvent[]
  displayTimeUnit: 'ms'
  metadata: {
    capturedAt: string
    origin: string
    platform: string
    userAgent: string
    profiler: 'js-self-profiling' | 'measures-only'
  }
}

export interface ChromeTraceEvent {
  cat: string
  name: string
  ph: 'M' | 'P' | 'X'
  pid: number
  tid: number
  ts: number
  dur?: number
  id?: string
  args: Record<string, unknown>
}

export interface ProfileRecording {
  trace: ChromeTrace
  json: string
  profilerAvailable: boolean
  startedAt: number
  endedAt: number
}

export async function recordProfile(
  monitor: PerfMonitor,
  durationMs = 30_000,
  captureStartTime = performance.now(),
  stop?: AbortSignal,
): Promise<ProfileRecording> {
  const startedAt = performance.now()
  const Profiler = (globalThis as typeof globalThis & { Profiler?: ProfilerConstructor }).Profiler
  let profiler: ProfilerLike | undefined
  if (Profiler) {
    try {
      profiler = new Profiler({ sampleInterval: 10, maxBufferSize: 10_000 })
    } catch {
      profiler = undefined
    }
  }
  await delay(Math.max(0, durationMs), stop)
  const endedAt = performance.now()
  let selfProfile: SelfProfilerTrace | undefined
  if (profiler) {
    try {
      selfProfile = await profiler.stop()
    } catch {
      selfProfile = undefined
    }
  }
  const trace = buildChromeTrace({
    entries: monitor.traceSlice(captureStartTime, endedAt),
    timeOrigin: performance.timeOrigin,
    captureStartTime,
    captureEndTime: endedAt,
    profileStartTime: startedAt,
    selfProfile,
    capturedAt: new Date().toISOString(),
    origin: location.origin,
    platform: browserPlatform(),
    userAgent: navigator.userAgent,
  })
  return { trace, json: JSON.stringify(trace), profilerAvailable: !!selfProfile, startedAt: captureStartTime, endedAt }
}

export interface TraceExportInput {
  entries: PerfTraceSlice
  timeOrigin: number
  captureStartTime: number
  captureEndTime: number
  profileStartTime: number
  selfProfile?: SelfProfilerTrace
  capturedAt: string
  origin: string
  platform: string
  userAgent: string
}

export function buildChromeTrace(input: TraceExportInput): ChromeTrace {
  const pid = 1, tid = 1
  const traceEvents: ChromeTraceEvent[] = [
    metadataEvent('process_name', pid, tid, { name: 'motregen' }),
    metadataEvent('thread_name', pid, tid, { name: 'Main' }),
    ...input.entries.measures.map((measure) => measureEvent(measure, input.timeOrigin, pid, tid)),
    ...input.entries.longFrames.map((frame) => ({
      cat: 'motregen.long-frame',
      name: 'Long animation frame',
      ph: 'X' as const,
      pid,
      tid,
      ts: microseconds(input.timeOrigin + frame.startTime),
      dur: microseconds(frame.duration),
      args: { blockingDuration: frame.blockingDuration, scripts: frame.scripts },
    })),
  ]
  if (input.selfProfile) traceEvents.push(...profileEvents(input.selfProfile, input.timeOrigin, input.profileStartTime, pid, tid))
  traceEvents.sort((left, right) => left.ts - right.ts || phaseOrder(left.ph) - phaseOrder(right.ph))
  return {
    traceEvents,
    displayTimeUnit: 'ms',
    metadata: {
      capturedAt: input.capturedAt,
      origin: input.origin,
      platform: input.platform,
      userAgent: input.userAgent,
      profiler: input.selfProfile ? 'js-self-profiling' : 'measures-only',
    },
  }
}

function profileEvents(trace: SelfProfilerTrace, timeOrigin: number, startedAt: number, pid: number, tid: number): ChromeTraceEvent[] {
  const profileId = '0x1'
  const rootId = 1
  const children = new Map<number, number[]>()
  trace.stacks.forEach((stack, stackId) => {
    const parent = stack.parentId === undefined ? rootId : stack.parentId + 2
    children.set(parent, [...children.get(parent) ?? [], stackId + 2])
  })
  const nodes = [{
    id: rootId,
    callFrame: { functionName: '(root)', scriptId: '0', url: '', lineNumber: -1, columnNumber: -1 },
    children: children.get(rootId) ?? [],
  }, ...trace.stacks.map((stack, stackId) => {
    const frame = trace.frames[stack.frameId]
    return {
      id: stackId + 2,
      callFrame: {
        functionName: frame?.name || '(anonymous)',
        scriptId: String((frame?.resourceId ?? -1) + 1),
        url: frame?.resourceId === undefined ? '' : trace.resources[frame.resourceId] ?? '',
        lineNumber: frame?.line === undefined ? -1 : Math.max(0, frame.line - 1),
        columnNumber: frame?.column === undefined ? -1 : Math.max(0, frame.column - 1),
      },
      children: children.get(stackId + 2) ?? [],
    }
  })]
  const samples = trace.samples.filter((sample) => sample.stackId !== undefined).sort((left, right) => left.timestamp - right.timestamp)
  let previous = startedAt
  const timeDeltas = samples.map((sample) => {
    const delta = Math.max(0, sample.timestamp - previous)
    previous = sample.timestamp
    return microseconds(delta)
  })
  const startTime = microseconds(timeOrigin + startedAt)
  return [
    {
      cat: 'disabled-by-default-v8.cpu_profiler', name: 'Profile', ph: 'P', pid, tid,
      ts: startTime, id: profileId, args: { data: { startTime, source: 'SelfProfiling' } },
    },
    {
      cat: 'disabled-by-default-v8.cpu_profiler', name: 'ProfileChunk', ph: 'P', pid, tid,
      ts: samples.length ? microseconds(timeOrigin + samples.at(-1)!.timestamp) : startTime,
      id: profileId,
      args: {
        data: {
          cpuProfile: { nodes, samples: samples.map((sample) => sample.stackId! + 2) },
          timeDeltas,
          source: 'SelfProfiling',
        },
      },
    },
  ]
}

function measureEvent(measure: PerfMeasure, timeOrigin: number, pid: number, tid: number): ChromeTraceEvent {
  return {
    cat: 'motregen.phase',
    name: measure.phase,
    ph: 'X',
    pid,
    tid,
    ts: microseconds(timeOrigin + measure.startTime),
    dur: microseconds(measure.duration),
    args: measure.detail ?? {},
  }
}

function metadataEvent(name: string, pid: number, tid: number, args: Record<string, unknown>): ChromeTraceEvent {
  return { cat: '__metadata', name, ph: 'M', pid, tid, ts: 0, args }
}

function microseconds(milliseconds: number): number {
  return Math.round(milliseconds * 1_000)
}

function phaseOrder(phase: ChromeTraceEvent['ph']): number {
  return phase === 'M' ? 0 : phase === 'P' ? 1 : 2
}

function browserPlatform(): string {
  const data = navigator as Navigator & { userAgentData?: { platform?: string } }
  return data.userAgentData?.platform || navigator.platform || 'unknown'
}

/** Wacht de opnameduur af, of korter als de gebruiker op Stop tikt (PO 2026-10-07). */
function delay(milliseconds: number, stop?: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (stop?.aborted) { resolve(); return }
    const timer = globalThis.setTimeout(resolve, milliseconds)
    stop?.addEventListener('abort', () => { globalThis.clearTimeout(timer); resolve() }, { once: true })
  })
}
