import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'

// Leest een opname van de Firefox Profiler (profiler.firefox.com, "Download", .json of .json.gz)
// en rapporteert per paginalading wat er over het laden van de radar te zeggen valt:
// Buienradar via zijn radarbeelden (netwerk), motregen via netwerkvolgorde en — met ?perf — zijn
// eigen UserTiming-mijlpalen. Alle tijden zijn ms sinds de navigatiestart van die lading.

interface MarkerTable {
  length: number
  name: number[]
  startTime: Array<number | null>
  endTime: Array<number | null>
  phase: number[]
  data: Array<Record<string, unknown> | null>
}
interface ProfileThread {
  name: string
  pid: string | number
  processType: string
  isMainThread?: boolean
  'eTLD+1'?: string
  markers: MarkerTable
  stringArray?: string[]
}
interface FirefoxProfile {
  meta: { profilingStartTime?: number; product?: string; oscpu?: string }
  shared?: { stringArray?: string[] }
  threads: ProfileThread[]
}

interface Marker { name: string; start: number; end: number | null; data: Record<string, unknown> | null }
interface NetworkRequest { uri: string; begin: number; end: number; bytes: number; status: number | null }
export interface PageLoad {
  site: 'buienradar' | 'motregen'
  pid: string
  documentUri: string
  /** Absolute tijd in de klok van het profiel. */
  navigationStart: number
  navigationSource: 'Navigation::Start' | 'documentverzoek'
  requests: NetworkRequest[]
  markers: Marker[]
}

const INTERVAL_PHASES = new Set([1, 2, 3])
const BUIENRADAR_DOCUMENT = /^https:\/\/www\.buienradar\.nl\/(\?.*)?$/
const BUIENRADAR_RADAR = /^https:\/\/processing-cdn\.buienradar\.nl\/.*\/rain\/.*\.png$/
const RAIN_CHUNK = /\/data\/chunks\/(rtcor|nowcast|seamless|harmonie-\d)/
const CHUNK = /\/data\/chunks\/[^/]+\.mrf$/

export function readFirefoxProfile(path: string): FirefoxProfile {
  const raw = readFileSync(path)
  return JSON.parse((path.endsWith('.gz') ? gunzipSync(raw) : raw).toString()) as FirefoxProfile
}

function threadMarkers(profile: FirefoxProfile, thread: ProfileThread): Marker[] {
  const strings = profile.shared?.stringArray ?? thread.stringArray ?? []
  const table = thread.markers
  const markers: Marker[] = []
  for (let index = 0; index < table.length; index++) {
    const start = table.startTime[index]
    if (start == null) continue
    markers.push({ name: strings[table.name[index]!] ?? '', start, end: INTERVAL_PHASES.has(table.phase[index]!) ? table.endTime[index] ?? null : null, data: table.data[index] ?? null })
  }
  return markers
}

/** Een verzoek staat als START- en STOP-marker in het profiel; samen geven ze begin en eind. */
function networkRequests(markers: Marker[]): NetworkRequest[] {
  const byId = new Map<unknown, NetworkRequest>()
  for (const marker of markers) {
    const data = marker.data
    if (data?.type !== 'Network' || typeof data.URI !== 'string') continue
    const begin = Number(data.startTime ?? marker.start)
    const end = Number(data.endTime ?? marker.end ?? marker.start)
    const known = byId.get(data.id)
    if (!known) byId.set(data.id, { uri: data.URI, begin, end, bytes: Number(data.count ?? 0), status: typeof data.responseStatus === 'number' ? data.responseStatus : null })
    else {
      known.begin = Math.min(known.begin, begin)
      known.end = Math.max(known.end, end)
      known.bytes = Math.max(known.bytes, Number(data.count ?? 0))
      known.status ??= typeof data.responseStatus === 'number' ? data.responseStatus : null
    }
  }
  return [...byId.values()].sort((left, right) => left.begin - right.begin)
}

