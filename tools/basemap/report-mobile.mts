import { appendFileSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { MobileReport } from '../../web/scripts/mobile-report'

const root = fileURLToPath(new URL('../..', import.meta.url))
const directory = resolve(root, '.dev/tracks/u60-basiskaart-afwerking')
const receiptPath = resolve(directory, 'perf-mobile.json')
const previous = JSON.parse(readFileSync(receiptPath, 'utf8'))
const manifest = JSON.parse(readFileSync(resolve(root, 'tools/basemap/tiles/manifest.json'), 'utf8'))
const rounds = previous.rounds.map((round: { run: number; before: { meta: MobileReport['meta']; wire: MobileReport['wire']['playwright']; basemap: { totalMs: number }; decodes: number } }) => {
  const report: MobileReport = JSON.parse(readFileSync(resolve(root, `web/tmp/perf-mobile/mobile-4g-koud-run${round.run}.json`), 'utf8'))
  const basemap = report.decode.phases['basemap-tile']
  const decodes = report.decode.phases['frame-decode']?.count
  if (report.meta.basemapContractHash !== round.before.meta.basemapContractHash) throw new Error('U59-receipt heeft een ander meetcontract')
  if (!basemap || basemap.totalMs > 1_000) throw new Error(`Run ${round.run}: kaartfase overschrijdt 1 s`)
  if (report.wire.playwright.tiles.bytes > round.before.wire.tiles.bytes * 1.25) throw new Error(`Run ${round.run}: kaartbytes overschrijden U59 +25 %`)
  if (report.wire.playwright.total.bytes > round.before.wire.total.bytes * 1.25) throw new Error(`Run ${round.run}: totaalbytes overschrijden U59 +25 %`)
  // De rig bewaart deze bundelposities; alleen hun CPU-brontoeschrijving ontbreekt.
  const failures = report.findings.filter(finding => !/^\d+ sampleposities zonder sourcemap-positie; oorspronkelijke bundelpositie bewaard$/.test(finding))
  if (report.wire.findings.length || failures.length || decodes !== round.before.decodes) throw new Error(`Run ${round.run}: onvolledig meetreceipt`)
  return {
    run: round.run,
    before: round.before,
    after: { meta: report.meta, basemap, wire: report.wire.playwright, findings: report.findings, decodes },
    tileGrowthPercent: (report.wire.playwright.tiles.bytes / round.before.wire.tiles.bytes - 1) * 100,
    totalGrowthPercent: (report.wire.playwright.total.bytes / round.before.wire.total.bytes - 1) * 100,
  }
})
writeFileSync(receiptPath, `${JSON.stringify({ profile: 'mobile-4g', scenario: 'koud', filename: manifest.filename, rounds }, null, 2)}\n`)
const lines = [
  `\n## ${new Date().toISOString()} — Mobiele eindgate (${manifest.filename})\n`,
  '| Run | Kaartfase U59 / U60 ms | Kaartbytes U59 / U60 | Groei kaartbytes | Totaalbytes U59 / U60 | Groei totaalbytes |',
  '| --- | ---: | ---: | ---: | ---: | ---: |',
  ...rounds.map(({ run, before, after }: typeof rounds[number]) => `| ${run} | ${before.basemap.totalMs.toFixed(1)} / ${after.basemap.totalMs.toFixed(1)} | ${before.wire.tiles.bytes} / ${after.wire.tiles.bytes} | ${((after.wire.tiles.bytes / before.wire.tiles.bytes - 1) * 100).toFixed(2)} % | ${before.wire.total.bytes} / ${after.wire.total.bytes} | ${((after.wire.total.bytes / before.wire.total.bytes - 1) * 100).toFixed(2)} % |`),
  '', 'Alle drie runs: kaartfase ≤1 s, kaart-/totaalbytes ≤U59 +25 %, gelijk aantal decodes, geen netwerkbevindingen; identiek meetcontract. Diagnostiek over CPU-samples zonder sourcemap-positie blijft in de receipts staan; de oorspronkelijke bundelposities zijn bewaard. Synchrone rig-exit staat in de vervolgentree.', '',
]
appendFileSync(resolve(directory, 'LOG.md'), `${lines.join('\n')}\n`)
console.log(lines.join('\n'))
