import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fidelityComparison, type summarizeReference } from './mobile-fidelity'
import type { MobileReport } from './mobile-report'

const [directory, output = 'perf/calibration.json'] = process.argv.slice(2)
if (!directory) throw new Error('Gebruik: tsx scripts/mobile-calibration.ts <map met rigrapporten> [uitvoer.json]')
const reference = JSON.parse(readFileSync('perf/po-fidelity.json', 'utf8')) as { chrome: ReturnType<typeof summarizeReference> & { source: string; sha256: string } }
const observations = readdirSync(directory).filter((file) => file.endsWith('.json')).sort().map((file) => {
  const report = JSON.parse(readFileSync(join(directory, file), 'utf8')) as MobileReport
  const comparison = fidelityComparison({ anchor: 'navigation', phases: report.decode.phases, decodesPerSecond: report.decode.decodesPerSecond, encodedBodyBytes: null }, reference.chrome)
  const decode = comparison['frame-decode']!
  const withinThirtyPercent = decode.p50DeltaPercent !== null && decode.p95DeltaPercent !== null && Math.abs(decode.p50DeltaPercent) <= 30 && Math.abs(decode.p95DeltaPercent) <= 30
  return {
    profile: report.meta.profile,
    scenario: report.meta.scenario,
    cpuThrottleRate: report.meta.cpuThrottleRate,
    sourceSha: report.meta.sourceSha,
    capturedAt: report.meta.capturedAt,
    fixtureHash: report.meta.fixtureHash,
    contractHash: report.meta.contractHash,
    bodyBytes: report.wire.playwright.total.bytes,
    phases: report.decode.phases,
    decodesPerSecond: report.decode.decodesPerSecond,
    versusHistoricalChrome: comparison,
    decodeDistributionWithinThirtyPercent: withinThirtyPercent,
  }
})
writeFileSync(output, `${JSON.stringify({
  reference: { source: reference.chrome.source, sha256: reference.chrome.sha256 },
  limitations: ['Verschillende clientversie, codec, dataset en scenario', 'Referentiehistogram vanaf eerste event, rig vanaf navigatie', 'Geen netwerkbytes in de PO-opname', 'CDP CPU-throttle geldt niet voor workers; GPU/thermiek niet geëemuleerd'],
  observations,
}, null, 2)}\n`)
console.log(`CPU/netwerkvergelijking: ${output}`)