export function pageLoads(profile: FirefoxProfile, motregenOrigin: RegExp): PageLoad[] {
  const motregenDocument = new RegExp(`^https?://(${motregenOrigin.source})/(\\?.*)?$`)
  const loads: PageLoad[] = []
  for (const thread of profile.threads) {
    if (thread.processType !== 'tab' || !thread.isMainThread) continue
    const markers = threadMarkers(profile, thread)
    const requests = networkRequests(markers)
    const documents: Array<{ request: NetworkRequest; site: PageLoad['site'] }> = []
    for (const request of requests) {
      if (BUIENRADAR_DOCUMENT.test(request.uri)) documents.push({ request, site: 'buienradar' })
      else if (motregenDocument.test(request.uri)) documents.push({ request, site: 'motregen' })
    }
    documents.forEach(({ request, site }, index) => {
      const until = documents[index + 1]?.request.begin ?? Number.POSITIVE_INFINITY
      // Navigation::Start valt iets vóór het documentverzoek in het contentproces; zonder die marker
      // is het verzoek zelf het vroegste dat dit proces van de navigatie weet.
      const started = markers.filter((marker) => marker.name === 'Navigation::Start' && marker.data?.innerWindowID !== undefined && marker.start <= request.begin && request.begin - marker.start < 1_000).at(-1)
      const navigationStart = started?.start ?? request.begin
      loads.push({
        site, pid: String(thread.pid), documentUri: request.uri, navigationStart,
        navigationSource: started ? 'Navigation::Start' : 'documentverzoek',
        requests: requests.filter((candidate) => candidate.begin >= navigationStart && candidate.begin < until),
        markers: markers.filter((marker) => marker.start >= navigationStart - 1 && marker.start < until),
      })
    })
  }
  return loads.sort((left, right) => left.navigationStart - right.navigationStart)
}

const relative = (load: PageLoad, time: number | null | undefined) => time == null ? null : Math.round(time - load.navigationStart)
const shown = (value: number | null) => value === null ? '—' : `${value} ms`
const fileName = (uri: string) => new URL(uri).pathname.split('/').at(-1) ?? uri

function paintRows(load: PageLoad): string[] {
  // Een marker van een eerdere lading in hetzelfde proces kan een eindtijd vóór deze navigatie dragen.
  const end = (name: string) => relative(load, load.markers.find((marker) => marker.name === name && marker.end !== null && marker.end >= load.navigationStart)?.end)
  return [
    `| FirstContentfulPaint | ${shown(end('FirstContentfulPaint'))} |`,
    `| LargestContentfulPaint | ${shown(end('LargestContentfulPaint'))} |`,
    `| DOMContentLoaded | ${shown(end('DOMContentLoaded'))} |`,
    `| DocumentLoad | ${shown(end('DocumentLoad'))} |`,
  ]
}

export function buienradarSummary(load: PageLoad) {
  const radar = load.requests.filter((request) => BUIENRADAR_RADAR.test(request.uri))
  return {
    firstRadar: radar[0] ? { begin: relative(load, radar[0].begin)!, end: relative(load, radar[0].end)!, file: fileName(radar[0].uri) } : null,
    secondRadar: radar[1] ? { begin: relative(load, radar[1].begin)!, end: relative(load, radar[1].end)!, file: fileName(radar[1].uri) } : null,
    radarImages: radar.length,
  }
}

