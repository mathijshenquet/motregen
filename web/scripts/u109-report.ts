// U109: samenvatting van gepaarde perf:modes-runs (scripts/u109-ab.sh) per profiel/bezoek en variant:
// ttfp, eerste kaart, histogram compleet, bytes per soort (JS/CSS/font/basiskaart/data/overig), requests,
// lange frames in de laadfase en V8 parse/compile-tijd per draadsoort uit de Chrome-trace (eerste 15 s).
// Gebruik: pnpm exec tsx scripts/u109-report.ts <uitvoermap van u109-ab.sh> [--json]
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { NetworkEntry, VisitReport } from './perf-modes-report'

const KINDS = ['js', 'css', 'font', 'basiskaart', 'data', 'html', 'overig'] as const
type Kind = typeof KINDS[number]
const THREADS = ['hoofddraad', 'workers', 'threadpool'] as const
type ThreadKind = typeof THREADS[number]
const TRACE_WINDOW_MS = 15_000

export function kindOf(url: string): Kind {
  const path = new URL(url).pathname
  if (/\.m?js$/.test(path)) return 'js'
  if (path.endsWith('.css')) return 'css'
  if (path.includes('/fonts/') || /\.(woff2?|ttf)$/.test(path)) return 'font'
  if (path.includes('/basemap/') || path.endsWith('.pmtiles')) return 'basiskaart'
  if (path.startsWith('/data/') || /\/plaatsen-[0-9a-f]+\.json$/.test(path)) return 'data'
  if (path === '/' || path.endsWith('.html') || /^\/[a-z-]*$/.test(path)) return 'html'
  return 'overig'
}

export function bytesByKind(entries: readonly NetworkEntry[], untilMs: number): Record<Kind | 'totaal', { bytes: number; requests: number }> {
  const totals = Object.fromEntries([...KINDS, 'totaal'].map((kind) => [kind, { bytes: 0, requests: 0 }])) as Record<Kind | 'totaal', { bytes: number; requests: number }>
  for (const entry of entries) {
    if (entry.startMs > untilMs || entry.url.startsWith('data:') || entry.url.startsWith('blob:')) continue
    for (const key of [kindOf(entry.url), 'totaal'] as const) {
      totals[key].bytes += entry.bytes
      totals[key].requests++
    }
  }
  return totals
}

interface TraceEvent { name: string; cat: string; ph: string; ts: number; dur?: number; pid: number; tid: number; args?: { name?: string } }

const COMPILE = /^(v8\.(compile|compileModule|parseOnBackground|compileLazy)|V8\.(CompileCode|CompileLazy|ParseProgram|ParseFunction|PreParse|CompileScript|CompileFinalization|StreamingFinalization|OptimizeConcurrent|ConcurrentSparkplug|Maglev|Turbofan)|.*BackgroundCompile.*|v8\.produceCache|v8\.produceModuleCache)/

/** Unie van parse/compile-intervallen per draadsoort (geneste events tellen één keer), binnen het venster. */
export function compileMs(events: readonly TraceEvent[]): Record<ThreadKind, number> & { navigationTs: number | null } {
  const names = new Map<string, string>()
  for (const event of events) if (event.ph === 'M' && event.name === 'thread_name') names.set(`${event.pid}:${event.tid}`, event.args?.name ?? '')
  const navigation = events.find((event) => event.name === 'navigationStart' && event.cat.includes('blink.user_timing'))
    ?? events.find((event) => event.name === 'navigationStart')
  const start = navigation?.ts ?? Math.min(...events.filter((event) => event.ts > 0).map((event) => event.ts))
  const end = start + TRACE_WINDOW_MS * 1000
  // Alleen het rendererproces van de pagina en zijn workers: daar draait de hoofddraad.
  const rendererPids = new Set(events.filter((event) => names.get(`${event.pid}:${event.tid}`) === 'CrRendererMain').map((event) => event.pid))
  // Per draad de unie (geneste events tellen één keer), daarna per draadsoort opgeteld.
  const intervals = new Map<string, { kind: ThreadKind; list: Array<[number, number]> }>()
  const open = new Map<string, number[]>()
  for (const event of events) {
    if (!rendererPids.has(event.pid) || !COMPILE.test(event.name)) continue
    const threadKey = `${event.pid}:${event.tid}`
    const thread = names.get(threadKey) ?? ''
    const kind: ThreadKind = thread === 'CrRendererMain' ? 'hoofddraad' : /DedicatedWorker/i.test(thread) ? 'workers' : 'threadpool'
    const entry = intervals.get(threadKey) ?? { kind, list: [] }
    intervals.set(threadKey, entry)
    const key = `${threadKey}:${event.name}`
    if (event.ph === 'X' && event.dur !== undefined) entry.list.push([event.ts, event.ts + event.dur])
    else if (event.ph === 'B') open.set(key, [...open.get(key) ?? [], event.ts])
    else if (event.ph === 'E') {
      const began = open.get(key)?.pop()
      if (began !== undefined) entry.list.push([began, event.ts])
    }
  }
  const result = { hoofddraad: 0, workers: 0, threadpool: 0, navigationTs: navigation?.ts ?? null }
  for (const { kind, list } of intervals.values()) {
    const clipped = list.map(([a, b]) => [Math.max(a, start), Math.min(b, end)] as [number, number]).filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0])
    let total = 0
    let current: [number, number] | null = null
    for (const [a, b] of clipped) {
      if (!current || a > current[1]) { if (current) total += current[1] - current[0]; current = [a, b] }
      else current[1] = Math.max(current[1], b)
    }
    if (current) total += current[1] - current[0]
    result[kind] += total / 1000
  }
  for (const kind of THREADS) result[kind] = Math.round(result[kind])
  return result
}

