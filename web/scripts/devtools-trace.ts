import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { originalPositionFor, TraceMap } from '@jridgewell/trace-mapping'

// Leest een Chrome DevTools-trace (Performance-paneel, "enhanced trace" met ingesloten sourcemaps) en
// rapporteert (1) hoofddraad-taken boven een drempel met de eigen functies die er volgens het CPU-profiel in
// lopen, en (2) per animatieframe rond een gekozen moment wat de renderer deed (stijl, layout, paint,
// gemiste frames, niet-gecomposite animaties). Track U58, PO-trace "laden + zoekpil openen".
// Gebruik: pnpm exec tsx scripts/devtools-trace.ts TRACE.json[.gz] [--tasks=50] [--window=VAN_MS,TOT_MS] [--events]

interface TraceEvent { name: string; cat: string; ph: string; pid: number; tid: number; ts: number; dur?: number; args?: Record<string, any>; id?: string; id2?: { local?: string } }
const [file, ...flags] = process.argv.slice(2)
if (!file) throw new Error('usage: pnpm exec tsx scripts/devtools-trace.ts TRACE.json[.gz] [--tasks=50] [--window=VAN_MS,TOT_MS] [--events]')
const flag = (name: string) => flags.find((candidate) => candidate.startsWith(`--${name}`))?.split('=')[1]
const raw = readFileSync(file)
const trace = JSON.parse((file.endsWith('.gz') ? gunzipSync(raw) : raw).toString('utf8')) as { traceEvents: TraceEvent[]; metadata?: { sourceMaps?: Array<{ url: string; sourceMap: any }> } }
const events = trace.traceEvents

// De renderer met de meeste events is de pagina; daarvan de hoofddraad en de compositor.
const threadNames = new Map<string, string>()
for (const event of events) if (event.name === 'thread_name') threadNames.set(`${event.pid}:${event.tid}`, event.args!.name)
const perThread = new Map<string, number>()
for (const event of events) perThread.set(`${event.pid}:${event.tid}`, (perThread.get(`${event.pid}:${event.tid}`) ?? 0) + 1)
const mainKey = [...perThread].filter(([key]) => threadNames.get(key) === 'CrRendererMain').sort((left, right) => right[1] - left[1])[0]![0]
const [mainPid, mainTid] = mainKey.split(':').map(Number) as [number, number]
const main = events.filter((event) => event.pid === mainPid && event.tid === mainTid && event.ph === 'X').sort((left, right) => left.ts - right.ts)
const origin = main[0]!.ts
const ms = (ts: number) => (ts - origin) / 1000
console.log(`renderer ${mainPid}, hoofddraad ${mainTid}; ${main.length} tijdvakken over ${(ms(main.at(-1)!.ts) / 1000).toFixed(1)} s`)

const maps = new Map((trace.metadata?.sourceMaps ?? []).map((entry) => [entry.url, new TraceMap(entry.sourceMap)]))
function describeFrame(frame: { functionName?: string; url?: string; lineNumber?: number; columnNumber?: number }): string {
  const map = frame.url ? maps.get(frame.url) : undefined
  if (map && frame.lineNumber !== undefined && frame.lineNumber >= 0) {
    const position = originalPositionFor(map, { line: frame.lineNumber + 1, column: frame.columnNumber ?? 0 })
    if (position.source) return `${position.name ?? frame.functionName ?? '(anoniem)'} ${position.source.replace(/^.*?(src|node_modules)\//, '$1/').replace(/node_modules\/\.pnpm\/[^/]+\/node_modules\//, 'nm/')}:${position.line}`
  }
  return frame.url ? `${frame.functionName || '(anoniem)'} ${frame.url.split('/').pop()}:${frame.lineNumber}` : frame.functionName || '(programma)'
}

