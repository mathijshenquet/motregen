import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { compactBaseline, compareBaseline, repetitionSpread, type MobileReport, type MobileBaseline } from './mobile-report'

const args = process.argv.slice(2)
const options = { profiles: ['mobile-4g'], scenarios: ['koud'], repeat: 1, baseline: false, compare: false, cpuRate: 4, basemap: process.env.MOTREGEN_MOBILE_BASEMAP ?? 'fixture' }
for (let index = 0; index < args.length; index++) {
  const argument = args[index]!
  const [flag, inline] = argument.split('=')
  if (flag === '--baseline') options.baseline = true
  else if (flag === '--compare') options.compare = true
  else if (['--profile', '--scenario', '--repeat', '--cpu-rate', '--basemap'].includes(flag!)) {
    const value = inline ?? args[++index]
    if (!value || value.startsWith('--')) throw new Error(`${flag} vereist een waarde`)
    if (flag === '--profile') options.profiles = value === 'all' ? ['mobile-4g', 'mobile-fast-3g'] : [value]
    if (flag === '--scenario') options.scenarios = value === 'all' ? ['koud', 'journey', 'modus-wissel-storm'] : [value]
    if (flag === '--repeat') options.repeat = Number(value)
    if (flag === '--cpu-rate') options.cpuRate = Number(value)
    if (flag === '--basemap') options.basemap = value
  } else throw new Error(`Onbekende optie: ${argument}`)
}
if (options.baseline && options.compare) throw new Error('--baseline en --compare sluiten elkaar uit')
if (options.baseline && options.basemap === 'own') throw new Error('Meet het basemap-nulpunt met --basemap openfreemap; --basemap own gebruikt --compare')
if (!Number.isInteger(options.repeat) || options.repeat < 1 || options.repeat > 10) throw new Error('--repeat moet 1…10 zijn')
if (!Number.isFinite(options.cpuRate) || options.cpuRate < 1 || options.cpuRate > 32) throw new Error('--cpu-rate moet 1…32 zijn')
if (options.baseline && options.repeat < 3) throw new Error('--baseline vereist --repeat 3 (of meer) om determinisme te verifiëren')
const scenarios = JSON.parse(readFileSync('perf/scenarios.json', 'utf8')) as Record<string, unknown>
if (options.profiles.some((profile) => !['desktop', 'mobile-4g', 'mobile-fast-3g'].includes(profile))) throw new Error('Onbekend profiel')
if (!['fixture', 'openfreemap', 'own'].includes(options.basemap)) throw new Error('Onbekende basemap')
if (options.scenarios.some((scenario) => !(scenario in scenarios))) throw new Error('Onbekend scenario')

const run = spawnSync('pnpm', ['exec', 'playwright', 'test', '--config', 'playwright.mobile.config.ts', '--project', 'desktop'], {
  stdio: 'inherit',
  env: { ...process.env, MOTREGEN_MOBILE_OPTIONS: JSON.stringify(options), MOTREGEN_MOBILE_BASEMAP: options.basemap },
})
if (run.error) throw run.error
if (run.status !== 0) process.exit(run.status ?? 1)

let failed = false
const summary: string[] = ['| profiel | scenario | decodes | bodybytes | spreiding decodes / bytes |', '| --- | --- | ---: | ---: | ---: |']
for (const profile of options.profiles) {
  for (const scenario of options.scenarios) {
    const reports: MobileReport[] = []
    for (let repetition = 1; repetition <= options.repeat; repetition++) {
      reports.push(JSON.parse(readFileSync(`tmp/perf-mobile/${profile}-${scenario}-run${repetition}.json`, 'utf8')))
    }
    const baselines = reports.map(compactBaseline)
    const bytesSpread = repetitionSpread(baselines.map((report) => report.wireBytes))
    const decodeSpread = repetitionSpread(baselines.map((report) => report.decodes))
    const stable = bytesSpread < 5 && decodeSpread < 5
    const valid = reports.every((report) => report.wire.findings.length === 0 && report.milestones.ttfrMs !== null && report.milestones.ttfhMs !== null)
    summary.push(`| ${profile} | ${scenario} | ${baselines.map((report) => report.decodes).join(' / ')} | ${baselines.map((report) => report.wireBytes).join(' / ')} | ${decodeSpread.toFixed(3)} / ${bytesSpread.toFixed(3)} % |`)
    if (!stable || !valid) {
      console.error(`${profile}/${scenario}: ${stable ? 'meetbron onvolledig' : 'spreiding ≥5 %'}; baseline wordt niet geschreven`)
      failed = true
      continue
    }
    const baselinePath = `perf/baselines/${profile}-${scenario}${options.basemap === 'fixture' ? '' : '-openfreemap'}.json`
    if (options.baseline) {
      mkdirSync('perf/baselines', { recursive: true })
      const medianBytes = [...baselines].sort((left, right) => left.wireBytes - right.wireBytes)[Math.floor(baselines.length / 2)]!
      writeFileSync(baselinePath, `${JSON.stringify(medianBytes, null, 2)}\n`)
    }
    if (options.compare) {
      if (!existsSync(baselinePath)) throw new Error(`Baseline ontbreekt: ${baselinePath}`)
      const expected = JSON.parse(readFileSync(baselinePath, 'utf8')) as MobileBaseline
      for (const actual of baselines) {
        if (options.basemap !== 'fixture') {
          if (!actual.metrics?.basemapContractHash || actual.metrics.basemapContractHash !== expected.metrics?.basemapContractHash) throw new Error('Basemap-nulpunt heeft een ander weer-/viewport-/throttle-/rigcontract; meet opnieuw')
        }
        const comparison = compareBaseline(options.basemap === 'fixture' ? actual : { ...actual, contractHash: expected.contractHash }, expected)
        console.log(`${profile}/${scenario}: wire ${comparison.wireDeltaPercent.toFixed(3)} %, decodes ${comparison.decodeDeltaPercent.toFixed(3)} %, ${comparison.passed ? 'groen' : 'REGRESSIE'}`)
        if (!comparison.passed) failed = true
        if (options.basemap === 'own') {
          const phases = (actual.metrics?.decode as MobileReport['decode']).phases['basemap-tile']
          const passed = phases !== undefined && phases.count > 0 && phases.p50Ms !== null && (profile === 'desktop' || phases.totalMs <= 1_000)
          const totalStatus = profile === 'desktop' ? 'desktop informatief' : passed ? 'totaalgate ≤1000 ms groen' : 'TOTAALGATE NIET GEHAALD'
          console.log(`Eigen basemap: totaal ${phases?.totalMs ?? 'onbekend'} ms; ${totalStatus}; p50 ${phases?.p50Ms ?? 'onbekend'} ms (vervolgstreefwaarde ≤300 ms)`)
          if (!passed) failed = true
        }
      }
    }
  }
}
const markdown = `${summary.join('\n')}\n`
writeFileSync('tmp/perf-mobile/summary.md', markdown)
console.log(markdown)
if (failed) process.exitCode = 1
