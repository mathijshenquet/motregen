// U102: waar gaat de tijd tot "histogram compleet" heen bij een warm bezoek? Leest een rapport en Chrome-trace
// van `pnpm perf:modes --trace` en splitst de wandkloktijd exclusief in mrf-decode per bron, overige CPU en
// wachten. Gebruik: pnpm exec tsx scripts/perf-trace-split.ts [--quota 0.4] <rapport.json>... (trace ernaast als .trace;
// --quota = de renderer-CPU-quota van het profiel, telefoon 40 %)
import { readFileSync } from 'node:fs'
import type { Manifest } from '../src/core/contract'
import type { LoadFrameTrace, LoadTraceSnapshot, PerfMeasure } from '../src/core/perf'
import { classifyRequest, histogramFrames, mapBufferFrames, type MapMode, type VisitReport } from './perf-modes-report'

export interface Task { startMs: number; endMs: number; cpuMs: number }
export interface DecodeTask extends Task { source: string }
export interface FrameState { requestedMs: number; bytesReadyMs: number; decodeStartMs: number; decodedMs: number }

export const WAIT_KINDS = ['wachtrij', 'netwerk', 'niet gevraagd', 'idle'] as const
export type WaitKind = typeof WAIT_KINDS[number]

export interface Split {
  untilMs: number
  decodeWallMs: Record<string, number>
  decodeCpuMs: Record<string, number>
  otherWallMs: number
  otherCpuMs: { main: number; workers: number }
  waitMs: Record<WaitKind, number>
}

/**
 * Elke milliseconde telt één keer: loopt er een decode, dan is hij van die bron (gelijk verdeeld bij meer
 * tegelijk); anders, draait de hoofddraad of een andere worker, dan "overige CPU"; anders wachten. Wachten
 * heet "wachtrij" als een gewenst frame binnen is maar nog niet op een worker zit, "netwerk" als het onderweg is
 * (warm: uit de cache), "niet gevraagd" als het nog niet is aangevraagd (U49-budget, laagtimers), anders idle.
 */
export function splitUntil(untilMs: number, decodes: readonly DecodeTask[], main: readonly Task[], workers: readonly Task[], wanted: readonly FrameState[]): Split {
  const bins = Math.max(0, Math.ceil(untilMs))
  const sources = [...new Set(decodes.map((task) => task.source))]
  const activeBySource = new Map(sources.map((source) => [source, new Uint16Array(bins)]))
  const busy = new Uint8Array(bins)
  const mark = (task: Task, apply: (bin: number) => void) => {
    for (let bin = Math.max(0, Math.floor(task.startMs)); bin < Math.min(bins, Math.ceil(task.endMs)); bin++) apply(bin)
  }
  for (const task of decodes) mark(task, (bin) => { activeBySource.get(task.source)![bin]!++ })
  for (const task of [...main, ...workers]) mark(task, (bin) => { busy[bin] = 1 })

  const decodeWallMs: Record<string, number> = Object.fromEntries(sources.map((source) => [source, 0]))
  const waitMs: Record<WaitKind, number> = { wachtrij: 0, netwerk: 0, 'niet gevraagd': 0, idle: 0 }
  let otherWallMs = 0
  for (let bin = 0; bin < bins; bin++) {
    const total = sources.reduce((sum, source) => sum + activeBySource.get(source)![bin]!, 0)
    if (total > 0) {
      for (const source of sources) decodeWallMs[source]! += activeBySource.get(source)![bin]! / total
      continue
    }
    if (busy[bin]) { otherWallMs++; continue }
    const t = bin + 0.5
    if (wanted.some((frame) => frame.bytesReadyMs <= t && t < frame.decodeStartMs)) waitMs.wachtrij++
    else if (wanted.some((frame) => frame.requestedMs <= t && t < frame.bytesReadyMs)) waitMs.netwerk++
    else if (wanted.some((frame) => t < frame.requestedMs)) waitMs['niet gevraagd']++
    else waitMs.idle++
  }
  const cpuWithin = (tasks: readonly Task[]) => tasks.reduce((sum, task) => {
    const overlap = Math.max(0, Math.min(task.endMs, untilMs) - Math.max(task.startMs, 0))
    return sum + (task.endMs > task.startMs ? task.cpuMs * overlap / (task.endMs - task.startMs) : 0)
  }, 0)
  return {
    untilMs,
    decodeWallMs,
    decodeCpuMs: Object.fromEntries(sources.map((source) => [source, cpuWithin(decodes.filter((task) => task.source === source))])),
    otherWallMs,
    otherCpuMs: { main: cpuWithin(main), workers: cpuWithin(workers) },
    waitMs,
  }
}

