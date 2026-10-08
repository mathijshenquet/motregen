import { readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'

if (process.argv.length < 3) throw new Error('Geef een map met drie rapporten en raw.json op')
for (const directory of process.argv.slice(2)) {
  const reports = readdirSync(directory).filter((name) => /-run\d+\.json$/.test(name))
  if (reports.length !== 3) throw new Error(`${directory}: verwacht drie opnames`)
  console.log(`\n${basename(directory)}`)
  for (const name of reports.sort()) {
    const report = JSON.parse(readFileSync(join(directory, name), 'utf8'))
    const raw = JSON.parse(readFileSync(join(directory, name.replace('.json', '.raw.json')), 'utf8'))
    if (report.meta.loadAverage >= 8 || report.wire.findings.length) throw new Error(`${name}: load of bytebronnen ongeldig`)
    const requests = raw.requests.filter((request) => request.startMs < 6_000)
    const archive = requests.find((request) => request.url.includes('.pmtiles'))
    console.log(JSON.stringify({
      run: name, profile: report.meta.profile, scenario: report.meta.scenario, cache: 'koud',
      basemap: archive ? new URL(archive.url).pathname : 'synthetische vectorfixture',
      cpuRate: report.meta.cpuThrottleRate, rendererQuota: report.meta.rendererCpuQuotaPercent,
      gridScale: report.meta.synthGridScale, network: report.meta.network, load: report.meta.loadAverage,
      ttfrMs: report.milestones.ttfrMs, ttfpMs: report.milestones.ttfpMs,
    }))
    console.log('| stap | start ms | einde ms | bodybytes | Range |')
    console.log('| --- | ---: | ---: | ---: | --- |')
    for (const request of requests.filter((request) => /style|\.pbf|\.pmtiles|manifest/.test(request.url))) {
      console.log(`| ${new URL(request.url).pathname} | ${Math.round(request.startMs)} | ${Math.round(request.endMs)} | ${request.encodedBodyBytes} | ${request.range ?? '—'} |`)
    }
    for (const phase of raw.entries.measures.filter((phase) => phase.phase === 'basemap-tile')) {
      console.log(`| kaartfase request→sourcedata | ${Math.round(phase.startTime)} | ${Math.round(phase.startTime + phase.duration)} | — | — |`)
    }
    console.log(`| basiskaart/ttfr render | — | ${report.milestones.basemapReadyMs} | — | — |`)
  }
}