export function motregenSummary(load: PageLoad) {
  const chunkRequests = load.requests.filter((request) => CHUNK.test(new URL(request.uri).pathname))
  const seen = new Set<string>()
  const headers: NetworkRequest[] = []
  const frames: NetworkRequest[] = []
  // Het eerste verzoek per chunk is zijn header; alles daarna zijn frame-Ranges.
  for (const request of chunkRequests) {
    (seen.has(request.uri) ? frames : headers).push(request)
    seen.add(request.uri)
  }
  const rainFrames = frames.filter((request) => RAIN_CHUNK.test(request.uri))
  const find = (pattern: RegExp) => load.requests.find((request) => pattern.test(request.uri))
  const timing = load.markers.filter((marker) => marker.data?.type === 'UserTiming' && String(marker.data.name).startsWith('motregen:'))
  const measure = (name: string) => timing.find((marker) => marker.data!.name === `motregen:${name}`)
  return {
    manifest: find(/\/data\/manifest\.json/),
    headers: headers.length ? { count: headers.length, begin: relative(load, headers[0]!.begin)!, lastEnd: relative(load, Math.max(...headers.map((request) => request.end)))!, bytes: headers.reduce((total, request) => total + request.bytes, 0) } : null,
    rainFrames: rainFrames.slice(0, 2),
    basemapStyle: find(/tiles\.openfreemap\.org\/styles\//),
    firstTile: find(/tiles\.openfreemap\.org\/.*\/\d+\/\d+\/\d+\.pbf/),
    userTiming: {
      present: timing.length > 0,
      ttfp: relative(load, measure('milestone:ttfp')?.end),
      firstRain: relative(load, measure('milestone:first-rain')?.end),
      rainWindow: relative(load, measure('window-ready:rain_rate')?.end),
      blankVisibleEnd: relative(load, timing.filter((marker) => marker.data!.name === 'motregen:blank-visible').at(-1)?.end),
      firstTextureUpload: relative(load, timing.filter((marker) => marker.data!.name === 'motregen:texture-upload').sort((left, right) => left.start - right.start)[0]?.start),
    },
  }
}

export function renderPageLoad(load: PageLoad): string {
  const lines = [`## ${load.site}: ${load.documentUri} (pid ${load.pid})`, '', `Navigatiestart uit ${load.navigationSource}. Tijden in ms sinds die start.`, '', '| meetpunt | tijd |', '| --- | ---: |']
  const document = load.requests.find((request) => request.uri === load.documentUri)
  lines.push(`| document: verzoek begin / eind | ${shown(relative(load, document?.begin))} / ${shown(relative(load, document?.end))} |`, ...paintRows(load))
  if (load.site === 'buienradar') {
    const summary = buienradarSummary(load)
    lines.push(
      `| eerste radarbeeld: verzoek begin / eind | ${summary.firstRadar ? `${summary.firstRadar.begin} / ${summary.firstRadar.end} ms (${summary.firstRadar.file})` : 'niet gezien'} |`,
      `| tweede radarbeeld: verzoek begin / eind | ${summary.secondRadar ? `${summary.secondRadar.begin} / ${summary.secondRadar.end} ms (${summary.secondRadar.file})` : 'niet gezien'} |`,
      `| **ttfp-ref (netwerk): tweede radarbeeld binnen** | **${shown(summary.secondRadar?.end ?? null)}** |`,
      `| radarbeelden in deze lading | ${summary.radarImages} |`,
    )
  } else {
    const summary = motregenSummary(load)
    const span = (request: NetworkRequest | undefined) => request ? `${relative(load, request.begin)} / ${relative(load, request.end)} ms (${request.bytes} B)` : 'niet gezien'
    lines.push(
      `| manifest: begin / eind | ${span(summary.manifest)} |`,
      `| chunk-headers: aantal, begin → laatste eind | ${summary.headers ? `${summary.headers.count}, ${summary.headers.begin} → ${summary.headers.lastEnd} ms (${summary.headers.bytes} B)` : 'niet gezien'} |`,
      `| eerste regen-Range: begin / eind | ${span(summary.rainFrames[0])} |`,
      `| tweede regen-Range: begin / eind | ${span(summary.rainFrames[1])} |`,
      `| basemap-stijl: begin / eind | ${span(summary.basemapStyle)} |`,
      `| eerste basemap-tile: begin / eind | ${span(summary.firstTile)} |`,
    )
    if (summary.userTiming.present) lines.push(
      `| **ttfp (\`milestone:ttfp\`)** | **${shown(summary.userTiming.ttfp)}** |`,
      `| eerste regenframe (\`milestone:first-rain\`) | ${shown(summary.userTiming.firstRain)} |`,
      `| regen nu ± 1 u (\`window-ready:rain_rate\`) | ${shown(summary.userTiming.rainWindow)} |`,
      `| blank-visible: einde laatste interval | ${shown(summary.userTiming.blankVisibleEnd)} |`,
      `| eerste texture-upload | ${shown(summary.userTiming.firstTextureUpload)} |`,
    )
    else lines.push(
      '| ttfp, eerste regenframe, regenvenster, blank-visible, texture-upload | niet in deze opname: de app schrijft zijn UserTiming-mijlpalen alleen met `?perf` |',
      `| **ondergrens ttfp (netwerk): tweede regen-Range binnen** | **${shown(relative(load, summary.rainFrames[1]?.end))}** |`,
    )
  }
  return `${lines.join('\n')}\n`
}

function main() {
  const args = process.argv.slice(2)
  const originIndex = args.indexOf('--motregen')
  const motregenOrigin = new RegExp(originIndex >= 0 ? args.splice(originIndex, 2)[1]! : 'ageq-dev2:43\\d\\d|motregen\\.nl|localhost:\\d+|127\\.0\\.0\\.1:\\d+')
  if (!args.length) throw new Error('Gebruik: pnpm prof:firefox <profiel.json[.gz]>… [--motregen <origin-regex>]')
  for (const path of args) {
    const profile = readFirefoxProfile(path)
    const loads = pageLoads(profile, motregenOrigin)
    console.log(`# ${path}\n\n${profile.meta.product ?? 'Firefox'}, ${profile.meta.oscpu ?? 'onbekend systeem'}; ${loads.length} paginalading(en) van Buienradar of motregen.\n`)
    for (const load of loads) console.log(renderPageLoad(load))
  }
}

if (process.argv[1]?.endsWith('firefox-profile.ts')) main()