// CPU-profiel van de hoofddraad: samples met tijdstempel en eigen functie.
const profileStart = new Map<string, number>()
const profileClock = new Map<string, number>()
for (const event of events) if (event.name === 'Profile' && event.pid === mainPid && event.tid === mainTid) profileStart.set(event.id ?? '', event.args?.data?.startTime ?? event.ts)
const nodes = new Map<number, { callFrame: any; parent?: number }>()
const samples: Array<{ ts: number; node: number }> = []
for (const event of events) {
  if (event.name !== 'ProfileChunk' || event.pid !== mainPid || !profileStart.has(event.id ?? '')) continue
  const data = event.args!.data
  for (const node of data.cpuProfile?.nodes ?? []) nodes.set(node.id, { callFrame: node.callFrame, parent: node.parent })
  const chunkSamples: number[] = data.cpuProfile?.samples ?? []
  const deltas: number[] = data.timeDeltas ?? []
  // De eerste delta van een chunk telt vanaf het vorige sample van hetzelfde profiel (id); het profiel
  // zelf begint op de startTime van zijn Profile-event.
  let cursor = profileClock.get(event.id ?? '') ?? profileStart.get(event.id ?? '') ?? event.ts
  chunkSamples.forEach((node, index) => { cursor += deltas[index] ?? 0; samples.push({ ts: cursor, node }) })
  profileClock.set(event.id ?? '', cursor)
}
function selfTimeBetween(from: number, to: number): Array<[string, number]> {
  const totals = new Map<string, number>()
  for (let index = 0; index < samples.length - 1; index++) {
    const sample = samples[index]!
    if (sample.ts < from || sample.ts >= to) continue
    const frame = nodes.get(sample.node)?.callFrame
    if (!frame || frame.functionName === '(idle)') continue
    const label = describeFrame(frame)
    totals.set(label, (totals.get(label) ?? 0) + Math.min(samples[index + 1]!.ts, to) - sample.ts)
  }
  return [...totals].sort((left, right) => right[1] - left[1])
}

const taskThreshold = Number(flag('tasks') ?? 50)
const tasks = main.filter((event) => event.name === 'RunTask' && (event.dur ?? 0) >= taskThreshold * 1000)
console.log(`\n== hoofddraad-taken ≥ ${taskThreshold} ms: ${tasks.length}, samen ${Math.round(tasks.reduce((sum, task) => sum + task.dur! / 1000, 0))} ms`)
const INTERESTING = new Set(['FunctionCall', 'EvaluateScript', 'v8.compile', 'Layout', 'UpdateLayoutTree', 'Paint', 'PrePaint', 'Layerize', 'Commit', 'MajorGC', 'MinorGC', 'TimerFire', 'FireAnimationFrame', 'HandlePostMessage', 'EventDispatch', 'ParseHTML', 'RunMicrotasks', 'XHRReadyStateChange', 'v8.wasm.streamFromResponseCallback', 'IntersectionObserverController::computeIntersections', 'ResizeObserverController::deliverObservations'])
for (const task of tasks) {
  const end = task.ts + task.dur!
  const inside = main.filter((event) => event.ts >= task.ts && event.ts + (event.dur ?? 0) <= end && event !== task && INTERESTING.has(event.name))
  // Alleen de buitenste van de interessante events: wat niet in een ander interessant event ligt.
  const outer = inside.filter((event) => !inside.some((other) => other !== event && other.ts <= event.ts && other.ts + (other.dur ?? 0) >= event.ts + (event.dur ?? 0) && (other.dur ?? 0) > (event.dur ?? 0)))
  const byName = new Map<string, number>()
  for (const event of outer) {
    const detail = event.name === 'FunctionCall' ? describeFrame(event.args?.data ?? {}) : event.name === 'EventDispatch' ? `event ${event.args?.data?.type}` : event.name === 'TimerFire' ? 'timer' : event.name
    byName.set(detail, (byName.get(detail) ?? 0) + (event.dur ?? 0) / 1000)
  }
  console.log(`\nt=${ms(task.ts).toFixed(0)} ms, ${(task.dur! / 1000).toFixed(0)} ms: ${[...byName].sort((left, right) => right[1] - left[1]).slice(0, 4).map(([name, duration]) => `${name} ${duration.toFixed(0)} ms`).join(' | ')}`)
  console.log(`   profiel: ${selfTimeBetween(task.ts, end).slice(0, 6).map(([label, duration]) => `${label} ${(duration / 1000).toFixed(0)}`).join(' | ')}`)
}

if (flags.includes('--events')) {
  console.log('\n== invoer-events op de hoofddraad')
  for (const event of main) if (event.name === 'EventDispatch' && /click|pointerdown|pointerup|keydown|focus/.test(event.args?.data?.type ?? '')) console.log(`t=${ms(event.ts).toFixed(0)} ms ${event.args!.data.type} (${((event.dur ?? 0) / 1000).toFixed(1)} ms)`)
}

