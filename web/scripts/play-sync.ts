import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { chromium, devices } from '@playwright/test'
import { applyEmulation, performanceProfile } from '../e2e/profiles'
import { hostLoadAverage, runLoadLimit } from './rig-host'

const [origin, output, ...flags] = process.argv.slice(2)
if (!origin || !output) throw new Error('Gebruik: play-sync.ts ORIGIN UITVOER [--warm] [--filmstrip] [--cpu-profile] [--profile=desktop|po-android] [--fixture] [--now=ISO] [--manifest=PAD] [--proxy=URL]')
const warm = flags.includes('--warm')
const filmstrip = flags.includes('--filmstrip')
const playWindow = flags.includes('--play-window')
const cpuProfile = flags.includes('--cpu-profile')
const profile = performanceProfile(flags.find((flag) => flag.startsWith('--profile='))?.slice(10) ?? 'desktop')
const proxy = flags.find((flag) => flag.startsWith('--proxy='))?.slice(8)
const manifestPath = flags.find((flag) => flag.startsWith('--manifest='))?.slice(11)
const fixedClock = flags.includes('--fixture') ? '2026-08-28T15:00:00Z' : flags.find((flag) => flag.startsWith('--now='))?.slice(6)
const fixedEpoch = fixedClock ? Date.parse(fixedClock) : undefined
if (fixedClock && !Number.isFinite(fixedEpoch)) throw new Error('Ongeldig tijdstip voor --now')
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
  args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader', ...proxy ? ['--ignore-certificate-errors'] : [], ...quota ? [`--renderer-cmd-prefix=systemd-run --user --scope --quiet -p CPUQuota=${quota}% -p CPUQuotaPeriodSec=5ms --`] : []],
}
let context = await chromium.launchPersistentContext(directory, options)
const prepareContext = async () => {
  await context.addInitScript({ content: 'globalThis.__name = (value) => value;' })
  if (manifestPath) await context.route('**/data/manifest.json*', (route) => route.fulfill({ contentType: 'application/json', body: readFileSync(manifestPath, 'utf8') }))
  await context.addInitScript(({ fixedEpoch, desktop }) => {
    if (fixedEpoch !== undefined) {
      const NativeDate = Date
      globalThis.Date = new Proxy(NativeDate, {
        construct: (target, args) => Reflect.construct(target, args.length ? args : [fixedEpoch]),
        apply: () => new NativeDate(fixedEpoch).toString(),
        get: (target, property, receiver) => property === 'now' ? () => fixedEpoch : Reflect.get(target, property, receiver),
      })
    }
    Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => desktop ? 8 : 4 })
    Object.defineProperty(navigator, 'deviceMemory', { get: () => desktop ? 8 : 4 })
    performance.setResourceTimingBufferSize(10_000)
  }, { fixedEpoch, desktop: profile.id === 'desktop' })
}
try {
  await prepareContext()
  if (warm) {
    const seed = await context.newPage()
    await seed.goto(`${origin}/weer/utrecht?perf=1`, { waitUntil: 'commit' })
    await seed.waitForFunction(() => window.__motregenPerf?.snapshot().ttfpMs != null, undefined, { timeout: 60_000 })
    await seed.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active != null, undefined, { timeout: 60_000 })
    await seed.reload()
    await seed.waitForFunction(() => navigator.serviceWorker.controller !== null)
    await seed.waitForFunction(() => window.__motregenPerf?.snapshot().basemapReadyMs != null, undefined, { timeout: 60_000 })
    await seed.waitForTimeout(3_000)
    await context.close()
    context = await chromium.launchPersistentContext(directory, options)
    await prepareContext()
  }
  const load = hostLoadAverage()
  if (load > runLoadLimit()) {
    console.error(`Startload ${load} > ${runLoadLimit()}; opnieuw buiten de lock wachten`)
    await context.close()
    rmSync(directory, { recursive: true, force: true })
    process.exit(76)
  }
  const page = await context.newPage()
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await applyEmulation(cdp, profile)
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: !warm })
  if (cpuProfile) {
    await cdp.send('Profiler.enable')
    await cdp.send('Profiler.start')
  }
  const requests: Array<Record<string, unknown>> = []
  cdp.on('Network.responseReceived', ({ response, timestamp }) => requests.push({ url: response.url, protocol: response.protocol, timestamp, status: response.status, fromDiskCache: response.fromDiskCache, fromServiceWorker: response.fromServiceWorker }))
  const frames: Array<{ timestamp: number; data: string }> = []
  if (filmstrip) {
    const initialFrame = await page.screenshot({ type: 'jpeg', quality: 60, scale: 'css' })
    frames.push({ timestamp: Date.now(), data: initialFrame.toString('base64') })
    cdp.on('Page.screencastFrame', ({ data, metadata, sessionId }) => {
      void cdp.send('Page.screencastFrameAck', { sessionId })
      if (metadata.timestamp !== undefined) frames.push({ timestamp: metadata.timestamp * 1_000, data })
    })
    await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 60, maxWidth: Math.min(960, options.viewport.width), maxHeight: options.viewport.height, everyNthFrame: 4 })
  }
  await page.addInitScript(() => {
    const samples: object[] = []
    const rawLongFrames: object[] = []
    ;(window as unknown as { playSyncLongFrames: object[] }).playSyncLongFrames = rawLongFrames
    new PerformanceObserver(list => rawLongFrames.push(...list.getEntries().map(entry => entry.toJSON()))).observe({ type: 'long-animation-frame', buffered: true })
    ;(window as unknown as { playSyncSamples: object[] }).playSyncSamples = samples
    const sample = () => {
      const slider = document.querySelector('[role=slider][aria-label=Tijd]')
      const cursor = document.querySelector('.cursor-marker')
      const track = document.querySelector('.chart-track')
      const splash = document.querySelector('.map-splash')
      const veil = document.querySelector('.map-splash-veil')
      const map = document.querySelector<HTMLElement>('.map')
      samples.push({ ms: performance.now(), cursorIndex: slider?.getAttribute('aria-valuenow'), cursorLeft: cursor?.getBoundingClientRect().left, playing: slider?.hasAttribute('data-playing'), cursorMinute: document.querySelector<HTMLElement>('.app-shell')?.dataset.epoch, rainEpoch: map?.dataset.rainEpoch, rainCursor: map?.dataset.rainCursor, tilesLoaded: map?.dataset.tilesLoaded, mapStart: map?.dataset.mapStart ?? 'z4', trackTransform: track && getComputedStyle(track).transform, mapReady: splash?.classList.contains('ready'), splashVisibility: splash && getComputedStyle(splash).visibility, veilOpacity: veil && getComputedStyle(veil).opacity })
    }
    const timer = setInterval(sample, 250)
    setTimeout(() => clearInterval(timer), 30_000)
  })
  const loads = [{ ms: 0, load }]
  const loadTimer = setInterval(() => loads.push({ ms: loads.length * 1_000, load: hostLoadAverage() }), 1_000)
  try {
    await page.goto(`${origin}/weer/utrecht?perf=1`, { waitUntil: 'commit' })
    if (filmstrip) {
      await page.waitForLoadState('domcontentloaded')
      await page.addStyleTag({ content: '.perf-hud { display: none !important; }' })
    }
    await page.waitForFunction(() => {
      const started = window.__motregenPerf?.snapshot().firstCursorMs
      return started != null && performance.now() >= Math.max(12_000, started + 5_500)
    })
    if (cpuProfile) {
      const { profile: cpu } = await cdp.send('Profiler.stop')
      writeFileSync(`${output}.cpuprofile`, JSON.stringify(cpu))
    }
    if (filmstrip) await cdp.send('Page.stopScreencast')
    const captured = await page.evaluate(() => ({ timeOrigin: performance.timeOrigin, manifestGenerated: document.querySelector<HTMLElement>('.app-shell')?.dataset.generated, snapshot: window.__motregenPerf!.snapshot(), entries: window.__motregenPerf!.traceSlice(0, 12_000), loads: window.__motregenPerf!.loads.snapshot(), samples: (window as unknown as { playSyncSamples: object[] }).playSyncSamples, rawLongFrames: (window as unknown as { playSyncLongFrames: object[] }).playSyncLongFrames, resources: performance.getEntriesByType('resource').map((entry) => entry.toJSON()), serviceWorkerControlled: Boolean(navigator.serviceWorker.controller), graphics: Array.from(document.querySelectorAll<HTMLCanvasElement>('canvas.map-overlay, canvas.maplibregl-canvas')).map(canvas => ({ canvas: canvas.className, parallelShaderCompile: Boolean(canvas.getContext('webgl2')?.getExtension('KHR_parallel_shader_compile')) })) }))
    const shots = filmstrip ? Array.from({ length: 24 }, (_, index) => {
      const targetMs = index * 250 + (playWindow ? captured.snapshot.firstCursorMs! : 0)
      const frame = frames.filter((frame) => frame.timestamp - captured.timeOrigin <= targetMs).at(-1)
      if (frame) writeFileSync(`${output}/${String(index).padStart(2, '0')}.jpg`, Buffer.from(frame.data, 'base64'))
      const sample = (captured.samples as Array<{ ms: number }>).filter((sample) => sample.ms <= targetMs).at(-1)
      const rainDraw = captured.entries.measures.filter((measure) => measure.phase === 'rain-frame-committed' && measure.startTime <= targetMs).at(-1)
      return { targetMs, frameMs: frame ? frame.timestamp - captured.timeOrigin : null, sample, rainDraw }
    }) : []
    if (warm && !captured.serviceWorkerControlled) throw new Error('Warme browser mist SW-controller')
    if (errors.length) throw new Error(errors.join('\n'))
    writeFileSync(`${output}.json`, JSON.stringify({ origin, profile: profile.id, warm, fixture: flags.includes('--fixture'), fixedClock, manifestPath, warmMethod: warm ? 'nieuw browserproces met gevulde HTTP- en SW-diskcache' : null, filmstrip, cpuProfile, screenshotOverhead: filmstrip, shots, loadLimit: runLoadLimit(), loadSamples: loads, capturedAt: new Date().toISOString(), requests, ...captured }, null, 2))
    console.log(JSON.stringify({ output, load, ...captured.snapshot }))
  } finally {
    clearInterval(loadTimer)
  }
} finally {
  await context.close()
  rmSync(directory, { recursive: true, force: true })
}
