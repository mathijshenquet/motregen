import { readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'

if (process.argv.length < 3) throw new Error('Geef een map met drie rapporten en raw.json op')
for (const directory of process.argv.slice(2)) {
  const reports = readdirSync(directory).filter((name) => /-run\d+\.json$/.test(name))
  const counts = new Map()
  for (const name of reports) {
    const group = name.replace(/-run\d+\.json$/, '')
    counts.set(group, (counts.get(group) ?? 0) + 1)
  }
  if (!reports.length || [...counts.values()].some(count => count !== 3)) throw new Error(`${directory}: verwacht drie opnames per scenario`)
  console.log(`\n${basename(directory)}`)
  for (const name of reports.sort()) {
    const report = JSON.parse(readFileSync(join(directory, name), 'utf8'))
    const raw = JSON.parse(readFileSync(join(directory, name.replace('.json', '.raw.json')), 'utf8'))
    if (report.meta.requestOrderOnly) throw new Error(`${name}: gebruik place-waterfall.ts voor een niet-perf-capture`)
    if (report.meta.loadAverage > (report.meta.measurementKind === 'paired' && report.meta.maxStartLoadAverage === 16 ? 16 : 8) || report.wire.findings.length) throw new Error(`${name}: load of bytebronnen ongeldig`)
    const requests = raw.requests.filter((request) => request.startMs < 6_000)
    const archive = requests.find((request) => request.url.includes('.pmtiles'))
    console.log(JSON.stringify({
      run: name, profile: report.meta.profile, scenario: report.meta.scenario, cache: report.meta.cacheState ?? 'cold',
      basemap: archive ? new URL(archive.url).pathname : 'synthetische vectorfixture',
      cpuRate: report.meta.cpuThrottleRate, rendererQuota: report.meta.rendererCpuQuotaPercent,
      gridScale: report.meta.synthGridScale, network: report.meta.network, load: report.meta.loadAverage,
      ttfrMs: report.milestones.ttfrMs, ttfpMs: report.milestones.ttfpMs,
    }))
    console.log('| stap | start ms | einde ms | netwerkbodybytes | Range | eigenaar / SW | cacheheader |')
    console.log('| --- | ---: | ---: | ---: | --- | --- | --- |')
    for (const request of requests.filter((request) => /style|\/basemap\/.*json|\.pbf|\.pmtiles|manifest|plaatsen-[0-9a-f]+\.json/.test(request.url))) {
      console.log(`| ${new URL(request.url).pathname} | ${Math.round(request.startMs)} | ${Math.round(request.endMs)} | ${request.encodedBodyBytes} | ${request.range ?? '—'} | ${request.owner ?? 'client'} / ${request.fromServiceWorker ?? false} | ${request.cacheControl ?? '—'} |`)
    }
    for (const phase of raw.entries.measures.filter((phase) => phase.phase === 'basemap-tile')) {
      console.log(`| kaartfase request→sourcedata | ${Math.round(phase.startTime)} | ${Math.round(phase.startTime + phase.duration)} | — | — |`)
    }
    console.log(`| basiskaart/ttfr render | — | ${report.milestones.basemapReadyMs} | — | — |`)
    const catalogueRequests = raw.requests.filter((request) => /\/plaatsen-[0-9a-f]+\.json/.test(request.url))
    const firstPlay = raw.entries.measures.find((phase) => phase.phase === 'milestone:ttfp')?.duration ?? report.milestones.ttfpMs
    if (/^(koud|warm)-spelend/.test(report.meta.scenario) && firstPlay !== null && catalogueRequests.some((request) => request.startMs < firstPlay)) {
      throw new Error(`${name}: plaatsenlijst vóór ttfp aangevraagd`)
    }
    console.log(JSON.stringify({ ttfpMs: firstPlay, catalogueRequests: catalogueRequests.map((request) => ({ path: new URL(request.url).pathname, startMs: request.startMs, afterTtfpMs: firstPlay === null ? null : request.startMs - firstPlay, bytes: request.encodedBodyBytes })) }))
  }
}
