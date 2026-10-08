import { readFileSync, writeFileSync } from 'node:fs'
import type { PerfTraceSlice } from '../src/core/perf'
import type { MobileReport, WireRequest } from './mobile-report'

interface NativeResource {
  url: string
  startMs: number
  endMs: number
  encodedBodyBytes: number
}

interface RawCapture {
  requests: WireRequest[]
  pageResourceTiming: NativeResource[]
  workerResourceTiming: NativeResource[]
  entries: PerfTraceSlice
}

const paths = process.argv.slice(2)
if (!paths.length) throw new Error('Gebruik: pnpm exec tsx scripts/place-waterfall.ts tmp/perf-mobile/<profiel>-koud-spelend-run1.raw.json')

for (const path of paths) {
  if (!path.endsWith('.raw.json')) throw new Error(`Geen rig-capture: ${path}`)
  const output = path.slice(0, -'.raw.json'.length)
  const raw = JSON.parse(readFileSync(path, 'utf8')) as RawCapture
  const report = JSON.parse(readFileSync(`${output}.json`, 'utf8')) as MobileReport
  const resources = [...raw.pageResourceTiming, ...raw.workerResourceTiming].sort((left, right) => left.startMs - right.startMs)
  const milestone = raw.entries.measures.find((entry) => entry.phase === 'milestone:ttfp')
  if (!milestone) throw new Error(`${path}: milestone:ttfp ontbreekt`)
  const ttfpMs = milestone.startTime + milestone.duration
  const manifest = resources.find((entry) => /\/manifest\.json$/.test(entry.url))
  const style = resources.find((entry) => /\/style(?:-(?:light|dark))?\.json$/.test(entry.url))
  const firstRange = raw.requests.filter((entry) => entry.range && /\/(?:rtcor|nowcast|seamless|harmonie)-[^/]+\.mrf$/.test(entry.url))
    .sort((left, right) => left.startMs - right.startMs)[0]
  const rain = firstRange && resources.filter((entry) => entry.url === firstRange.url)
    .sort((left, right) => Math.abs(left.startMs - firstRange.startMs) - Math.abs(right.startMs - firstRange.startMs))[0]
  const catalogue = resources.find((entry) => /\/plaatsen-[0-9a-f]{16}\.json$/.test(entry.url))
  if (!manifest || !style || !rain || !catalogue || !firstRange) throw new Error(`${path}: Resource Timing-waterval onvolledig`)
  if (Math.abs(rain.startMs - firstRange.startMs) > 2) throw new Error(`${path}: eerste regen-Range niet eenduidig aan native Resource Timing gekoppeld`)
  if (catalogue.startMs <= Math.max(ttfpMs, manifest.startMs, style.startMs, rain.startMs)) throw new Error(`${path}: plaatsenlijst te vroeg gevraagd`)
  const rows = [
    { label: 'manifest', ...manifest },
    { label: 'stijl', ...style },
    { label: 'eerste regen-Range', ...rain, range: firstRange.range },
    { label: 'plaatsenlijst', ...catalogue },
  ]
  const measurement = { meta: report.meta, ttfpMs, catalogueAfterTtfpMs: catalogue.startMs - ttfpMs, rows }
  writeFileSync(`${output}.plaatsen.json`, `${JSON.stringify(measurement, null, 2)}\n`)

  const chartLeft = 210
  const chartWidth = 620
  const maximumMs = Math.max(catalogue.endMs, ttfpMs) * 1.08
  const position = (milliseconds: number) => chartLeft + milliseconds / maximumMs * chartWidth
  const bars = rows.map((row, index) => {
    const y = 85 + index * 44
    const color = row.label === 'plaatsenlijst' ? '#207345' : '#2767a5'
    return `<text x="16" y="${y + 14}">${row.label}</text><rect x="${position(row.startMs)}" y="${y}" width="${Math.max(2, position(row.endMs) - position(row.startMs))}" height="20" fill="${color}"/><text x="${position(row.startMs)}" y="${y + 36}" font-size="12">${row.startMs.toFixed(1)}–${row.endMs.toFixed(1)} ms</text>`
  }).join('')
  const ttfpX = position(ttfpMs)
  writeFileSync(`${output}.plaatsen.svg`, `<svg xmlns="http://www.w3.org/2000/svg" width="880" height="320" viewBox="0 0 880 320"><rect width="880" height="320" fill="white"/><g font-family="sans-serif" font-size="14" fill="#162833"><text x="16" y="27" font-size="18">${report.meta.profile} — native Resource Timing, koude start</text><text x="16" y="52">Plaatsenlijst +${measurement.catalogueAfterTtfpMs.toFixed(1)} ms na milestone:ttfp</text><line x1="${ttfpX}" x2="${ttfpX}" y1="70" y2="266" stroke="#a73a26" stroke-width="2" stroke-dasharray="5 4"/>${bars}<text x="16" y="292" fill="#a73a26">milestone:ttfp = ${ttfpMs.toFixed(1)} ms; alle tijden vanaf navigation timeOrigin</text></g></svg>\n`)
  console.log(`${report.meta.profile}: ttfp ${ttfpMs.toFixed(1)} ms; plaatsenlijst ${catalogue.startMs.toFixed(1)} ms (+${measurement.catalogueAfterTtfpMs.toFixed(1)} ms), ${catalogue.encodedBodyBytes} bodybytes → ${output}.plaatsen.svg`)
}
