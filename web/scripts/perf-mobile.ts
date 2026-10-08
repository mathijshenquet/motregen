import { readFileSync, readdirSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { resolve } from 'node:path'
import { compactBaseline, compareBaseline, repetitionSpread, type MobileReport, type MobileBaseline } from './mobile-report'
import { median, type ReferenceReport } from './reference-report'
import { performanceProfile } from '../e2e/profiles'
import { hostLoadAverage, permittedStartLoad, rigBuild, rigPorts, waitForQuietHost } from './rig-host'

// Geen scenario op onze fixture maar dezelfde meting op de site van de concurrent, over het echte netwerk.
const REFERENCE_SCENARIO = 'referentie-buienradar'
const WARM_REFERENCE_SCENARIO = 'referentie-buienradar-warm'
function referenceScenario(scenario: string) { return scenario === REFERENCE_SCENARIO || scenario === WARM_REFERENCE_SCENARIO }

const args = process.argv.slice(2)
// Zonder --cpu-rate geldt de page-throttle van het profiel zelf.
const options: { profiles: string[]; scenarios: string[]; repeat: number; baseline: boolean; compare: boolean; requestOrderOnly: boolean; cpuRate?: number; gridScale?: number; rendererQuota?: number; loadWaitMinutes: number; basemap: string } = { profiles: ['mobile-4g'], scenarios: ['koud'], repeat: 1, baseline: false, compare: false, requestOrderOnly: false, loadWaitMinutes: 20, basemap: process.env.MOTREGEN_MOBILE_BASEMAP ?? 'fixture' }
for (let index = 0; index < args.length; index++) {
  const argument = args[index]!
  const [flag, inline] = argument.split('=')
  if (flag === '--baseline') options.baseline = true
  else if (flag === '--paired') process.env.MOTREGEN_RIG_PAIRED = '1'
  else if (flag === '--compare') options.compare = true
  else if (flag === '--request-order') options.requestOrderOnly = true
  else if (['--profile', '--scenario', '--repeat', '--cpu-rate', '--grid-scale', '--renderer-quota', '--load-wait', '--basemap'].includes(flag!)) {
    const value = inline ?? args[++index]
    if (!value || value.startsWith('--')) throw new Error(`${flag} vereist een waarde`)
    if (flag === '--profile') options.profiles = value === 'all' ? ['mobile-4g', 'mobile-fast-3g'] : [value]
    if (flag === '--scenario') options.scenarios = value === 'all' ? ['koud', 'journey', 'modus-wissel-storm'] : value.split(',')
    if (flag === '--repeat') options.repeat = Number(value)
    if (flag === '--cpu-rate') options.cpuRate = Number(value)
    if (flag === '--load-wait') options.loadWaitMinutes = Number(value)
    if (flag === '--grid-scale') options.gridScale = Number(value)
    if (flag === '--renderer-quota') options.rendererQuota = Number(value)
    if (flag === '--basemap') options.basemap = value
  } else throw new Error(`Onbekende optie: ${argument}`)
}
if ((options.baseline || options.compare) && process.env.MOTREGEN_RIG_CPU_TRACE === '1') throw new Error('CPU-profiel is een afzonderlijke diagnose, geen baseline/compare')
if (options.baseline && options.compare) throw new Error('--baseline en --compare sluiten elkaar uit')
if (options.baseline && process.env.MOTREGEN_RIG_PAIRED === '1') throw new Error('--paired mag geen absolute baseline schrijven')
if (options.requestOrderOnly && (options.baseline || options.compare)) throw new Error('--request-order controleert alleen de aanvraagvolgorde en kan geen performancebaseline zetten of vergelijken')
if (!Number.isInteger(options.repeat) || options.repeat < 1 || options.repeat > 10) throw new Error('--repeat moet 1…10 zijn')
if (options.cpuRate !== undefined && (!Number.isFinite(options.cpuRate) || options.cpuRate < 1 || options.cpuRate > 32)) throw new Error('--cpu-rate moet 1…32 zijn')
if (options.baseline && options.repeat < 3) throw new Error('--baseline vereist --repeat 3 (of meer) om determinisme te verifiëren')
const scenarios = JSON.parse(readFileSync('perf/scenarios.json', 'utf8')) as Record<string, unknown>
if (options.profiles.some((profile) => !['desktop', 'mobile-4g', 'mobile-fast-3g', 'po-android'].includes(profile))) throw new Error('Onbekend profiel')
if (!['fixture', 'openfreemap', 'own'].includes(options.basemap)) throw new Error('Onbekende basemap')
if (options.scenarios.some((scenario) => !referenceScenario(scenario) && !(scenario in scenarios))) throw new Error('Onbekend scenario')
if (options.requestOrderOnly && options.scenarios.some(referenceScenario)) throw new Error('--request-order is alleen voor de eigen fixture, niet voor de referentiebenchmark')

const ports = process.env.MOTREGEN_E2E_PORT && process.env.MOTREGEN_E2E_DATA_PORT
  ? { port: Number(process.env.MOTREGEN_E2E_PORT), dataPort: Number(process.env.MOTREGEN_E2E_DATA_PORT) }
  : await rigPorts(process.cwd())
// Het synthraster wordt één keer per aanroep gebouwd, dus alle profielen moeten dezelfde schaal vragen.
const gridScales = new Set(options.profiles.map((profile) => options.gridScale ?? performanceProfile(profile).synthGridScale ?? 1))
if (gridScales.size > 1) throw new Error('Profielen met een verschillende rasterschaal kunnen niet in één aanroep')
const rendererQuotas = new Set(options.profiles.map((profile) => options.rendererQuota ?? performanceProfile(profile).rendererCpuQuotaPercent ?? 0))
if (rendererQuotas.size > 1) throw new Error('Profielen met een verschillende renderer-quota kunnen niet in één aanroep')
const rigEnvironment: NodeJS.ProcessEnv = { ...process.env, MOTREGEN_RIG_RENDERER_QUOTA: String([...rendererQuotas][0]), MOTREGEN_SYNTH_GRID_SCALE: String([...gridScales][0]), MOTREGEN_E2E_PORT: String(ports.port), MOTREGEN_E2E_DATA_PORT: String(ports.dataPort), MOTREGEN_MOBILE_OPTIONS: JSON.stringify(options), MOTREGEN_MOBILE_BASEMAP: options.basemap }
// Rapporten van een eerdere aanroep mogen nooit als uitslag van deze meelopen: een run die nu
// mislukt liet anders zijn oude getal in de samenvatting staan (referentie, 2026-10-08).
if (existsSync('tmp/perf-mobile')) {
  for (const file of readdirSync('tmp/perf-mobile')) {
    const stale = options.profiles.some((profile) => options.scenarios.some((scenario) => file.startsWith(`${profile}-${scenario}-run`)))
    if (stale) rmSync(`tmp/perf-mobile/${file}`, { force: true })
  }
}
// Eerst bouwen, dan pas wachten op een rustige host: zo meet de run de werkboom van het moment
// van de aanroep, ook als er tijdens het wachten verder wordt gewerkt.
if (!options.scenarios.some(referenceScenario)) {
  const commands = rigBuild(ports.port, ports.dataPort, options.basemap)
  rigEnvironment.MOTREGEN_MOBILE_FIXTURE_DIR = commands.fixtureDir
  rigEnvironment.MOTREGEN_RIG_DIST = commands.distDir
  if (process.env.MOTREGEN_RIG_PREBUILT !== '1') {
    const build = spawnSync('bash', ['-c', `${commands.fixtureCommand} && ${commands.buildCommand}`], { stdio: 'inherit', env: rigEnvironment })
    if (build.status !== 0) throw new Error('Rig-build mislukt')
  } else if (!existsSync(commands.distDir) || !existsSync(commands.fixtureDir)) throw new Error('Voorgebouwde rig ontbreekt')
  rigEnvironment.MOTREGEN_RIG_PREBUILT = '1'
}
async function runMeasurement(config: string, title: string): Promise<number> {
  for (;;) {
    if (!options.requestOrderOnly && !await waitForQuietHost(options.loadWaitMinutes * 60_000, (message) => console.log(message))) {
      throw new Error(`Host blijft te druk (loadavg ${hostLoadAverage()}); geen meting`)
    }
    const exactTitle = title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    console.log(`Rig: ${title}, loadavg ${hostLoadAverage()}, poorten ${ports.port}/${ports.dataPort}`)
    const measurementCommand = ['pnpm', 'exec', 'playwright', 'test', '--config', config, '--project', 'desktop', '--grep', `${exactTitle}$`]
    const protectedCommand = options.requestOrderOnly
      ? ['env', 'MOTREGEN_PERF_LOCK_HELD=1', ...measurementCommand]
      : ['pnpm', 'exec', 'tsx', 'scripts/perf-run.ts', ...measurementCommand]
    const run = spawnSync('bash', ['scripts/e2e-slot.sh', 'flock', '-w', '7200', '-o', '/home/mathijs/motregen-perf.lock', ...protectedCommand], {
      stdio: 'inherit', env: rigEnvironment,
    })
    if (run.error) throw run.error
    if (run.status === 75) continue
    return run.status ?? 1
  }
}

async function runMeasurements(config: string): Promise<number> {
  for (const profile of options.profiles) {
    for (const scenario of options.scenarios) {
      for (let repetition = 1; repetition <= options.repeat; repetition++) {
        rigEnvironment.MOTREGEN_RIG_ACTIVE_PROFILE = profile
        const warm = scenario.startsWith('warm-') || scenario === WARM_REFERENCE_SCENARIO
        if (warm) {
          const profileDirectory = resolve(`tmp/perf-mobile/cache-${profile}-${scenario}-run${repetition}`)
          rmSync(profileDirectory, { recursive: true, force: true })
          mkdirSync(profileDirectory, { recursive: true })
          rigEnvironment.MOTREGEN_RIG_WARM_PROFILE = profileDirectory
          const exactTitle = `${profile} / ${scenario} / run ${repetition}`.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
          console.log(`Cachevoorbereiding ${profile}/${scenario}/run${repetition}; geen perf-opname, buiten hostlock`)
          const seed = spawnSync('bash', ['scripts/e2e-slot.sh', 'pnpm', 'exec', 'playwright', 'test', '--config', config, '--project', 'desktop', '--grep', `${exactTitle}$`], {
            stdio: 'inherit', env: { ...rigEnvironment, MOTREGEN_RIG_WARM_SEED: '1' },
          })
          if (seed.status !== 0) return seed.status ?? 1
        } else delete rigEnvironment.MOTREGEN_RIG_WARM_PROFILE
        const status = await runMeasurement(config, `${profile} / ${scenario} / run ${repetition}`)
        if (status !== 0) return status
      }
    }
  }
  return 0
}
console.log(`Rig: loadavg ${hostLoadAverage()}, poorten ${ports.port}/${ports.dataPort}`)
if (options.requestOrderOnly) console.log('Alleen aanvraagvolgorde: hostdrukte toegestaan, tijden zijn geen performancebaseline')

if (options.scenarios.some(referenceScenario)) {
  if (!options.scenarios.every(referenceScenario) || options.baseline || options.compare) throw new Error(`${REFERENCE_SCENARIO} draait los van eigen scenario's, zonder baseline of vergelijking`)
  const referenceStatus = await runMeasurements('playwright.reference.config.ts')
  const rows = ['| profiel | ttfp-ref per run | mediaan | eerste radarbeeld (mediaan) | loadavg per run | weggegooid (load) |', '| --- | ---: | ---: | ---: | ---: | ---: |']
  for (const profile of options.profiles) {
    for (const scenario of options.scenarios) {
    const reports: ReferenceReport[] = []
    for (let repetition = 1; repetition <= options.repeat; repetition++) {
      const path = `tmp/perf-mobile/${profile}-${scenario}-run${repetition}.json`
      if (existsSync(path)) reports.push(JSON.parse(readFileSync(path, 'utf8')))
    }
    const quiet = reports.filter((report) => permittedStartLoad(report.meta.loadAverage))
    const playTimes = quiet.flatMap((report) => report.milestones.ttfpRefMs ?? [])
    const radarTimes = quiet.flatMap((report) => report.milestones.firstRadarMs ?? [])
    rows.push(`| ${profile}/${scenario} | ${playTimes.join(' / ') || 'geen'} ms | ${median(playTimes) ?? '—'} ms | ${median(radarTimes) ?? '—'} ms | ${reports.map((report) => report.meta.loadAverage).join(' / ')} | ${reports.length - quiet.length} |`)
    }
  }
  const referenceSummary = `${rows.join('\n')}\n`
  writeFileSync('tmp/perf-mobile/reference-summary.md', referenceSummary)
  console.log(referenceSummary)
  process.exit(referenceStatus)
}

const runStatus = await runMeasurements('playwright.mobile.config.ts')
if (runStatus !== 0) process.exit(runStatus)
if (options.requestOrderOnly) {
  for (const profile of options.profiles) {
    for (const scenario of options.scenarios) {
      console.log(`${profile}/${scenario}: aanvraagvolgordecapture opgeslagen; geen performancebaseline of timinggate`)
    }
  }
  process.exit(0)
}

let failed = false
const summary: string[] = ['| profiel | scenario | ttfr | ttfp | decodes | bodybytes | spreiding decodes / bytes | ttfh | blank-visible | LoAF 12 s | loadavg | weggegooid (load) |', '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |']
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
    const valid = reports.every((report) => permittedStartLoad(report.meta.loadAverage) && report.wire.findings.length === 0 && report.milestones.ttfrMs !== null && report.milestones.ttfhMs !== null)
    summary.push(`| ${profile} | ${scenario} | ${perRun(reports, (report) => report.milestones.ttfrMs)} | ${perRun(reports, (report) => report.milestones.ttfpMs)} | ${baselines.map((report) => report.decodes).join(' / ')} | ${baselines.map((report) => report.wireBytes).join(' / ')} | ${decodeSpread.toFixed(3)} / ${bytesSpread.toFixed(3)} % | ${perRun(reports, (report) => report.milestones.ttfhMs)} | ${perRun(reports, (report) => report.milestones.blankVisibleMs)} | ${perRun(reports, (report) => report.longFrames.first12s.totalMs)} | ${reports.map((report) => report.meta.loadAverage).join(' / ')} | ${reports.filter((report) => !permittedStartLoad(report.meta.loadAverage)).length} |`)
    if (!stable || !valid) {
      console.error(`${profile}/${scenario}: ${stable ? 'meetbron onvolledig' : 'spreiding ≥5 %'}; baseline wordt niet geschreven`)
      failed = true
      continue
    }
    const baselinePath = `perf/baselines/${profile}-${scenario}${options.basemap === 'fixture' ? '' : `-${options.basemap}`}.json`
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
// Tijden per run plus de mediaan over de runs die op een rustige host liepen; een drukke run is ruis.
function perRun(reports: MobileReport[], pick: (report: MobileReport) => number | null): string {
  const shown = reports.map((report) => { const value = pick(report); return value === null ? '—' : String(Math.round(value)) }).join(' / ')
  const quiet = reports.filter((report) => permittedStartLoad(report.meta.loadAverage)).flatMap((report) => pick(report) ?? [])
  const middle = median(quiet)
  return `${shown} (med ${middle === null ? '—' : Math.round(middle)})`
}
const markdown = `${summary.join('\n')}\n`
writeFileSync('tmp/perf-mobile/summary.md', markdown)
console.log(markdown)
if (failed) process.exitCode = 1