interface Row {
  variant: string
  profile: string
  visit: string
  loadAverage: number
  ttfpMs: number | null
  firstMapMs: number | null
  histogramMs: number | null
  bytes: ReturnType<typeof bytesByKind>
  longFrames: { count: number; blockingMs: number; maxMs: number }
  compile: ReturnType<typeof compileMs> | null
}

function readRows(directory: string): Row[] {
  const rows: Row[] = []
  for (const run of readdirSync(directory).filter((name) => /^[A-Z]\d+$/.test(name)).sort()) {
    const runDirectory = join(directory, run)
    for (const file of readdirSync(runDirectory).filter((name) => name.endsWith('.json'))) {
      const report = JSON.parse(readFileSync(join(runDirectory, file), 'utf8')) as VisitReport & { milestones: { ttfpMs?: number | null } }
      const tracePath = join(runDirectory, file.replace(/\.json$/, '.trace'))
      let compile: Row['compile'] = null
      if (existsSync(tracePath)) {
        const trace = JSON.parse(readFileSync(tracePath, 'utf8')) as { traceEvents: TraceEvent[] } | TraceEvent[]
        compile = compileMs(Array.isArray(trace) ? trace : trace.traceEvents)
      }
      const laden = report.longFrames.laden ?? { count: 0, blockingMs: 0, maxMs: 0 }
      rows.push({
        variant: run.replace(/\d+$/, ''), profile: report.profile, visit: report.visit, loadAverage: report.loadAverage,
        ttfpMs: report.milestones.ttfpMs ?? null, firstMapMs: report.milestones.firstMapMs, histogramMs: report.milestones.histogramCompleteMs,
        bytes: bytesByKind(report.network ?? [], report.milestones.settledMs),
        longFrames: { count: laden.count, blockingMs: laden.blockingMs, maxMs: laden.maxMs },
        compile,
      })
    }
  }
  return rows
}

function median(values: Array<number | null | undefined>): number | null {
  const sorted = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)).sort((a, b) => a - b)
  if (!sorted.length) return null
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

const ms = (value: number | null) => value === null ? '—' : `${Math.round(value).toLocaleString('nl-NL')} ms`
const kB = (value: number | null) => value === null ? '—' : `${(value / 1000).toLocaleString('nl-NL', { maximumFractionDigits: 1 })} kB`

