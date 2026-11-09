import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { MAP_MODES, median, renderSummary, withRecomputedTotals, type MapMode, type VisitReport } from './perf-modes-report'
import { rigPorts } from './rig-host'

// U102 meetsuite (C7): `pnpm perf:modes [--target prod|build] [--origin URL] [--modes weer,wind|all]
// [--profiles telefoon,desktop] [--repeat N] [--no-interactions]`. Op aanvraag en in de dagelijkse run, nooit per merge.
// build (standaard) = deze werkboom gebouwd en geserveerd met vite preview, data van https://motregen.nl/data;
//   de proxy haalt het sessiemerk weg, dus de bezoeken tellen niet in het dagrapport.
// prod = https://motregen.nl zoals hij live staat; sessies krijgen het meetlabel perf-u102 (MIP-35), geen baken.

const LIVE_ORIGIN = 'https://motregen.nl'
const args = process.argv.slice(2)
// `--summary-only <map>`: alleen de samenvatting van een eerdere run opnieuw maken.
if (args[0] === '--summary-only') {
  const directory = resolve(args[1] ?? '')
  const reports = readReports(directory).map(withRecomputedTotals)
  const summary = summaryText(directory.split('/').at(-1)!, reports[0]?.origin ?? '?', reports)
  writeFileSync(join(directory, 'summary.md'), summary)
  console.log(summary)
  process.exit(0)
}
const settings = { target: 'build', origin: undefined as string | undefined, modes: [...MAP_MODES] as MapMode[], profiles: ['telefoon', 'desktop'], repeat: 1, interactions: true }
for (let index = 0; index < args.length; index++) {
  const [flag, inline] = args[index]!.split('=')
  const value = () => {
    const found = inline ?? args[++index]
    if (!found || found.startsWith('--')) throw new Error(`${flag} vereist een waarde`)
    return found
  }
  if (flag === '--target') settings.target = value()
  else if (flag === '--origin') settings.origin = value()
  else if (flag === '--modes') { const list = value(); settings.modes = list === 'all' ? [...MAP_MODES] : list.split(',') as MapMode[] }
  else if (flag === '--profiles') settings.profiles = value().split(',')
  else if (flag === '--repeat') settings.repeat = Number(value())
  else if (flag === '--no-interactions') settings.interactions = false
  else throw new Error(`Onbekende optie: ${args[index]}`)
}
if (!['prod', 'build'].includes(settings.target)) throw new Error('--target is prod of build')
if (settings.modes.some((mode) => !MAP_MODES.includes(mode))) throw new Error(`Onbekende modus; kies uit ${MAP_MODES.join(', ')}`)
if (settings.profiles.some((profile) => !['telefoon', 'desktop'].includes(profile))) throw new Error('Profielen: telefoon, desktop')
if (!Number.isInteger(settings.repeat) || settings.repeat < 1 || settings.repeat > 10) throw new Error('--repeat moet 1…10 zijn')

const stamp = new Date().toISOString().replace(/[:.]/g, '-')
const outputDirectory = resolve(`tmp/perf-modes/${stamp}`)
mkdirSync(outputDirectory, { recursive: true })

let preview: ChildProcess | undefined
let origin = settings.origin ?? LIVE_ORIGIN
if (settings.target === 'build' && !settings.origin) {
  const build = spawnSync('pnpm', ['build'], { stdio: 'inherit' })
  if (build.status !== 0) throw new Error('Build mislukt')
  const { port } = await rigPorts(process.cwd())
  origin = `http://127.0.0.1:${port}`
  preview = spawn('pnpm', ['exec', 'vite', 'preview', '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {
    stdio: 'ignore', env: { ...process.env, MOTREGEN_DATA_ORIGIN: `${LIVE_ORIGIN}/data` }, detached: true,
  })
  await waitForOrigin(origin)
}

console.log(`perf:modes → ${origin}; modi ${settings.modes.join(', ')}; profielen ${settings.profiles.join(', ')}; ${settings.repeat}×; uitvoer ${outputDirectory}`)
const suiteOptions = { origin, modes: settings.modes, profiles: settings.profiles, repeat: settings.repeat, outputDirectory, interactions: settings.interactions }
const run = spawnSync('bash', ['scripts/perf-lock.sh', 'scripts/e2e-slot.sh', 'pnpm', 'exec', 'playwright', 'test', '--config', 'playwright.perf-modes.config.ts', '--project', 'perf'], {
  stdio: 'inherit', env: { ...process.env, MOTREGEN_PERF_MODES_OPTIONS: JSON.stringify(suiteOptions) },
})
if (preview?.pid) process.kill(-preview.pid, 'SIGTERM')

const reports = readReports(outputDirectory)
const summary = summaryText(stamp, origin, reports)
writeFileSync(join(outputDirectory, 'summary.md'), summary)
console.log(summary)
console.log(`Samenvatting: ${join(outputDirectory, 'summary.md')}`)
process.exit(run.status ?? 1)

function readReports(directory: string): VisitReport[] {
  if (!existsSync(directory)) return []
  return readdirSync(directory).filter((file) => file.endsWith('.json')).sort().map((file) => JSON.parse(readFileSync(join(directory, file), 'utf8')) as VisitReport)
}

function summaryText(stamp: string, origin: string, reports: VisitReport[]): string {
  const loads = reports.map((report) => report.loadAverage)
  const header = `# perf:modes ${stamp}\n\norigin ${origin}, ${reports.length} bezoeken, loadavg bij de start van een bezoek ${Math.min(...loads)}–${Math.max(...loads)} (mediaan ${median(loads)})\n\n`
  return header + renderSummary(reports)
}

async function waitForOrigin(url: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(url)).ok) return
    } catch { /* preview start nog */ }
    await new Promise((done) => setTimeout(done, 500))
  }
  throw new Error(`Preview op ${url} kwam niet op`)
}
