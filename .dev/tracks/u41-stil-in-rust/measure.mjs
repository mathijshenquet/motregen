// U41-meting: 30 s afspelen op een prod-preview; CDP-taaktijd hoofddraad + proces-CPU uit /proc.
// Gebruik (cwd = web/): node ../.dev/tracks/u41-stil-in-rust/measure.mjs <url> [label]
import { createRequire } from 'node:module'
import { readFileSync, readdirSync } from 'node:fs'
const require = createRequire(`${process.cwd()}/`)
const { chromium } = require('@playwright/test')

const url = process.argv[2] ?? 'http://127.0.0.1:4341/'
const label = process.argv[3] ?? ''
const seconds = Number(process.env.SECONDS ?? 30)
const HZ = 100

function procCpu(rootPid) {
  const stats = new Map()
  for (const entry of readdirSync('/proc')) {
    if (!/^\d+$/.test(entry)) continue
    try {
      const stat = readFileSync(`/proc/${entry}/stat`, 'utf8')
      const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
      stats.set(Number(entry), { ppid: Number(fields[1]), cpu: (Number(fields[11]) + Number(fields[12])) / HZ, cmd: readFileSync(`/proc/${entry}/cmdline`, 'utf8') })
    } catch {}
  }
  const out = { renderer: 0, gpu: 0, other: 0, threads: {} }
  const descendants = (pid) => [...stats].filter(([, s]) => s.ppid === pid).flatMap(([child]) => [child, ...descendants(child)])
  for (const pid of [rootPid, ...descendants(rootPid)]) {
    const s = stats.get(pid)
    if (!s) continue
    const kind = s.cmd.includes('--type=renderer') ? 'renderer' : s.cmd.includes('--type=gpu-process') ? 'gpu' : 'other'
    out[kind] += s.cpu
    if (kind !== 'renderer') continue
    for (const tid of readdirSync(`/proc/${pid}/task`)) {
      try {
        const stat = readFileSync(`/proc/${pid}/task/${tid}/stat`, 'utf8')
        const fields = stat.slice(stat.lastIndexOf(')') + 2).split(' ')
        const comm = readFileSync(`/proc/${pid}/task/${tid}/comm`, 'utf8').trim()
        if (process.env.DUMP_THREADS) console.error('thread', comm, fields[11], fields[12])
        const name = threadKind(comm)
        out.threads[name] = (out.threads[name] ?? 0) + (Number(fields[11]) + Number(fields[12])) / HZ
      } catch {}
    }
  }
  return out
}

function threadKind(comm) {
  if (comm === 'CrRendererMain' || comm.startsWith('chrome-headless')) return 'main'
  if (/Worker/i.test(comm)) return 'workers'
  if (/Compositor/.test(comm)) return 'compositor'
  return 'rest'
}
const delta = (a, b, key) => +((b.threads[key] ?? 0) - (a.threads[key] ?? 0)).toFixed(2)

const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const rootPid = process.pid
const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: 'light' })
await context.addInitScript(() => {
  const counts = window.__u41WorkerMessages = {}
  const NativeWorker = window.Worker
  window.Worker = class extends NativeWorker {
    constructor(url, options) {
      super(url, options)
      const name = String(url).split('/').pop().replace(/-[\w-]{8}\.js$/, '').replace(/\?.*$/, '')
      const post = this.postMessage.bind(this)
      this.postMessage = (...args) => { counts[name] = (counts[name] ?? 0) + 1; return post(...args) }
    }
  }
})
const page = await context.newPage()
const errors = []
page.on('pageerror', (error) => errors.push(error.message))
const cdp = await context.newCDPSession(page)
await cdp.send('Performance.enable', { timeDomain: 'timeTicks' })
await page.goto(url)
await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
await page.locator('.temperature-cell').first().waitFor({ timeout: 60_000 })

async function metrics() {
  const { metrics } = await cdp.send('Performance.getMetrics')
  return Object.fromEntries(metrics.map((m) => [m.name, m.value]))
}
const counters = () => page.evaluate(() => { const c = window.__motregenIsolines(); return { messages: { ...window.__u41WorkerMessages }, repaints: c.repaints, rainDraws: c.rainDraws, windDraws: c.windDraws, isolineDraws: c.isolineDraws, labelRounds: c.labelRounds, traces: c.traces ?? 0 } })

async function measure(name, prepare) {
  await prepare?.()
  await page.waitForTimeout(Number(process.env.WARMUP ?? 40_000))
  // Elke meting vanaf het begin van de afspeellus: 5-minuutradar en uurframes wisselen elkaar af.
  const slider = page.getByRole('slider', { name: 'Tijd' })
  if (name !== 'rust') await slider.press('Home')
  await page.waitForTimeout(1_000)
  const playing = await slider.getAttribute('data-playing')
  const [m0, c0, p0] = [await metrics(), await counters(), procCpu(rootPid)]
  const t0 = Date.now()
  await page.waitForTimeout(seconds * 1000)
  const [m1, c1, p1] = [await metrics(), await counters(), procCpu(rootPid)]
  const dt = (Date.now() - t0) / 1000
  const row = {
    scenario: name, playing: playing !== null, s: +dt.toFixed(1),
    taskS: +(m1.TaskDuration - m0.TaskDuration).toFixed(2),
    scriptS: +(m1.ScriptDuration - m0.ScriptDuration).toFixed(2),
    rendererCpuS: +(p1.renderer - p0.renderer).toFixed(2),
    mainCpuS: delta(p0, p1, 'main'), workerCpuS: delta(p0, p1, 'workers'), compositorCpuS: delta(p0, p1, 'compositor'), restCpuS: delta(p0, p1, 'rest'),
    gpuCpuS: +(p1.gpu - p0.gpu).toFixed(2),
    mapRendersPerS: +((c1.repaints - c0.repaints) / dt).toFixed(1),
    rainDrawsPerS: +((c1.rainDraws - c0.rainDraws) / dt).toFixed(1),
    windDrawsPerS: +((c1.windDraws - c0.windDraws) / dt).toFixed(1),
    isolineDrawsPerS: +((c1.isolineDraws - c0.isolineDraws) / dt).toFixed(1),
    traces: c1.traces - c0.traces,
    labelRounds: c1.labelRounds - c0.labelRounds,
    workerMessages: Object.fromEntries(Object.entries(c1.messages).map(([name, count]) => [name, count - (c0.messages[name] ?? 0)]).filter(([, count]) => count)),
  }
  console.log(JSON.stringify({ label, ...row }))
  return row
}

const only = (process.env.SCENARIOS ?? 'weer,temperatuur').split(',')
if (only.includes('weer')) await measure('weer')
const quick = () => { process.env.WARMUP = '4000' }
if (only.includes('temperatuur')) await measure('temperatuur', () => { quick(); return page.locator('.temperature-focus').first().click() })
if (only.includes('verborgen')) await measure('verborgen', async () => {
  await page.locator('.temperature-focus').first().click()
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' })
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
    document.dispatchEvent(new Event('visibilitychange'))
  })
})
if (only.includes('rust')) await measure('rust', async () => {
  // Geen invoer meer na de Home-toets van de vorige meting: na 60 s gaat de wind naar 30 fps.
  await page.waitForTimeout(61_000)
})
if (errors.length) console.log(JSON.stringify({ errors }))
await browser.close()
