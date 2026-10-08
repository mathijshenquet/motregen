import { readFileSync, writeFileSync } from 'node:fs'
import type { PerfSnapshot, PerfTraceSlice } from '../src/core/perf'

interface TraceEvent {
  name: string
  ph: string
  pid: number
  tid: number
  ts: number
  dur?: number
  tdur?: number
  args?: { data?: { url?: string; documentLoaderURL?: string }; fileName?: string }
}
function outerSpans(events: TraceEvent[]): TraceEvent[] {
  return events.filter((event) => !events.some((parent) => parent !== event
    && parent.pid === event.pid && parent.tid === event.tid
    && parent.ts <= event.ts && parent.ts + (parent.dur ?? 0) >= event.ts + (event.dur ?? 0)
    && (parent.ts < event.ts || (parent.dur ?? 0) > (event.dur ?? 0))))
}
interface StartCapture {
  pairedRun?: boolean
  loadLimit?: number
  pair?: string
  pairRole?: string
  warm?: boolean
  warmMethod?: string
  httpCacheEnabled?: boolean
  serviceWorkerControlled?: boolean
  timeOrigin: number
  loadAverage: number
  snapshot: PerfSnapshot
  resources: Array<{ name: string; startTime: number; responseEnd: number; encodedBodySize: number; decodedBodySize: number; entryType: string }>
  requests: Array<{ url: string; range: string | null; startTime: number; requestStart: number; responseEnd: number; responseBodySize: number; fromServiceWorker: boolean; serviceWorkerRequest?: boolean }>
  entries: PerfTraceSlice
}
const files = process.argv.slice(2).filter((file) => !file.endsWith('.trace.json'))
if (!files.length) throw new Error('Gebruik: pnpm exec tsx scripts/start-waterfall.ts UITVOERPREFIX-cold-run1.json [...]')
for (const file of files) {
  const capture = JSON.parse(readFileSync(file, 'utf8')) as StartCapture
  const { traceEvents: events } = JSON.parse(readFileSync(file.replace(/\.json$/, '.trace.json'), 'utf8')) as { traceEvents: TraceEvent[] }
  const navigation = events.find((event) => event.name === 'navigationStart' && event.args?.data?.documentLoaderURL?.startsWith('http'))
  if (!navigation) throw new Error(`${file}: navigatiestart ontbreekt in de CPU-trace`)
  const afterPlay = capture.entries.longFrames.filter((frame) => frame.startTime >= (capture.snapshot.ttfpMs ?? Infinity) && frame.startTime + frame.duration <= 12_000)
  const priorities = `ttfr ${capture.snapshot.ttfrMs} ms; ttfp ${capture.snapshot.ttfpMs} ms; eerste regentekenbeurt ${capture.snapshot.firstRainMs} ms. LoAF na ttfp tot 12 s: ${afterPlay.length} frames, totaal ${Math.round(afterPlay.reduce((total, frame) => total + frame.duration, 0))} ms, max ${Math.round(Math.max(0, ...afterPlay.map((frame) => frame.duration)))} ms.\n\n`
  const rows = ['| schakel | begin → eind (ms) | encoded kB / decoded kB |', '| --- | ---: | ---: |']
  const shown = (value: number) => value.toFixed(1)
  const resource = (label: string, pattern: RegExp) => {
    const matches = capture.resources.filter((entry) => pattern.test(entry.name))
    rows.push(`| ${label} | ${matches.length ? `${shown(Math.min(...matches.map((entry) => entry.startTime)))} → ${shown(Math.max(...matches.map((entry) => entry.responseEnd)))}` : 'niet gezien'} | ${matches.length ? `${shown(matches.reduce((sum, entry) => sum + entry.encodedBodySize, 0) / 1000)} / ${shown(matches.reduce((sum, entry) => sum + entry.decodedBodySize, 0) / 1000)}` : '—'} |`)
  }
  resource('HTML', /\/?\?perf=/)
  resource('JS-entry', /\/assets\/index-[^/]+\.js$/)
  resource('JS-modules', /\/assets\/(?!index-)[^/]+\.js$/)
  resource('CSS', /\.css$/)
  resource('stijl-JSON', /(?:style[^/]*|licht|donker)\.json$/)
  resource('glyphs', /\/fonts\//)
  resource('basemap-Ranges', /\.pmtiles$/)
  resource('manifest', /\/manifest\.json/)
  resource('plaatsenlijst (na ttfp)', /\/plaatsen-[0-9a-f]+\.json$/)
  const network = (label: string, requests: StartCapture['requests']) => {
    const unknownSizes = requests.filter((request) => request.responseBodySize < 0).length
    const knownBytes = requests.reduce((sum, request) => sum + Math.max(0, request.responseBodySize), 0)
    rows.push(`| ${label} (${requests.length}) | ${requests.length ? `${shown(Math.min(...requests.map((request) => request.startTime + request.requestStart - capture.timeOrigin)))} → ${shown(Math.max(...requests.map((request) => request.startTime + request.responseEnd - capture.timeOrigin)))}` : 'niet gezien'} | ${shown(knownBytes / 1000)}${unknownSizes ? ` + onbekend (${unknownSizes} cache-responses)` : ''} / — |`)
  }
  const pageRequests = capture.requests.filter((request) => !request.serviceWorkerRequest)
  network('header-Ranges', pageRequests.filter((request) => /\/chunks\//.test(request.url) && request.range?.startsWith('bytes=0-')))
  network('eerste regen-Range', pageRequests.filter((request) => /\/chunks\/(?:rtcor|nowcast|harmonie|seamless)/.test(request.url) && request.range && !request.range.startsWith('bytes=0-')).sort((left, right) => left.startTime - right.startTime).slice(0, 1))
  for (const [label, phase] of [['eerste regendecode', 'frame-decode'], ['eerste textuur', 'texture-upload']] as const) {
    const entry = capture.entries.measures.find((candidate) => candidate.phase === phase && (phase !== 'frame-decode' || candidate.detail?.field === 'rain_rate'))
    rows.push(`| ${label} | ${entry ? `${shown(entry.startTime)} → ${shown(entry.startTime + entry.duration)}` : 'niet gezien'} | — |`)
  }
  for (const [label, value] of Object.entries(capture.snapshot).filter(([name]) => ['firstRainMs', 'basemapReadyMs', 'ttfrMs', 'ttfpMs', 'ttfhMs'].includes(name))) rows.push(`| ${label} | ${value === null ? 'ontbreekt' : value} | — |`)
  for (const name of ['firstContentfulPaint', 'largestContentfulPaint::Candidate']) {
    const paint = events.filter((event) => event.name === name && event.pid === navigation.pid).at(-1)
    rows.push(`| ${name} | ${paint ? shown((paint.ts - navigation.ts) / 1000) : 'niet gezien'} | — |`)
  }
  const cpuRows = ['| JS-bestand | parse CPU / compile CPU (ms) | parse/compile venster (ms) |', '| --- | ---: | ---: |']
  const urls = [...new Set(events.flatMap((event) => event.args?.data?.url?.includes('/assets/') ? [event.args.data.url] : []))]
  for (const url of urls) {
    const parseParents = events.filter((event) => event.name === 'v8.parseOnBackground' && event.args?.data?.url === url)
    const parsing = outerSpans(events.filter((event) => event.name === 'v8.parseOnBackgroundParsing' && parseParents.some((parent) => parent.pid === event.pid && parent.tid === event.tid && event.ts >= parent.ts && event.ts + (event.dur ?? 0) <= parent.ts + (parent.dur ?? 0))))
    const compile = outerSpans(events.filter((event) => ['v8.compileModule', 'v8.compile'].includes(event.name) && event.args?.data?.url === url))
    const spans = [...parsing, ...compile]
    if (!spans.length) continue
    cpuRows.push(`| ${url.split('/').at(-1)} | ${shown(parsing.reduce((sum, event) => sum + (event.tdur ?? event.dur ?? 0), 0) / 1000)} / ${shown(compile.reduce((sum, event) => sum + (event.tdur ?? event.dur ?? 0), 0) / 1000)} | ${shown((Math.min(...spans.map((event) => event.ts)) - navigation.ts) / 1000)} → ${shown((Math.max(...spans.map((event) => event.ts + (event.dur ?? 0))) - navigation.ts) / 1000)} |`)
  }
  const cacheState = capture.warm ? `Warm: ${capture.warmMethod ?? 'historische methode'}; HTTP-cache ${capture.httpCacheEnabled ? 'aan' : 'uit of onbekend'}; SW-controller ${capture.serviceWorkerControlled ?? 'onbekend'}. Resource-bodybytes zijn geleverde bytes, geen wireclaim. Range-rijen tellen paginaverzoeken zonder hun SW-upstreamdubbel; negatieve Playwright-cachegroottes blijven onbekend.\n\n` : ''
  const pairState = capture.pairedRun ? `Gepaarde capture ${capture.pair} / ${capture.pairRole}, startgrens load ≤${capture.loadLimit ?? 12}. Alleen voor verschil binnen het paar; geen absolute baseline.\n\n` : ''
  const markdown = `# ${file}\n\n${priorities}${pairState}${cacheState}Loadavg ${capture.loadAverage}; desktop 1280×800, 8 cores/8 GB, CPU 1×, SwiftShader. Trace-overhead aanwezig. Decodetijd is workerduur teruggeteld vanaf het antwoord op de hoofddraad; exacte start in de worker ontbreekt. Textuurduur meet CPU-aanroep, geen GPU-fence.\n\n${rows.join('\n')}\n\n${cpuRows.join('\n')}\n`
  writeFileSync(file.replace(/\.json$/, '.md'), markdown)
  console.log(markdown)
}
