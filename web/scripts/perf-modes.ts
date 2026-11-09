import { spawn, spawnSync, type ChildProcess } from 'node:child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { MAP_MODES, renderSummary, type MapMode, type VisitReport } from './perf-modes-report'
import { rigPorts } from './rig-host'

// U102 meetsuite (C7): `pnpm perf:modes [--target prod|build] [--origin URL] [--modes weer,wind|all]
// [--profiles telefoon,desktop] [--repeat N] [--no-interactions]`. Op aanvraag en in de dagelijkse run, nooit per merge.
// build (standaard) = deze werkboom gebouwd en geserveerd met vite preview, data van https://motregen.nl/data;
//   de proxy haalt het sessiemerk weg, dus de bezoeken tellen niet in het dagrapport.
// prod = https://motregen.nl zoals hij live staat; sessies krijgen het meetlabel perf-u102 (MIP-35), geen baken.

const LIVE_ORIGIN = 'https://motregen.nl'
const args = process.argv.slice(2)
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

const reports = existsSync(outputDirectory)
  ? readdirSync(outputDirectory).filter((file) => file.endsWith('.json')).sort().map((file) => JSON.parse(readFileSync(join(outputDirectory, file), 'utf8')) as VisitReport)
  : []
const header = `# perf:modes ${stamp}\n\norigin ${origin}, ${reports.length} bezoeken, loadavg ${[...new Set(reports.map((report) => report.loadAverage))].join(' / ')}\n\n`
const summary = header + renderSummary(reports)
writeFileSync(join(outputDirectory, 'summary.md'), summary)
console.log(summary)
console.log(`Samenvatting: ${join(outputDirectory, 'summary.md')}`)
process.exit(run.status ?? 1)

async function waitForOrigin(url: string): Promise<void> {
  for (let attempt = 0; attempt < 60; attempt++) {
    try {
      if ((await fetch(url)).ok) return
    } catch { /* preview start nog */ }
    await new Promise((done) => setTimeout(done, 500))
  }
  throw new Error(`Preview op ${url} kwam niet op`)
}
