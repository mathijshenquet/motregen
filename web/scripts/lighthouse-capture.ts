import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { spawn } from 'node:child_process'
import { hostLoadAverage, runLoadLimit } from './rig-host'

const [url, output, ...flags] = process.argv.slice(2)
if (!url || !output) throw new Error('Gebruik: lighthouse-capture.ts URL OUTPUT_PREFIX [--paired --pair=naam --role=A|B]')
const pairedRun = flags.includes('--paired')
const pair = flags.find((flag) => flag.startsWith('--pair='))?.slice('--pair='.length) ?? null
const pairRole = flags.find((flag) => flag.startsWith('--role='))?.slice('--role='.length) ?? null
if (pairedRun !== (process.env.MOTREGEN_PERF_PAIRED_RUN === '1')) throw new Error('--paired en MOTREGEN_PERF_PAIRED_RUN moeten samen gebruikt worden')
if (pairedRun && (!pair || !/^[a-z0-9-]+$/.test(pair) || !['A', 'B'].includes(pairRole ?? ''))) throw new Error('Gepaarde Lighthouse vereist --pair=naam en --role=A|B')
if (process.env.MOTREGEN_PERF_LOCK_HELD !== '1') throw new Error('Gebruik desktop-lighthouse.sh: Lighthouse vereist de hostlock')
const loadAverage = hostLoadAverage()
if (loadAverage > runLoadLimit()) {
  console.error(`loadavg ${loadAverage} > ${runLoadLimit()}: Lighthouse afbreken en lock vrijgeven`)
  process.exit(76)
}
const startedAt = Date.now()
const loadSamples = [{ timestamp: startedAt, load: loadAverage }]
const loadTimer = setInterval(() => loadSamples.push({ timestamp: Date.now(), load: hostLoadAverage() }), 1_000)
let exitCode: number
try {
  const child = spawn('pnpm', ['dlx', 'lighthouse@13.0.1', url,
    '--preset=desktop', '--throttling-method=provided', '--only-categories=performance',
    '--screenEmulation.width=1280', '--screenEmulation.height=800',
    '--chrome-flags=--headless --no-sandbox --enable-webgl --ignore-gpu-blocklist --use-angle=swiftshader',
    '--output=json', '--output=html', `--output-path=${output}`, '--save-assets', '--quiet'], { stdio: 'inherit' })
  exitCode = await new Promise<number>((resolve, reject) => {
    child.once('error', reject)
    child.once('exit', (code) => resolve(code ?? 1))
  })
} finally {
  clearInterval(loadTimer)
}
if (exitCode !== 0) process.exit(exitCode)
const report = JSON.parse(readFileSync(`${output}.report.json`, 'utf8')) as { finalDisplayedUrl: string; lighthouseVersion: string }
const dist = process.env.MOTREGEN_RIG_DIST
const htmlHash = dist ? createHash('sha256').update(readFileSync(`${dist}/index.html`)).digest('hex') : null
writeFileSync(`${output}.meta.json`, JSON.stringify({ url, finalUrl: report.finalDisplayedUrl,
  lighthouseVersion: report.lighthouseVersion, pairedRun, pair, pairRole, absoluteBaselineEligible: !pairedRun,
  startedAt, completedAt: Date.now(), loadLimit: runLoadLimit(), loadAverage, loadSamples, htmlHash }, null, 2))
