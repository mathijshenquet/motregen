import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { chromium, devices, type Request } from '@playwright/test'
import type { PerfMonitor } from '../src/core/perf'
import { MAX_LOAD_AVERAGE, hostLoadAverage } from './rig-host'

const [origin, output, ...flags] = process.argv.slice(2)
if (!origin || !output) throw new Error('Gebruik: scripts/e2e-slot.sh pnpm exec tsx scripts/desktop-start.ts ORIGIN UITVOERPREFIX [--warm] [--repeat=3] [--query=...]')
const repeat = Number(flags.find((flag) => flag.startsWith('--repeat='))?.split('=')[1] ?? 1)
const runNumber = Number(flags.find((flag) => flag.startsWith('--run='))?.split('=')[1] ?? 1)
const query = flags.find((flag) => flag.startsWith('--query='))?.slice('--query='.length) ?? 'perf=1'
const pathname = flags.find((flag) => flag.startsWith('--path='))?.slice('--path='.length) ?? '/weer'
const warm = flags.includes('--warm')
const cpuProfile = flags.includes('--cpu-profile')
if (repeat !== 1) throw new Error('Eén capture per lock; gebruik desktop-rig.sh voor --repeat')
if (!Number.isInteger(runNumber) || runNumber < 1 || runNumber > 10) throw new Error('--run moet 1…10 zijn')
mkdirSync(dirname(output), { recursive: true })
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
try {
  for (let run = 1; run <= repeat; run++) {
    const context = await browser.newContext({ ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 }, serviceWorkers: warm ? 'allow' : 'block' })
    try {
      const page = await context.newPage()
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
      await page.addInitScript({ content: `globalThis.__name = (value) => value; (${initialize.toString()})();` })
      if (warm) {
        await page.goto(`${origin}${pathname}?${query}`)
        await page.waitForFunction(() => window.__motregenPerf?.snapshot().ttfpMs != null)
        await page.evaluate(async () => { await navigator.serviceWorker.ready })
        await page.reload()
        await page.waitForFunction(() => navigator.serviceWorker.controller !== null)
        await page.waitForFunction(() => window.__motregenPerf?.snapshot().basemapReadyMs != null)
        await page.waitForFunction(async () => (await (await caches.open('motregen-basemap-ranges-v1')).keys()).length > 1)
        await page.waitForTimeout(2_000)
        await page.goto('about:blank')
      }
      const loadAverage = hostLoadAverage()
      if (loadAverage > MAX_LOAD_AVERAGE) {
        console.error(`loadavg ${loadAverage} > ${MAX_LOAD_AVERAGE}: capture afbreken en lock vrijgeven`)
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
      await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
      if (cpuProfile) {
        await cdp.send('Profiler.enable')
        await cdp.send('Profiler.setSamplingInterval', { interval: 1000 })
        await cdp.send('Profiler.start')
      }
      const events: unknown[] = []
      cdp.on('Tracing.dataCollected', (chunk) => events.push(...chunk.value))
      await cdp.send('Tracing.start', { categories: 'devtools.timeline,disabled-by-default-devtools.timeline,disabled-by-default-v8.compile,v8,blink.user_timing,loading', transferMode: 'ReportEvents' })
      await page.goto(`${origin}${pathname}?${query}`, { waitUntil: 'commit' })
      await page.waitForFunction(() => window.__motregenPerf?.snapshot().ttfpMs != null, undefined, { timeout: 30_000 })
      await page.waitForFunction(() => performance.now() >= 12_000)
      const captured = await page.evaluate(() => {
        const monitor = window.__motregenPerf as PerfMonitor
        return { timeOrigin: performance.timeOrigin, snapshot: monitor.snapshot(), loads: monitor.loads.snapshot(), entries: monitor.traceSlice(0, 12_000), resources: [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')].map((entry) => entry.toJSON()) }
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
      if (errors.length) throw new Error(errors.join('\n'))
      const prefix = `${output}-${warm ? 'warm' : 'cold'}-run${runNumber}`
      if (cpuProfile) {
        const { profile } = await cdp.send('Profiler.stop')
        writeFileSync(`${prefix}.cpuprofile`, JSON.stringify(profile))
      }
      writeFileSync(`${prefix}.json`, JSON.stringify({ capturedAt: new Date().toISOString(), origin, pathname, query, warm, cpuProfile, loadAverage, ...captured, requests }, null, 2))
      writeFileSync(`${prefix}.trace.json`, JSON.stringify({ traceEvents: events }))
      console.log(`${prefix}: ${JSON.stringify(captured.snapshot)}`)
    } finally {
      await context.close()
    }
  }
} finally {
  await browser.close()
}