export function renderRows(rows: readonly Row[]): string {
  const groups = new Map<string, Row[]>()
  for (const row of rows) {
    const key = `${row.profile} ${row.visit}|${row.variant}`
    groups.set(key, [...groups.get(key) ?? [], row])
  }
  const lines = [
    '| profiel | variant | n | loadavg | ttfp | eerste kaart | histogram | JS | CSS | font | basiskaart | data | totaal (requests) | LoAF laden: n / blokkerend / max | compile hoofddraad / workers / threadpool |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]
  for (const [key, group] of [...groups].sort(([a], [b]) => a.localeCompare(b))) {
    const [profile, variant] = key.split('|')
    const pick = (select: (row: Row) => number | null | undefined) => median(group.map(select))
    const loads = group.map((row) => row.loadAverage)
    lines.push(`| ${profile} | ${variant} | ${group.length} | ${Math.min(...loads)}–${Math.max(...loads)} | ${ms(pick((row) => row.ttfpMs))} | ${ms(pick((row) => row.firstMapMs))} | ${ms(pick((row) => row.histogramMs))} | ${kB(pick((row) => row.bytes.js.bytes))} | ${kB(pick((row) => row.bytes.css.bytes))} | ${kB(pick((row) => row.bytes.font.bytes))} | ${kB(pick((row) => row.bytes.basiskaart.bytes))} | ${kB(pick((row) => row.bytes.data.bytes))} | ${kB(pick((row) => row.bytes.totaal.bytes))} (${pick((row) => row.bytes.totaal.requests) ?? '—'}) | ${pick((row) => row.longFrames.count) ?? '—'} / ${ms(pick((row) => row.longFrames.blockingMs))} / ${ms(pick((row) => row.longFrames.maxMs))} | ${ms(pick((row) => row.compile?.hoofddraad))} / ${ms(pick((row) => row.compile?.workers))} / ${ms(pick((row) => row.compile?.threadpool))} |`)
  }
  return lines.join('\n')
}

const LAYER_ORDER = ['basiskaart', 'regen', 'wolken', 'zon', 'temperatuurvlakken', 'temperatuurgetallen', 'bft-vlakken', 'windzakken', 'deeltjes'] as const
const MODE_OWN_LAYERS: Record<string, readonly string[]> = {
  weer: ['basiskaart', 'regen', 'deeltjes'],
  lucht: ['basiskaart', 'regen', 'wolken', 'zon'],
  gevoel: ['basiskaart', 'regen', 'temperatuurvlakken', 'temperatuurgetallen'],
  wind: ['basiskaart', 'bft-vlakken', 'windzakken', 'deeltjes'],
}
const LEGEND_OF: Record<string, string> = { weer: '.rain-isoline-legend', gevoel: '.feels-legend', wind: '.wind-legend' }

interface LayerReport {
  mode: string; profile: string; visit: string; loadAverage: number
  milestones: { firstMapMs: number | null; histogramCompleteMs: number | null; tableCompleteMs: number | null; ttfpMs?: number | null }
  layers?: { firstMs: Record<string, number>; legends: Array<{ selector: string; ms: number }> }
  modeSwitches?: Array<{ to: string; layers: Record<string, number>; legendMs: number | null; complete: boolean }>
}

/** Per modus/profiel/bezoek: eerste tekening per laag (ms sinds navigatie) plus legenda, histogram en tabel. */
export function renderLayerTables(directory: string): string {
  const reports = readdirSync(directory).filter((name) => name.endsWith('.json')).sort()
    .map((name) => JSON.parse(readFileSync(join(directory, name), 'utf8')) as LayerReport)
  const cell = (value: number | null | undefined) => typeof value === 'number' ? `${(value / 1000).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s` : '—'
  const lines = ['| profiel | modus | load | ' + LAYER_ORDER.join(' | ') + ' | legenda | histogram | tabel |', '| --- | --- | ---: |' + ' ---: |'.repeat(LAYER_ORDER.length + 3)]
  for (const report of reports) {
    if (!report.layers) continue
    const own = MODE_OWN_LAYERS[report.mode] ?? []
    const legend = report.layers.legends.find((entry) => entry.selector === LEGEND_OF[report.mode])
    lines.push(`| ${report.profile} ${report.visit} | ${report.mode} | ${report.loadAverage} | ${LAYER_ORDER.map((layer) => own.includes(layer) ? cell(report.layers!.firstMs[layer]) : '·').join(' | ')} | ${cell(legend?.ms)} | ${cell(report.milestones.histogramCompleteMs)} | ${cell(report.milestones.tableCompleteMs)} |`)
  }
  lines.push('', '**Na een moduswissel** (ms vanaf de klik tot de eerste tekening van elke laag van de doelmodus; vanuit de vorige modus in de rij erboven)', '')
  lines.push('| profiel | start | wissel naar | lagen van de doelmodus | legenda | alles getekend |', '| --- | --- | --- | --- | ---: | --- |')
  for (const report of reports) {
    let from = report.mode
    for (const step of report.modeSwitches ?? []) {
      const own = (MODE_OWN_LAYERS[step.to] ?? []).filter((layer) => layer !== 'basiskaart' && layer !== 'regen')
      const shown = own.map((layer) => `${layer} ${step.layers[layer] === undefined ? '—' : `${Math.round(step.layers[layer]!)} ms`}`).join(', ')
      lines.push(`| ${report.profile} ${report.visit} | ${from} | ${step.to} | ${shown || '(regen staat al)'} | ${step.legendMs === null ? '—' : `${step.legendMs} ms`} | ${step.complete ? 'ja' : 'nee (12 s)'} |`)
      from = step.to
    }
  }
  return lines.join('\n')
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv[2] === '--layers') {
    console.log(renderLayerTables(process.argv[3]!))
    process.exit(0)
  }
  const directory = process.argv[2]
  if (!directory) throw new Error('Gebruik: u109-report.ts <uitvoermap> [--json]')
  const rows = readRows(directory)
  console.log(process.argv.includes('--json') ? JSON.stringify(rows, null, 2) : renderRows(rows))
}
