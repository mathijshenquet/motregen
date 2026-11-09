// U109: CPU-kosten per fase (laden, scrubben, afspelen, modus wisselen, rust) en per bronbestand, uit een
// perf:modes-trace met CPU-profiel (MOTREGEN_PERF_MODES_CPU_PROFILE=1 MOTREGEN_PERF_MODES_TRACE_ALL=1).
// Zelftijd in ms per seconde fase, per draad (hoofddraad / workers), bronposities via de sourcemaps.
// Gebruik: pnpm exec tsx scripts/u109-phase-costs.ts <rapport.json> <dist-map> [top-N]
import { existsSync, readFileSync } from 'node:fs'
import { TraceMap, originalPositionFor } from '@jridgewell/trace-mapping'

interface CallFrame { functionName: string; url: string; lineNumber: number; columnNumber: number; codeType?: string }
interface ProfileNode { id: number; parent?: number; callFrame: CallFrame }
interface TraceEvent { name: string; ph: string; ts: number; pid: number; tid: number; id?: string; args?: { name?: string; data?: { startTime?: number; cpuProfile?: { nodes?: ProfileNode[]; samples?: number[] }; timeDeltas?: number[] } } }
interface PhaseWindow { name: string; startMs: number; endMs: number }

export function bucketOf(source: string): string {
  const pkg = /node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/.exec(source)
  if (pkg) return pkg[1]!
  const local = /\/src\/(.+)$/.exec(source)
  return local ? local[1]! : source
}

export function phaseCosts(events: readonly TraceEvent[], phases: readonly PhaseWindow[], distDirectory: string) {
  const threadNames = new Map<string, string>()
  for (const event of events) if (event.ph === 'M' && event.name === 'thread_name') threadNames.set(`${event.pid}:${event.tid}`, event.args?.name ?? '')
  const navigation = events.find((event) => event.name === 'navigationStart')
  if (!navigation) throw new Error('navigationStart ontbreekt in de trace')
  const maps = new Map<string, TraceMap | null>()
  const bucketFor = (frame: CallFrame): string => {
    if (!frame.url) return frame.functionName ? `(${frame.functionName})` : '(native)'
    const file = `${distDirectory}/${frame.url.split('/').slice(-2).join('/')}.map`
    if (!maps.has(file)) maps.set(file, existsSync(file) ? new TraceMap(readFileSync(file, 'utf8')) : null)
    const map = maps.get(file)
    const original = map ? originalPositionFor(map, { line: frame.lineNumber + 1, column: frame.columnNumber }) : null
    return original?.source ? bucketOf(original.source) : frame.url.split('/').pop()!
  }
  const profiles = new Map<string, { thread: string; startTime: number; nodes: Map<number, ProfileNode>; samples: number[]; deltas: number[] }>()
  for (const event of events) {
    if (event.name === 'Profile' && event.id) profiles.set(event.id, { thread: threadNames.get(`${event.pid}:${event.tid}`) ?? '', startTime: event.args?.data?.startTime ?? event.ts, nodes: new Map(), samples: [], deltas: [] })
    if (event.name === 'ProfileChunk' && event.id) {
      const profile = profiles.get(event.id)
      if (!profile) continue
      for (const node of event.args?.data?.cpuProfile?.nodes ?? []) profile.nodes.set(node.id, node)
      profile.samples.push(...event.args?.data?.cpuProfile?.samples ?? [])
      profile.deltas.push(...event.args?.data?.timeDeltas ?? [])
    }
  }
  const result = phases.map((phase) => ({ phase: phase.name, seconds: (phase.endMs - phase.startMs) / 1000, main: new Map<string, number>(), workers: new Map<string, number>() }))
  for (const profile of profiles.values()) {
    const kind = profile.thread === 'CrRendererMain' ? 'main' : /DedicatedWorker/.test(profile.thread) ? 'workers' : null
    if (!kind) continue
    let ts = profile.startTime
    for (let index = 0; index < profile.samples.length; index++) {
      ts += profile.deltas[index] ?? 0
      const node = profile.nodes.get(profile.samples[index]!)
      if (!node) continue
      const name = node.callFrame.functionName
      if (name === '(idle)' || name === '(program)') continue
      const pageMs = (ts - navigation.ts) / 1000
      const slot = result.find((_, phaseIndex) => pageMs >= phases[phaseIndex]!.startMs && pageMs < phases[phaseIndex]!.endMs)
      if (!slot) continue
      const durationMs = (profile.deltas[index + 1] ?? 0) / 1000
      const bucket = bucketFor(node.callFrame)
      slot[kind].set(bucket, (slot[kind].get(bucket) ?? 0) + durationMs)
    }
  }
  return result
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const [reportPath, distDirectory, top = '12'] = process.argv.slice(2)
  if (!reportPath || !distDirectory) throw new Error('Gebruik: u109-phase-costs.ts <rapport.json> <dist-map> [top-N]')
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as { phaseWindows?: PhaseWindow[] }
  if (!report.phaseWindows) throw new Error('Rapport zonder phaseWindows (rig van vóór U109)')
  const trace = JSON.parse(readFileSync(reportPath.replace(/\.json$/, '.trace'), 'utf8')) as { traceEvents: TraceEvent[] } | TraceEvent[]
  for (const row of phaseCosts(Array.isArray(trace) ? trace : trace.traceEvents, report.phaseWindows, distDirectory)) {
    const perSecond = (map: Map<string, number>) => [...map].sort((a, b) => b[1] - a[1]).slice(0, Number(top)).map(([bucket, ms]) => `${(ms / row.seconds).toFixed(1)} ${bucket}`)
    const total = (map: Map<string, number>) => [...map.values()].reduce((sum, ms) => sum + ms, 0) / row.seconds
    console.log(`\n## ${row.phase} (${row.seconds.toFixed(1)} s): hoofddraad ${total(row.main).toFixed(0)} ms/s, workers ${total(row.workers).toFixed(0)} ms/s`)
    console.log('hoofddraad:', perSecond(row.main).join(' · '))
    console.log('workers:', perSecond(row.workers).join(' · '))
  }
}