interface TraceEvent { ph: string; name: string; cat?: string; pid: number; tid: number; ts: number; dur?: number; tdur?: number; args?: { name?: string } }
interface TracedVisit { manifest: Manifest; loadTrace: LoadTraceSnapshot; syncMs: number; decodes: PerfMeasure[] }

/** Buitenste taken per draad, in paginamilliseconden; geneste taken tellen niet dubbel. */
function threadTasks(events: readonly TraceEvent[], pid: number, tid: number, offsetMs: number): Task[] {
  const tasks: Task[] = []
  let openUntil = -Infinity
  for (const event of events) {
    if (event.pid !== pid || event.tid !== tid || event.ph !== 'X' || event.dur === undefined) continue
    if (event.ts < openUntil) continue
    openUntil = event.ts + event.dur
    tasks.push({ startMs: event.ts / 1000 - offsetMs, endMs: (event.ts + event.dur) / 1000 - offsetMs, cpuMs: (event.tdur ?? event.dur) / 1000 })
  }
  return tasks
}

function analyse(reportPath: string, quota: number): string {
  const report = JSON.parse(readFileSync(reportPath, 'utf8')) as VisitReport & { traced?: TracedVisit }
  const traced = report.traced
  if (!traced) throw new Error(`${reportPath}: geen trace (draai perf:modes met --trace)`)
  const until = report.milestones.histogramCompleteMs
  if (until === null) throw new Error(`${reportPath}: histogram niet compleet`)
  const raw = JSON.parse(readFileSync(reportPath.replace(/\.json$/, '.trace'), 'utf8')) as TraceEvent[] | { traceEvents: TraceEvent[] }
  const events = (Array.isArray(raw) ? raw : raw.traceEvents).sort((left, right) => left.ts - right.ts)

  const sync = events.find((event) => event.name === 'u102-trace-sync' && event.cat?.includes('blink.user_timing'))
  if (!sync) throw new Error('synchronisatiemerk niet in de trace')
  const offsetMs = sync.ts / 1000 - traced.syncMs
  const threadName = new Map(events.filter((event) => event.ph === 'M' && event.name === 'thread_name').map((event) => [`${event.pid}:${event.tid}`, event.args?.name ?? '']))
  const processName = new Map(events.filter((event) => event.ph === 'M' && event.name === 'process_name').map((event) => [event.pid, event.args?.name ?? '']))
  const renderer = sync.pid
  const mainTid = [...threadName].find(([key, name]) => key.startsWith(`${renderer}:`) && name === 'CrRendererMain')?.[0].split(':')[1]
  if (!mainTid) throw new Error('CrRendererMain niet gevonden')
  const workerTids = [...threadName].filter(([key, name]) => key.startsWith(`${renderer}:`) && name.startsWith('DedicatedWorker')).map(([key]) => Number(key.split(':')[1]))
  const main = threadTasks(events, renderer, Number(mainTid), offsetMs)
  const workerTasks = new Map(workerTids.map((tid) => [tid, threadTasks(events, renderer, tid, offsetMs)]))

  // Decodefase → frame (via het decodemoment in de LoadTrace) → bron; en → de workertaak die hem uitvoerde.
  const frames = traced.loadTrace.frames
  const rainChunk = (url: string) => /\/chunks\/(rtcor|nowcast|seamless|harmonie)-\d/.test(new URL(url).pathname)
  const frameOf = (measure: PerfMeasure): LoadFrameTrace | undefined => {
    const end = measure.startTime + measure.duration
    const field = String(measure.detail?.field ?? '')
    const candidates = frames.filter((frame) => frame.decodedMs !== undefined && Math.abs(frame.decodedMs - end) <= 5)
    const fits = (frame: LoadFrameTrace) => field === 'rain_rate' ? rainChunk(frame.url) : frame.url.includes(`-${field}-`)
    return candidates.filter(fits).sort((left, right) => Math.abs(left.decodedMs! - end) - Math.abs(right.decodedMs! - end))[0]
  }
  const claimed = new Set<Task>()
  const decodeTasks: DecodeTask[] = []
  const decodeDuration = new Map<string, number>()
  const decodeFrameKey = new Map<DecodeTask, LoadFrameTrace>()
  const unmatchedFields = new Map<string, number>()
  const sourceOf = (frame: LoadFrameTrace | undefined) => frame ? classifyRequest(frame.url) : 'onbekend'
  for (const measure of [...traced.decodes].sort((left, right) => left.startTime - right.startTime)) {
    const end = measure.startTime + measure.duration
    const frame = frameOf(measure)
    if (frame) decodeDuration.set(`${frame.url}#${frame.frameIndex}`, measure.duration)
    // De workertaak eindigt vóór het antwoord op de hoofddraad binnen is en duurt minstens de gemeten decode.
    let best: Task | undefined
    for (const tasks of workerTasks.values()) {
      for (const task of tasks) {
        if (claimed.has(task) || task.endMs > end + 1 || task.endMs < end - 2_000 || task.endMs - task.startMs < measure.duration - 1) continue
        if (!best || task.endMs > best.endMs) best = task
      }
    }
    if (best) claimed.add(best)
    const task = { ...(best ?? { startMs: end - measure.duration, endMs: end, cpuMs: measure.duration }), source: sourceOf(frame) }
    decodeTasks.push(task)
    if (frame) decodeFrameKey.set(task, frame)
    else unmatchedFields.set(String(measure.detail?.field), (unmatchedFields.get(String(measure.detail?.field)) ?? 0) + 1)
  }
  const otherWorkers = [...workerTasks.values()].flat().filter((task) => !claimed.has(task))

  const mode = report.mode as MapMode
  const now = Date.parse(traced.manifest.now)
  const keyOf = (frame: { url: string; frameIndex: number }) => `${new URL(frame.url, 'https://x/').pathname.replace(/^.*\/chunks\//, '')}#${frame.frameIndex}`
  const traceByKey = new Map(frames.map((frame) => [keyOf(frame), frame]))
  const wantedHistogram = histogramFrames(traced.manifest, mode)
  const wanted: FrameState[] = wantedHistogram.flatMap((frame) => {
    const traceFrame = traceByKey.get(keyOf(frame))
    if (!traceFrame?.decodedMs) return []
    const decodedMs = traceFrame.decodedMs
    const bytesReadyMs = traceFrame.bytesReadyMs ?? traceFrame.requestedMs
    return [{ requestedMs: traceFrame.requestedMs, bytesReadyMs, decodeStartMs: Math.max(bytesReadyMs, decodedMs - (decodeDuration.get(`${traceFrame.url}#${traceFrame.frameIndex}`) ?? 0)), decodedMs }]
  })
  const split = splitUntil(until, decodeTasks, main, otherWorkers, wanted)

  // Welke decodes vóór "histogram compleet" had de kaart in de eerste 10 s ook nodig?
  const mapKeys = new Set(mapBufferFrames(traced.manifest, mode, now).map(keyOf))
  for (const frame of frames) if (['map', 'motion', 'prefetch'].includes(frame.layer) && frame.requestedMs <= 10_000) mapKeys.add(keyOf(frame))
  const histogramKeys = new Set(wantedHistogram.map(keyOf))
  const decodedBefore = frames.filter((frame) => frame.decodedMs !== undefined && frame.decodedMs <= until)
  const groups = { kaart: [] as LoadFrameTrace[], 'alleen histogram': [] as LoadFrameTrace[], 'overig (tabel, Lucht-lagen …)': [] as LoadFrameTrace[] }
  for (const frame of decodedBefore) {
    const key = keyOf(frame)
    groups[mapKeys.has(key) ? 'kaart' : histogramKeys.has(key) ? 'alleen histogram' : 'overig (tabel, Lucht-lagen …)'].push(frame)
  }
  const histogramForMap = wantedHistogram.filter((frame) => mapKeys.has(keyOf(frame))).length

  const gpu = [...processName].find(([, name]) => name.includes('GPU'))?.[0]
  const gpuCpuMs = gpu === undefined ? 0 : [...threadName].filter(([key]) => key.startsWith(`${gpu}:`)).flatMap(([key]) => threadTasks(events, gpu, Number(key.split(':')[1]), offsetMs))
    .reduce((sum, task) => sum + (task.endMs > 0 && task.startMs < until ? task.cpuMs : 0), 0)

  // Onder de renderer-quota delen alle renderer-draden samen `quota` CPU: een open taak kan op quota staan te
  // wachten. Daarom de CPU-tijd per draad tegen het budget quota × wandklok.
  const rendererThreads = [...threadName].filter(([key]) => key.startsWith(`${renderer}:`)).map(([key, name]) => ({ tid: Number(key.split(':')[1]), name }))
  const cpuUntil = (tasks: readonly Task[]) => tasks.reduce((sum, task) => {
    const overlap = Math.max(0, Math.min(task.endMs, until) - Math.max(task.startMs, 0))
    return sum + (task.endMs > task.startMs ? task.cpuMs * overlap / (task.endMs - task.startMs) : 0)
  }, 0)
  let threadPoolCpuMs = 0, compositorCpuMs = 0, restCpuMs = 0
  for (const thread of rendererThreads) {
    if (thread.name === 'CrRendererMain' || thread.name.startsWith('DedicatedWorker')) continue
    const cpu = cpuUntil(threadTasks(events, renderer, thread.tid, offsetMs))
    if (thread.name.startsWith('ThreadPool')) threadPoolCpuMs += cpu
    else if (thread.name === 'Compositor') compositorCpuMs += cpu
    else restCpuMs += cpu
  }
  const mainCpuMs = split.otherCpuMs.main
  const decodeCpuBySource = split.decodeCpuMs
  const decodeCpuTotal = Object.values(decodeCpuBySource).reduce((sum, value) => sum + value, 0)
  const rendererCpuMs = decodeCpuTotal + mainCpuMs + split.otherCpuMs.workers + threadPoolCpuMs + compositorCpuMs + restCpuMs
  const budgetMs = quota * until
  const groupCpu = (group: LoadFrameTrace[]) => {
    const members = new Set(group)
    return cpuUntil(decodeTasks.filter((task) => { const frame = decodeFrameKey.get(task); return frame !== undefined && members.has(frame) }))
  }

  const ms = (value: number) => `${Math.round(value).toLocaleString('nl-NL')} ms`
  const ofBudget = (value: number) => `${(value / budgetMs * 100).toLocaleString('nl-NL', { maximumFractionDigits: 0 })} %`
  const known = ['rtcor', 'nowcast', 'seamless', 'harmonie']
  const otherSources = Object.keys(decodeCpuBySource).filter((source) => !known.includes(source))
  const rows: string[] = []
  rows.push(`### ${report.profile}, ${report.visit}, ${mode}: histogram compleet na ${ms(until)} (loadavg ${report.loadAverage} bij de start)`)
  rows.push('')
  rows.push(`Renderer-CPU-budget = ${Math.round(quota * 100)} % × ${ms(until)} = ${ms(budgetMs)}; gebruikt ${ms(rendererCpuMs)} (${ofBudget(rendererCpuMs)}).`)
  rows.push('')
  rows.push('| deel | CPU-tijd | % van het budget |')
  rows.push('| --- | ---: | ---: |')
  for (const source of known) rows.push(`| (a) mrf-decode ${source} | ${ms(decodeCpuBySource[source] ?? 0)} | ${ofBudget(decodeCpuBySource[source] ?? 0)} |`)
  const otherDecode = otherSources.reduce((sum, source) => sum + decodeCpuBySource[source]!, 0)
  rows.push(`| (a) mrf-decode overig (${otherSources.join(', ') || '—'}) | ${ms(otherDecode)} | ${ofBudget(otherDecode)} |`)
  rows.push(`| (b) hoofddraad | ${ms(mainCpuMs)} | ${ofBudget(mainCpuMs)} |`)
  rows.push(`| (b) thread-pool (V8: JIT-compilatie en GC, scriptstreaming, raster) | ${ms(threadPoolCpuMs)} | ${ofBudget(threadPoolCpuMs)} |`)
  rows.push(`| (b) compositor en overige renderer-draden | ${ms(compositorCpuMs + restCpuMs)} | ${ofBudget(compositorCpuMs + restCpuMs)} |`)
  rows.push(`| (b) andere workers (kaarttegels, isolijnen …) | ${ms(split.otherCpuMs.workers)} | ${ofBudget(split.otherCpuMs.workers)} |`)
  rows.push(`| (c) budget ongebruikt | ${ms(Math.max(0, budgetMs - rendererCpuMs))} | ${ofBudget(Math.max(0, budgetMs - rendererCpuMs))} |`)
  rows.push('')
  rows.push(`- Wandklok zonder enige renderertaak in uitvoering: wachtrij (U52) ${ms(split.waitMs.wachtrij)}, nog niet gevraagd (U49-budget, laagtimers) ${ms(split.waitMs['niet gevraagd'])}, netwerk/cache ${ms(split.waitMs.netwerk)}, idle ${ms(split.waitMs.idle)}.`)
  rows.push(`- Decodes vóór histogram compleet: ${decodedBefore.length} frames, ${ms(decodeCpuTotal)} CPU. Kaart (frame rond nu, afspeelbuffer, of door de kaart gevraagd in de eerste 10 s): ${groups.kaart.length} frames, ${ms(groupCpu(groups.kaart))}; alleen histogram: ${groups['alleen histogram'].length}, ${ms(groupCpu(groups['alleen histogram']))}; overig (tabel, andere lagen): ${groups['overig (tabel, Lucht-lagen …)'].length}, ${ms(groupCpu(groups['overig (tabel, Lucht-lagen …)']))}.`)
  rows.push(`- Van de ${wantedHistogram.length} histogramframes had de kaart er ${histogramForMap} in de eerste 10 s ook nodig.`)
  const last = [...wanted].sort((left, right) => right.decodedMs - left.decodedMs)[0]
  const lastTrace = last && frames.find((frame) => frame.decodedMs === last.decodedMs)
  if (last && lastTrace) rows.push(`- Laatste histogramframe (${classifyRequest(lastTrace.url)}, laag ${lastTrace.layer}): gevraagd na ${ms(last.requestedMs)}, bytes binnen na ${ms(last.bytesReadyMs)}, op een worker na ${ms(last.decodeStartMs)}, klaar na ${ms(last.decodedMs)}. Een histogramframe stond gemiddeld ${ms(wanted.reduce((sum, frame) => sum + frame.decodeStartMs - frame.bytesReadyMs, 0) / wanted.length)} in de decodewachtrij.`)
  rows.push(`- GPU-proces (swiftshader, buiten de quota): ${ms(gpuCpuMs)} CPU.`)
  rows.push(`- Decodes zonder gevonden frame (bron "onbekend"): ${[...unmatchedFields].map(([field, count]) => `${field} ${count}×`).join(', ') || 'geen'}; ${traced.decodes.length - claimed.size} zonder workertaak.`)
  return rows.join('\n')
}

if (process.argv[1]?.endsWith('perf-trace-split.ts')) {
  const args = process.argv.slice(2)
  const quotaIndex = args.indexOf('--quota')
  const quota = quotaIndex >= 0 ? Number(args.splice(quotaIndex, 2)[1]) : 0.4
  if (!args.length) throw new Error('gebruik: perf-trace-split.ts [--quota 0.4] <rapport.json>...')
  console.log(args.map((path) => analyse(path, quota)).join('\n\n'))
}