const windowFlag = flag('window')
if (windowFlag) {
  const [from, to] = windowFlag.split(',').map((value) => origin + Number(value) * 1000) as [number, number]
  const within = (event: TraceEvent) => event.ts >= from && event.ts < to
  console.log(`\n== venster ${windowFlag} ms`)
  const sum = (name: string) => { const matching = main.filter((event) => event.name === name && within(event)); return `${name} ${matching.length}× ${(matching.reduce((total, event) => total + (event.dur ?? 0), 0) / 1000).toFixed(1)} ms (langste ${(Math.max(0, ...matching.map((event) => event.dur ?? 0)) / 1000).toFixed(1)})` }
  for (const name of ['UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'Layerize', 'Commit', 'FireAnimationFrame', 'FunctionCall', 'RunMicrotasks']) console.log('  ' + sum(name))
  const forced = main.filter((event) => (event.name === 'Layout' || event.name === 'UpdateLayoutTree') && within(event) && main.some((parent) => (parent.name === 'FunctionCall' || parent.name === 'FireAnimationFrame' || parent.name === 'EventDispatch' || parent.name === 'TimerFire') && parent.ts <= event.ts && parent.ts + (parent.dur ?? 0) >= event.ts + (event.dur ?? 0)))
  console.log(`  afgedwongen stijl/layout (binnen script): ${forced.length}× ${(forced.reduce((total, event) => total + (event.dur ?? 0), 0) / 1000).toFixed(1)} ms`)
  for (const event of forced.slice(0, 12)) {
    const stack = event.args?.beginData?.stackTrace ?? event.args?.data?.stackTrace ?? event.args?.beginData?.stack
    console.log(`    t=${ms(event.ts).toFixed(0)} ${event.name} ${((event.dur ?? 0) / 1000).toFixed(2)} ms ${Array.isArray(stack) ? stack.slice(0, 3).map(describeFrame).join(' ← ') : ''}`)
  }
  // Frames: hoofddraadframes en wat de compositor ervan vond.
  const begin = events.filter((event) => event.pid === mainPid && event.name === 'BeginMainThreadFrame' && within(event)).map((event) => event.ts).sort((left, right) => left - right)
  const gaps = begin.slice(1).map((ts, index) => (ts - begin[index]!) / 1000)
  console.log(`  hoofddraadframes: ${begin.length}; tussenpozen > 16,7 ms: ${gaps.filter((gap) => gap > 16.7 * 1.2).length} (${gaps.filter((gap) => gap > 16.7 * 1.2).map((gap) => gap.toFixed(0)).join(', ')})`)
  const reporters = events.filter((event) => event.name === 'PipelineReporter' && event.ph === 'b' && within(event))
  const states = new Map<string, number>()
  for (const reporter of reporters) { const state = reporter.args?.frame_reporter?.state ?? reporter.args?.chrome_frame_reporter?.state ?? 'onbekend'; states.set(state, (states.get(state) ?? 0) + 1) }
  console.log(`  compositorframes (PipelineReporter): ${[...states].map(([state, count]) => `${state} ${count}`).join(', ')}`)
  const animations = events.filter((event) => event.name === 'Animation' && event.pid === mainPid && within(event) && (event.ph === 'b' || event.ph === 'n'))
  const described = new Map<string, number>()
  for (const animation of animations) {
    const data = animation.args?.data
    if (!data) continue
    const label = `${data.nodeName ?? '?'} ${data.name ?? data.displayName ?? ''} compositeFailed=${data.compositeFailed ?? '—'} ${data.unsupportedProperties ? `niet-composite: ${data.unsupportedProperties.join(',')}` : ''}`
    described.set(label, (described.get(label) ?? 0) + 1)
  }
  console.log('  animaties/transities:')
  for (const [label, count] of described) console.log(`    ${count}× ${label}`)
  console.log(`  eigen tijd volgens het profiel: ${selfTimeBetween(from, to).slice(0, 10).map(([label, duration]) => `${label} ${(duration / 1000).toFixed(1)}`).join(' | ')}`)
}
