import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { chromium, devices } from '@playwright/test'
import { applyEmulation, performanceProfile } from '../e2e/profiles'
import { hostLoadAverage, runLoadLimit } from './rig-host'

const [origin, output, ...flags] = process.argv.slice(2)
if (!origin || !output) throw new Error('Gebruik: play-sync.ts ORIGIN UITVOER [--warm] [--filmstrip] [--profile=desktop|po-android] [--fixture] [--proxy=URL]')
const warm = flags.includes('--warm')
const filmstrip = flags.includes('--filmstrip')
const profile = performanceProfile(flags.find((flag) => flag.startsWith('--profile='))?.slice(10) ?? 'desktop')
const proxy = flags.find((flag) => flag.startsWith('--proxy='))?.slice(8)
const directory = mkdtempSync(join(tmpdir(), 'motregen-play-sync-'))
mkdirSync(dirname(output), { recursive: true })
if (filmstrip) mkdirSync(output, { recursive: true })
const quota = profile.rendererCpuQuotaPercent
const options = {
  ...profile.id === 'desktop' ? devices['Desktop Chrome'] : devices['Pixel 5'],
  viewport: profile.device?.viewport ?? (profile.id === 'desktop' ? { width: 1280, height: 800 } : { width: 390, height: 844 }),
  userAgent: profile.device?.userAgent,
  serviceWorkers: warm ? 'allow' as const : 'block' as const,
  ignoreHTTPSErrors: true,
  ...proxy ? { proxy: { server: proxy } } : {},
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader', ...quota ? [`--renderer-cmd-prefix=systemd-run --user --scope --quiet -p CPUQuota=${quota}% -p CPUQuotaPeriodSec=5ms --`] : []],
}
let context = await chromium.launchPersistentContext(directory, options)
try {
  if (warm) {
    const seed = await context.newPage()
    await seed.goto(`${origin}/weer/utrecht?perf=1`, { waitUntil: 'commit' })
    await seed.waitForFunction(() => window.__motregenPerf?.snapshot().ttfpMs != null, undefined, { timeout: 60_000 })
    await seed.evaluate(async () => { await navigator.serviceWorker.ready })
    await seed.reload()
    await seed.waitForFunction(() => navigator.serviceWorker.controller !== null)
    await seed.waitForFunction(() => window.__motregenPerf?.snapshot().basemapReadyMs != null, undefined, { timeout: 60_000 })
    await seed.waitForTimeout(3_000)
    await context.close()
    context = await chromium.launchPersistentContext(directory, options)
  }
  const load = hostLoadAverage()
  if (load > runLoadLimit()) throw new Error(`Startload ${load} > ${runLoadLimit()}`)
  const page = await context.newPage()
  await page.addInitScript({ content: 'globalThis.__name = (value) => value;' })
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await applyEmulation(cdp, profile)
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: !warm })
  const requests: Array<Record<string, unknown>> = []
  cdp.on('Network.responseReceived', ({ response, timestamp }) => requests.push({ url: response.url, protocol: response.protocol, timestamp, status: response.status, fromDiskCache: response.fromDiskCache, fromServiceWorker: response.fromServiceWorker }))
  const frames: Array<{ timestamp: number; data: string }> = []
  if (filmstrip) {
    cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
      void cdp.send('Page.screencastFrameAck', { sessionId })
      if (metadata.timestamp !== undefined) frames.push({ timestamp: metadata.timestamp * 1_000, data })
    })
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 70, maxWidth: options.viewport.width, maxHeight: options.viewport.height })
  }
  await page.addInitScript(({ fixture, desktop }) => {
    if (fixture) {
      const NativeDate = Date
      const fixedEpoch = NativeDate.parse('2026-08-28T15:00:00Z')
      globalThis.Date = new Proxy(NativeDate, {
        construct: (target, args) => Reflect.construct(target, args.length ? args : [fixedEpoch]),
        apply: () => new NativeDate(fixedEpoch).toString(),
        get: (target, property, receiver) => property === 'now' ? () => fixedEpoch : Reflect.get(target, property, receiver),
      })
    }
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => desktop ? 8 : 4 })
    Object.defineProperty(navigator, 'deviceMemory', { get: () => desktop ? 8 : 4 })
    performance.setResourceTimingBufferSize(10_000)
    const samples: object[] = []
    ;(window as unknown as { playSyncSamples: object[] }).playSyncSamples = samples
    const sample = () => {
      const slider = document.querySelector('[role=slider][aria-label=Tijd]')
      const cursor = document.querySelector('.cursor-marker')
      const track = document.querySelector('.chart-track')
      const splash = document.querySelector('.map-splash')
      const veil = document.querySelector('.map-splash-veil')
      samples.push({ ms: performance.now(), cursorIndex: slider?.getAttribute('aria-valuenow'), cursorLeft: cursor?.getBoundingClientRect().left, playing: slider?.hasAttribute('data-playing'), cursorMinute: document.querySelector<HTMLElement>('.app-shell')?.dataset.epoch, rainEpoch: document.querySelector<HTMLElement>('.map')?.dataset.rainEpoch, trackTransform: track && getComputedStyle(track).transform, mapReady: splash?.classList.contains('ready'), splashVisibility: splash && getComputedStyle(splash).visibility, veilOpacity: veil && getComputedStyle(veil).opacity, perf: window.__motregenPerf?.snapshot() })
    }
    const timer = setInterval(sample, 250)
    setTimeout(() => clearInterval(timer), 12_000)
  }, { fixture: flags.includes('--fixture'), desktop: profile.id === 'desktop' })
  const loads = [{ ms: 0, load }]
  const loadTimer = setInterval(() => loads.push({ ms: loads.length * 1_000, load: hostLoadAverage() }), 1_000)
  try {
    await page.goto(`${origin}/weer/utrecht?perf=1`, { waitUntil: 'commit' })
    await page.waitForFunction(() => performance.now() >= 12_000)
    if (filmstrip) await cdp.send('Page.stopScreencast')
    const captured = await page.evaluate(() => ({ timeOrigin: performance.timeOrigin, snapshot: window.__motregenPerf!.snapshot(), entries: window.__motregenPerf!.traceSlice(0, 12_000), loads: window.__motregenPerf!.loads.snapshot(), samples: (window as unknown as { playSyncSamples: object[] }).playSyncSamples, resources: performance.getEntriesByType('resource').map((entry) => entry.toJSON()), serviceWorkerControlled: Boolean(navigator.serviceWorker.controller) }))
    const shots = filmstrip ? Array.from({ length: 24 }, (_, index) => {
      const targetMs = index * 250
      const frame = frames.filter((frame) => frame.timestamp - captured.timeOrigin <= targetMs).at(-1) ?? frames[0]
      if (frame) writeFileSync(`${output}/${String(index).padStart(2, '0')}.jpg`, Buffer.from(frame.data, 'base64'))
      return { targetMs, frameMs: frame ? frame.timestamp - captured.timeOrigin : null }
    }) : []
    if (warm && !captured.serviceWorkerControlled) throw new Error('Warme browser mist SW-controller')
    if (errors.length) throw new Error(errors.join('\n'))
    writeFileSync(`${output}.json`, JSON.stringify({ origin, profile: profile.id, warm, warmMethod: warm ? 'nieuw browserproces met gevulde HTTP- en SW-diskcache' : null, filmstrip, screenshotOverhead: filmstrip, shots, loadLimit: runLoadLimit(), loadSamples: loads, capturedAt: new Date().toISOString(), requests, ...captured }, null, 2))
    console.log(JSON.stringify({ output, load, ...captured.snapshot }))
  } finally {
    clearInterval(loadTimer)
  }
} finally {
  await context.close()
  rmSync(directory, { recursive: true, force: true })
}
