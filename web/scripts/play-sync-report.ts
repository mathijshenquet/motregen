import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { PerfSnapshot, PerfTraceSlice, LoadTraceSnapshot } from '../src/core/perf'

interface Capture {
  origin: string
  profile: string
  warm: boolean
  screenshotOverhead: boolean
  manifestGenerated: string
  loadSamples: Array<{ ms: number; load: number }>
  snapshot: PerfSnapshot
  entries: PerfTraceSlice
  loads: LoadTraceSnapshot
  resources: Array<{ name: string; startTime: number; requestStart: number; responseStart: number; responseEnd: number; transferSize: number; nextHopProtocol: string }>
  requests: Array<{ protocol: string; fromDiskCache: boolean; fromServiceWorker: boolean }>
}

const [directory, output] = process.argv.slice(2)
if (!directory || !output) throw new Error('Gebruik: play-sync-report.ts CAPTUREMAP UITVOERPREFIX')
mkdirSync(dirname(output), { recursive: true })
const median = (values: number[]) => {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted.length ? sorted[Math.floor(sorted.length / 2)]! : null
}
const rounded = (value: number | null | undefined) => value == null ? null : Math.round(value * 10) / 10
const compact = readdirSync(directory).filter((name) => name.endsWith('.json')).map((name) => {
  const capture = JSON.parse(readFileSync(join(directory, name), 'utf8')) as Capture
  const afterPlay = capture.entries.longFrames.filter((frame) => frame.startTime >= (capture.snapshot.ttfpMs ?? Infinity) && frame.startTime + frame.duration <= 12_000)
  const header = capture.resources.find((entry) => entry.name.endsWith('.pmtiles'))
  const weatherHeaders = capture.loads.requests.filter((request) => request.layer === 'header' && !/\/(?:rtcor|nowcast|seamless|uv|uv_clear)-/.test(request.url))
  const queue = header && header.requestStart > 0 ? header.requestStart - header.startTime : null
  return {
    name: name.replace('.json', ''), origin: capture.origin, profile: capture.profile,
    warm: capture.warm, screenshotOverhead: capture.screenshotOverhead,
    manifestGenerated: capture.manifestGenerated,
    startLoad: capture.loadSamples[0]!.load,
    meanLoad: rounded(capture.loadSamples.reduce((sum, sample) => sum + sample.load, 0) / capture.loadSamples.length),
    milestones: Object.fromEntries(['ttfrMs', 'ttfpMs', 'styleReadyMs', 'firstRainMs', 'firstCursorMs', 'firstBasemapTileMs', 'basemapReadyMs', 'mapRevealedMs', 'ttfhMs'].map((key) => [key, capture.snapshot[key as keyof PerfSnapshot]])),
    pmtilesHeader: header ? { startMs: rounded(header.startTime), endMs: rounded(header.responseEnd), queueMs: rounded(queue) } : null,
    harmonieHeaderStartMs: rounded(Math.min(...weatherHeaders.map((request) => request.startMs))),
    harmonieHeadersBeforeMap: header ? weatherHeaders.filter((request) => request.startMs < header.startTime).length : null,
    protocols: [...new Set(capture.requests.map((request) => request.protocol).filter(Boolean))],
    cacheResponses: capture.requests.filter((request) => request.fromDiskCache || request.fromServiceWorker).length,
    decodes: capture.loads.frames.filter((frame) => frame.decodedMs !== undefined).length,
    resourceTransferBytes: capture.resources.reduce((sum, entry) => sum + entry.transferSize, 0),
    afterPlay: { count: afterPlay.length, over250: afterPlay.filter((frame) => frame.duration > 250).length, maxMs: rounded(Math.max(0, ...afterPlay.map((frame) => frame.duration))), totalMs: rounded(afterPlay.reduce((sum, frame) => sum + frame.duration, 0)) },
  }
})
const rows = ['| transport / profiel / cache | A→B klokstart ms | A→B framewissel ms | A→B style.load ms | A→B eerste tegel ms | A→B volledige kaart ms | mediane Δ klok / framewissel |', '| --- | ---: | ---: | ---: | ---: | ---: | ---: |']
const pairs: object[] = []
for (const transport of ['h1', 'h2']) for (const profile of ['desktop', 'po-android']) for (const cache of ['cold', 'warm']) {
  const paired = [1, 2, 3].flatMap((index) => {
    const prefix = `${transport}-${profile}-${cache}`
    const reference = compact.find((run) => run.name === `${prefix}-reference-${index}`)
    const candidate = compact.find((run) => run.name === `${prefix}-candidate-${index}`)
    return reference && candidate ? [{ index, reference, candidate }] : []
  })
  if (!paired.length) continue
  const milestone = (side: 'reference' | 'candidate', key: string) => median(paired.flatMap((pair) => typeof pair[side].milestones[key] === 'number' ? [pair[side].milestones[key] as number] : []))
  const delta = (key: string) => median(paired.map((pair) => (pair.candidate.milestones[key] as number) - (pair.reference.milestones[key] as number)))
  const shown = (key: string) => `${rounded(milestone('reference', key))}→${rounded(milestone('candidate', key))}`
  rows.push(`| ${transport} / ${profile} / ${cache} (${paired.length}/3) | ${shown('ttfrMs')} | ${shown('ttfpMs')} | ${shown('styleReadyMs')} | ${shown('firstBasemapTileMs')} | ${shown('basemapReadyMs')} | ${rounded(delta('ttfrMs'))} / ${rounded(delta('ttfpMs'))} ms |`)
  pairs.push({ transport, profile, cache, paired })
}
writeFileSync(`${output}.json`, JSON.stringify({ captures: compact, pairs }, null, 2))
writeFileSync(`${output}.md`, `${rows.join('\n')}\n\nAlle tijden uit gelijke instrumentatie. HTTP1.1: eigen GRID6-fixture op Vite-preview; HTTP2: lokale TLS-reviewproxy op https://motregen.nl, frontend A/B lokaal en weerdata van prod met vastgezet manifest. Geen deploy. Warm = nieuw browserproces met gevulde HTTP- en SW-diskcache. Resource-transferbytes zijn observaties, geen wire-budgetclaim.\n`)
for (const name of readdirSync(directory).filter((name) => name.endsWith('.json'))) {
  const capture = JSON.parse(readFileSync(join(directory, name), 'utf8')) as Capture
  const resources = capture.resources.filter((entry) => entry.startTime < 6_000).sort((left, right) => left.startTime - right.startTime)
  const width = 1200, labelWidth = 420, scale = (width - labelWidth - 40) / 6_000
  const escape = (text: string) => text.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
  const bars = resources.map((entry, index) => {
    const label = new URL(entry.name).pathname.split('/').at(-1)!.slice(0, 60)
    const start = labelWidth + entry.startTime * scale
    const color = entry.name.endsWith('.pmtiles') ? '#15803d' : entry.name.endsWith('.mrf') ? '#2563eb' : '#64748b'
    const duration = Math.max(1, Math.min(6_000, entry.responseEnd) - entry.startTime) * scale
    return `<text x="8" y="${55 + index * 18}" font-size="11">${escape(label)}</text><rect x="${start}" y="${43 + index * 18}" width="${duration}" height="13" fill="${color}"/><title>${escape(entry.name)} ${rounded(entry.startTime)}→${rounded(entry.responseEnd)} ms</title>`
  })
  const ticks = Array.from({ length: 7 }, (_, index) => `<text x="${labelWidth + index * 1_000 * scale}" y="30" font-size="12">${index}s</text>`)
  writeFileSync(join(directory, name.replace('.json', '.svg')), `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${resources.length * 18 + 65}" font-family="sans-serif"><rect width="100%" height="100%" fill="white"/><text x="8" y="20">${escape(name)}</text>${ticks.join('')}${bars.join('')}</svg>`)
}
console.log(rows.join('\n'))
