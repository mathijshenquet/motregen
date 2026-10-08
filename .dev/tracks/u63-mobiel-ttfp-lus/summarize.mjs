import { readFileSync, readdirSync } from 'node:fs'
import { basename, join } from 'node:path'

function median(values) {
  const ordered = values.filter((value) => value !== null).sort((left, right) => left - right)
  if (!ordered.length) return null
  const middle = Math.floor(ordered.length / 2)
  return ordered.length % 2 ? ordered[middle] : (ordered[middle - 1] + ordered[middle]) / 2
}

if (process.argv.length < 3) throw new Error('Geef één of meer mappen met rapporten en raw.json op')
for (const directory of process.argv.slice(2)) {
  const runs = readdirSync(directory).filter((name) => /^po-android-koud-spelend(?:-dev)?-run\d+\.json$/.test(name)).map((name) => {
    const report = JSON.parse(readFileSync(join(directory, name), 'utf8'))
    const raw = JSON.parse(readFileSync(join(directory, name.replace('.json', '.raw.json')), 'utf8'))
    if (report.meta.loadAverage >= 8 || report.wire.findings.length) throw new Error(`${name}: ongeldige meetbron of loadavg`)
    const startedPlaying = report.milestones.ttfpMs
    if (startedPlaying === null) throw new Error(`${name}: ttfp ontbreekt`)
    const afterPlay = raw.entries.longFrames.filter((frame) => frame.startTime >= startedPlaying && frame.startTime + frame.duration <= 30_000)
    return {
      run: name.match(/run\d+/)[0],
      ttfrMs: report.milestones.ttfrMs,
      ttfpMs: startedPlaying,
      firstMapImageMs: report.decode.phases['milestone:first-map-image']?.p50Ms ?? null,
      firstRainMs: report.milestones.firstRainMs,
      basemapReadyMs: report.milestones.basemapReadyMs,
      ttfhMs: report.milestones.ttfhMs,
      loafAfterPlayCount: afterPlay.length,
      loafAfterPlayOver100: afterPlay.filter((frame) => frame.duration > 100).length,
      loafAfterPlayOver250: afterPlay.filter((frame) => frame.duration > 250).length,
      loafAfterPlayMs: afterPlay.reduce((total, frame) => total + frame.duration, 0),
      loafAfterPlayBlockingMs: afterPlay.reduce((total, frame) => total + frame.blockingDuration, 0),
      loafAfterPlayMaxMs: Math.max(0, ...afterPlay.map((frame) => frame.duration)),
      decodes: report.decode.phases['frame-decode'].count,
      bodyBytes: report.wire.playwright.total.bytes,
      load: report.meta.loadAverage,
    }
  })
  if (runs.length !== 3) throw new Error(`${directory}: verwacht drie geldige opnames`)
  console.log(basename(directory))
  console.table(runs)
  console.log('Mediaan:', JSON.stringify(Object.fromEntries(Object.keys(runs[0]).filter((key) => key !== 'run').map((key) => {
    const value = median(runs.map((run) => run[key]))
    return [key, value === null ? null : Math.round(value * 10) / 10]
  }))))
}
