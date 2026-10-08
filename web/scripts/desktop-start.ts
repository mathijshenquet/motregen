import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { chromium, devices, type Request } from '@playwright/test'
import type { PerfMonitor } from '../src/core/perf'
import { placesUrl } from '../src/core/places-asset'
import { hostLoadAverage, runLoadLimit } from './rig-host'

const [origin, output, ...flags] = process.argv.slice(2)
if (!origin || !output) throw new Error('Gebruik: desktop-start.ts ORIGIN UITVOERPREFIX [--warm] [--run=1] [--query=...]; herhalingen via desktop-rig.sh')
const repeat = Number(flags.find((flag) => flag.startsWith('--repeat='))?.split('=')[1] ?? 1)
const runNumber = Number(flags.find((flag) => flag.startsWith('--run='))?.split('=')[1] ?? 1)
const query = flags.find((flag) => flag.startsWith('--query='))?.slice('--query='.length) ?? 'perf=1'
const pathname = flags.find((flag) => flag.startsWith('--path='))?.slice('--path='.length) ?? '/weer'
const warm = flags.includes('--warm')
const cpuProfile = flags.includes('--cpu-profile')
const expectWebglPrewarm = flags.includes('--expect-webgl-prewarm')
const pairedRun = flags.includes('--paired')
const pair = flags.find((flag) => flag.startsWith('--pair='))?.slice('--pair='.length) ?? null
const pairRole = flags.find((flag) => flag.startsWith('--role='))?.slice('--role='.length) ?? null
if (pairedRun !== (process.env.MOTREGEN_PERF_PAIRED_RUN === '1')) throw new Error('--paired en MOTREGEN_PERF_PAIRED_RUN moeten samen gebruikt worden')
if (pairedRun && (!pair || !/^[a-z0-9-]+$/.test(pair) || (pairRole !== 'A' && pairRole !== 'B'))) throw new Error('Gepaarde capture vereist --pair=naam en --role=A|B')
if (repeat !== 1) throw new Error('Eén capture per lock; gebruik desktop-rig.sh voor --repeat')
if (!Number.isInteger(runNumber) || runNumber < 1 || runNumber > 10) throw new Error('--run moet 1…10 zijn')
mkdirSync(dirname(output), { recursive: true })
const htmlHash = process.env.MOTREGEN_RIG_DIST ? createHash('sha256').update(readFileSync(`${process.env.MOTREGEN_RIG_DIST}/index.html`)).digest('hex') : null
const serviceWorkerHash = process.env.MOTREGEN_RIG_DIST ? createHash('sha256').update(readFileSync(`${process.env.MOTREGEN_RIG_DIST}/sw.js`)).digest('hex') : null
const launchOptions = { args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] }
const contextOptions = { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, serviceWorkers: warm ? 'allow' as const : 'block' as const }
const warmProfile = warm ? process.env.MOTREGEN_DESKTOP_WARM_PROFILE ?? mkdtempSync(join(tmpdir(), 'motregen-desktop-warm-')) : null
const warmSeedPath = warmProfile ? join(warmProfile, 'motregen-warm-seed.json') : null
const browser = warm ? null : await chromium.launch(launchOptions)
try {
  for (let run = 1; run <= repeat; run++) {
    let context = warmProfile
      ? await chromium.launchPersistentContext(warmProfile, { ...launchOptions, ...contextOptions })
      : await browser!.newContext(contextOptions)
    let loadTimer: ReturnType<typeof setInterval> | undefined
    try {
      let page = await context.newPage()
      const errors: string[] = []
      page.on('pageerror', (error) => errors.push(error.message))
      const initialize = () => {
        const NativeDate = Date
        const fixedEpoch = NativeDate.parse('2026-08-28T15:00:00Z')
        globalThis.Date = new Proxy(NativeDate, {
          construct: (target, args) => Reflect.construct(target, args.length ? args : [fixedEpoch]),
          apply: () => new NativeDate(fixedEpoch).toString(),
          get: (target, property, receiver) => property === 'now' ? () => fixedEpoch : Reflect.get(target, property, receiver),
        })
        Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 8 })
        Object.defineProperty(navigator, 'deviceMemory', { get: () => 8 })
        performance.setResourceTimingBufferSize(10_000)
      }
      // tsx bewaart functienamen met __name, ook binnen de naar Chromium geserialiseerde callback.
      const initScript = { content: `globalThis.__name = (value) => value; (${initialize.toString()})();` }
      await context.addInitScript(initScript)
      let warmCaches: Array<{ name: string; entries: number }> = []
      let warmSeededAt: string | null = null
      if (warmSeedPath && existsSync(warmSeedPath)) {
        const seed = JSON.parse(readFileSync(warmSeedPath, 'utf8')) as { caches: typeof warmCaches; seededAt: string }
        warmCaches = seed.caches
        warmSeededAt = seed.seededAt
      } else if (warm) {
        await page.goto(`${origin}${pathname}?${query}`)
        await page.waitForFunction(() => window.__motregenPerf?.snapshot().ttfpMs != null)
        await page.evaluate(async () => { await navigator.serviceWorker.ready })
        await page.reload()
        await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
        await page.waitForFunction(() => window.__motregenPerf?.snapshot().basemapReadyMs != null)
        await page.waitForFunction(async () => (await (await caches.open('motregen-basemap-ranges-v1')).keys()).length > 1)
        await page.waitForTimeout(2_000)
        warmCaches = await page.evaluate(async () => Promise.all((await caches.keys()).map(async (name) => ({ name, entries: (await (await caches.open(name)).keys()).length }))))
        await context.close()
        warmSeededAt = new Date().toISOString()
        writeFileSync(warmSeedPath!, JSON.stringify({ caches: warmCaches, seededAt: warmSeededAt }))
        context = await chromium.launchPersistentContext(warmProfile!, { ...launchOptions, ...contextOptions })
        await context.addInitScript(initScript)
        page = await context.newPage()
        page.on('pageerror', (error) => errors.push(error.message))
      }
      const loadAverage = hostLoadAverage()
      if (loadAverage > runLoadLimit()) {
        console.error(`loadavg ${loadAverage} > ${runLoadLimit()}: capture afbreken en lock vrijgeven`)
        process.exitCode = 76
        break
      }
      const requests: Array<Record<string, unknown>> = []
      const pending: Promise<void>[] = []
      const record = async (request: Request) => {
        const response = await request.response()
        const timing = request.timing()
        const sizes = await request.sizes()
        requests.push({ url: request.url(), range: request.headers().range ?? null, ...timing, ...sizes, status: response?.status(), fromServiceWorker: response?.fromServiceWorker() ?? false, serviceWorkerRequest: request.serviceWorker() !== null })
      }
      context.on('requestfinished', (request) => { pending.push(record(request)) })
      const cdp = await context.newCDPSession(page)
      await cdp.send('Network.enable')
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: !warm })
      const networkResponses: Array<Record<string, unknown>> = []
      cdp.on('Network.responseReceived', ({ response }) => networkResponses.push({ url: response.url, fromDiskCache: response.fromDiskCache ?? false, fromServiceWorker: response.fromServiceWorker ?? false, cachedManifestAt: response.headers['X-Motregen-Cached-At'] ?? response.headers['x-motregen-cached-at'] ?? null, protocol: response.protocol, status: response.status }))
      if (cpuProfile) {
        await cdp.send('Profiler.enable')
        await cdp.send('Profiler.setSamplingInterval', { interval: 1000 })
        await cdp.send('Profiler.start')
      }
      const events: unknown[] = []
      cdp.on('Tracing.dataCollected', (chunk) => events.push(...chunk.value))
      await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-v8.compile,v8,blink.user_timing,loading', transferMode: 'ReportEvents' })
      const loadSamples = [{ timestamp: Date.now(), load: loadAverage }]
      loadTimer = setInterval(() => loadSamples.push({ timestamp: Date.now(), load: hostLoadAverage() }), 1_000)
      await page.goto(`${origin}${pathname}?${query}`, { waitUntil: 'commit' })
      await page.waitForFunction(() => window.__motregenPerf?.snapshot().ttfpMs != null, undefined, { timeout: 30_000 })
      await page.waitForFunction(() => performance.now() >= 12_000)
      const captured = await page.evaluate(() => {
        const monitor = window.__motregenPerf as PerfMonitor
        return { timeOrigin: performance.timeOrigin, snapshot: monitor.snapshot(), loads: monitor.loads.snapshot(), entries: monitor.traceSlice(0, 12_000), serviceWorkerControlled: Boolean(navigator.serviceWorker?.controller), webglPrewarm: performance.getEntriesByName('webgl-prewarm').map((entry) => entry.toJSON()), resources: [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')].map((entry) => entry.toJSON()) }
      })
      const complete = new Promise<void>((resolve) => cdp.once('Tracing.tracingComplete', () => resolve()))
      await cdp.send('Tracing.end')
      await complete
      for (const worker of page.workers()) {
        const capturedWorker = await worker.evaluate(() => ({ timeOrigin: performance.timeOrigin, resources: performance.getEntriesByType('resource').map((entry) => entry.toJSON()) }))
        const offset = capturedWorker.timeOrigin - captured.timeOrigin
        captured.resources.push(...capturedWorker.resources.map((entry) => ({ ...entry, startTime: entry.startTime + offset, responseEnd: entry.responseEnd + offset })))
      }
      await Promise.all(pending)
      clearInterval(loadTimer)
      if (errors.length) throw new Error(errors.join('\n'))
      if (warm && !captured.serviceWorkerControlled) throw new Error('Warme nieuwe context mist SW-controller')
      if (expectWebglPrewarm && captured.webglPrewarm.length !== 1) throw new Error('WebGL-workerproef heeft geen geslaagde prewarm gemeten')
      const catalogue = captured.resources.find((entry) => new URL(entry.name).pathname === placesUrl)
      if (!catalogue || catalogue.startTime <= (captured.snapshot.ttfpMs ?? Infinity)) throw new Error('Plaatsenlijst ontbreekt of begint vóór ttfp')
      const prefix = `${output}-${warm ? 'warm' : 'cold'}-run${runNumber}`
      if (cpuProfile) {
        const { profile } = await cdp.send('Profiler.stop')
        writeFileSync(`${prefix}.cpuprofile`, JSON.stringify(profile))
      }
      writeFileSync(`${prefix}.json`, JSON.stringify({ capturedAt: new Date().toISOString(), origin, pathname, finalUrl: page.url(), query, warm, warmMethod: warm ? 'persistent-profile-browser-restart' : null, warmSeededAt, warmCaches, httpCacheEnabled: warm, pairedRun, pair, pairRole, loadLimit: runLoadLimit(), absoluteBaselineEligible: !pairedRun, cpuProfile, browserPerRun: true, htmlHash, serviceWorkerHash, accessLog: process.env.MOTREGEN_DESKTOP_ACCESS_LOG ?? null, loadAverage, loadSamples, ...captured, requests, networkResponses }, null, 2))
      writeFileSync(`${prefix}.trace.json`, JSON.stringify({ traceEvents: events }))
      console.log(`${prefix}: ${JSON.stringify(captured.snapshot)}`)
    } finally {
      clearInterval(loadTimer)
      await context.close()
    }
  }
} finally {
  await browser?.close()
  if (warmProfile && !process.env.MOTREGEN_DESKTOP_WARM_PROFILE) rmSync(warmProfile, { recursive: true, force: true })
}
