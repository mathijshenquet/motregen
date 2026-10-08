import { readFileSync, writeFileSync } from 'node:fs'

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
interface StartCapture {
  timeOrigin: number
  loadAverage: number
  snapshot: { firstRainMs: number | null; basemapReadyMs: number | null; ttfrMs: number | null; ttfpMs: number | null; ttfhMs: number | null }
  resources: Array<{ name: string; startTime: number; responseEnd: number; encodedBodySize: number; decodedBodySize: number; entryType: string }>
  requests: Array<{ url: string; range: string | null; startTime: number; requestStart: number; responseEnd: number; responseBodySize: number; fromServiceWorker: boolean }>
  entries: { measures: Array<{ phase: string; startTime: number; duration: number; detail?: Record<string, unknown> }> }
}
const files = process.argv.slice(2).filter((file) => !file.endsWith(".trace.json"))
if (!files.length) throw new Error('Gebruik: pnpm exec tsx scripts/start-waterfall.ts UITVOERPREFIX-cold-run1.json [...]')
for (const file of files) {
  const capture = JSON.parse(readFileSync(file, 'utf8')) as StartCapture
  const { traceEvents: events } = JSON.parse(readFileSync(file.replace(/\.json$/, '.trace.json'), 'utf8')) as { traceEvents: TraceEvent[] }
  const navigation = events.find((event) => event.name === 'navigationStart' && event.args?.data?.documentLoaderURL?.startsWith('http'))
  if (!navigation) throw new Error(`${file}: navigatiestart ontbreekt in de CPU-trace`)
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
  const network = (label: string, requests: StartCapture['requests']) => {
    rows.push(`| ${label} (${requests.length}) | ${requests.length ? `${shown(Math.min(...requests.map((request) => request.startTime + request.requestStart - capture.timeOrigin)))} → ${shown(Math.max(...requests.map((request) => request.startTime + request.responseEnd - capture.timeOrigin)))}` : 'niet gezien'} | ${shown(requests.reduce((sum, request) => sum + request.responseBodySize, 0) / 1000)} / — |`)
  }
  network('header-Ranges', capture.requests.filter((request) => /\/chunks\//.test(request.url) && request.range?.startsWith('bytes=0-')))
  network('eerste regen-Range', capture.requests.filter((request) => /\/chunks\/(?:rtcor|nowcast|harmonie|seamless)/.test(request.url) && request.range && !request.range.startsWith('bytes=0-')).sort((left, right) => left.startTime - right.startTime).slice(0, 1))
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
    const parsing = events.filter((event) => event.name === 'v8.parseOnBackgroundParsing' && parseParents.some((parent) => parent.pid === event.pid && parent.tid === event.tid && event.ts >= parent.ts && event.ts + (event.dur ?? 0) <= parent.ts + (parent.dur ?? 0)))
    const compile = events.filter((event) => ['v8.compileModule', 'v8.compile'].includes(event.name) && event.args?.data?.url === url)
    const spans = [...parsing, ...compile]
    if (!spans.length) continue
    cpuRows.push(`| ${url.split('/').at(-1)} | ${shown(parsing.reduce((sum, event) => sum + (event.tdur ?? event.dur ?? 0), 0) / 1000)} / ${shown(compile.reduce((sum, event) => sum + (event.tdur ?? event.dur ?? 0), 0) / 1000)} | ${shown((Math.min(...spans.map((event) => event.ts)) - navigation.ts) / 1000)} → ${shown((Math.max(...spans.map((event) => event.ts + (event.dur ?? 0))) - navigation.ts) / 1000)} |`)
  }
  const markdown = `# ${file}\n\nLoadavg ${capture.loadAverage}; desktop 1280×800, 8 cores/8 GB, CPU 1×, SwiftShader. Trace-overhead aanwezig. Decodetijd is workerduur teruggeteld vanaf het antwoord op de hoofddraad; exacte start in de worker ontbreekt. Textuurduur meet CPU-aanroep, geen GPU-fence.\n\n${rows.join('\n')}\n\n${cpuRows.join('\n')}\n`
  writeFileSync(file.replace(/\.json$/, '.md'), markdown)
  console.log(markdown)
}
