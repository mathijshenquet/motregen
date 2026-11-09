// U109: de vroege regenaanvraag per bezoek: wanneer de eerste regenframes gevraagd en gedecodeerd zijn, en wat de
// IndexedDB-bytecache deed (openen, member-lookups). Gebruik: pnpm exec tsx scripts/u109-race.ts <perf:modes-map>...
import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

for (const directory of process.argv.slice(2)) {
  for (const file of readdirSync(directory).filter((name) => name.endsWith('.json')).sort()) {
    const report = JSON.parse(readFileSync(join(directory, file), 'utf8'))
    const trace = report.traced?.loadTrace
    if (!trace) continue
    const rain = trace.frames.filter((frame: { url: string }) => /rtcor|nowcast/.test(frame.url))
      .sort((a: { requestedMs: number }, b: { requestedMs: number }) => a.requestedMs - b.requestedMs).slice(0, 2)
    const store = trace.marks.filter((mark: { kind: string }) => mark.kind === 'store').slice(0, 3)
      .map((mark: { op: string; t: number; ms: number; outcome: string }) => `${mark.op}@${Math.round(mark.t - mark.ms)}+${Math.round(mark.ms)}ms=${mark.outcome}`)
    const frames = rain.map((frame: { requestedMs: number; decodedMs: number }) => `vraag ${Math.round(frame.requestedMs)}→klaar ${Math.round(frame.decodedMs)}`)
    console.log(`${file.replace('-run', ' ').replace('.json', '')}: ttfp ${Math.round(report.milestones.ttfpMs)} ms, load ${report.loadAverage} | ${frames.join(', ')} | ${store.join(' ')}`)
  }
}
