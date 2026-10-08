import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, type Page, type Request, type BrowserContext } from '@playwright/test'
import { test, warmingCache, warmVisit, installSeedWorker, completeCacheSeed, seedEvidence, cacheInventory, workerNetwork } from './rig-cache'
import { applyEmulation, performanceProfile } from './profiles'
import { installMobileProbe } from './mobile-probe'
import { buildChromeTrace, type SelfProfilerTrace } from '../src/core/profile-recorder'
import { createSourceMapResolver } from '../scripts/prof-source-map'
import { profileTop } from '../scripts/prof-top'
import { hostLoadAverage, waitForQuietHost } from '../scripts/rig-host'
import { completedBytesBefore, reconcileWire, renderMobileReport, wireWindow, smoothness, summarizePhases, type MobileReport, type SmoothnessWindow, type WireRequest } from '../scripts/mobile-report'
import type { PerfMonitor } from '../src/core/perf'

interface ScenarioStep {
  atMs: number
  action: 'scrub' | 'play' | 'mode' | 'seek' | 'jump'
  /** jump: zo vaak PageUp op de tijdslider, zonder eis aan de precieze afstand. */
  presses?: number
  /** seek: zo lang elke 100 ms één stap vooruit op de tijdslider. */
  seekMs?: number
  minutes?: number
  playing?: boolean
  mode?: 'Weer' | 'Lucht' | 'Gevoel' | 'Wind'
}
interface Scenario { durationMs: number; description: string; steps: ScenarioStep[]; autoplay?: boolean; cache?: 'warm'; devStorage?: Record<string, string>; windows?: SmoothnessWindow[]; requireFilledTemperature?: boolean }
interface RigOptions { profiles: string[]; scenarios: string[]; repeat: number; cpuRate?: number; basemap?: string; loadWaitMinutes?: number; requestOrderOnly?: boolean }
const options = JSON.parse(process.env.MOTREGEN_MOBILE_OPTIONS ?? '{"profiles":["mobile-4g"],"scenarios":["koud"],"repeat":1,"cpuRate":4}') as RigOptions
const scenarios = JSON.parse(readFileSync('perf/scenarios.json', 'utf8')) as Record<string, Scenario>
const QUIET_HOST_WAIT_MS = (options.loadWaitMinutes ?? 20) * 60_000
const synthGridScale = Number(process.env.MOTREGEN_SYNTH_GRID_SCALE ?? 1)
const rendererCpuQuotaPercent = Number(process.env.MOTREGEN_RIG_RENDERER_QUOTA ?? 0) || null
const fixtureRoot = process.env.MOTREGEN_MOBILE_FIXTURE_DIR ?? 'public/perf-mobile'
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

for (const profileId of options.profiles) {
  for (const scenarioId of options.scenarios) {
    for (let repetition = 1; repetition <= options.repeat; repetition++) {
      test(`${profileId} / ${scenarioId} / run ${repetition}`, async ({ page, context, baseURL }) => {
        const scenario = scenarios[scenarioId]!
        // Ook tussen de herhalingen kan de host druk worden; een run die druk begint is weggegooid werk.
        test.setTimeout(120_000 + QUIET_HOST_WAIT_MS)
        if (!warmingCache && !options.requestOrderOnly && process.env.MOTREGEN_PERF_LOCK_HELD !== '1' && !await waitForQuietHost(QUIET_HOST_WAIT_MS, (message) => console.log(message))) {
          throw new Error(`Host blijft te druk (loadavg ${hostLoadAverage()}); geen meting`)
        }
        const loadAverage = hostLoadAverage()
        if (!warmingCache && !options.requestOrderOnly) expect(loadAverage, 'startloadavg <8; nooit wachten onder de perf-lock').toBeLessThan(8)
        if (scenario.cache === 'warm') expect(process.env.MOTREGEN_RIG_WARM_PROFILE, 'warm vereist een gevuld diskprofiel').toBeTruthy()
        if (profileId === 'desktop') await page.setViewportSize({ width: 1280, height: 800 })
        const calibrated = performanceProfile(profileId)
        const profile = { ...calibrated, cpuThrottleRate: profileId === 'desktop' ? 1 : options.cpuRate ?? calibrated.cpuThrottleRate }
        const actions: MobileReport['actions'] = []
        const errors: string[] = []
        const findings: string[] = []
        if (options.requestOrderOnly) findings.push('Alleen aanvraagvolgorde onder hostdrukte; tijden niet gebruiken als performancebaseline of snelheidsvergelijking')
        const externalRequests: string[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
        page.on('response', (response) => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`) })
        const cdp = await context.newCDPSession(page)
        await applyEmulation(cdp, profile)
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: !process.env.MOTREGEN_RIG_WARM_PROFILE })
        if (profile.device) {
          await page.setViewportSize(profile.device.viewport)
          await cdp.send('Emulation.setUserAgentOverride', { userAgent: profile.device.userAgent })
        }
        const allowedOrigins = new Set([baseURL!, `http://127.0.0.1:${process.env.MOTREGEN_E2E_DATA_PORT ?? 8392}`])
        if (!process.env.MOTREGEN_RIG_WARM_PROFILE) await context.route(/^https?:\/\//, async (route) => {
          if (allowedOrigins.has(new URL(route.request().url()).origin)) await route.continue()
          else {
            externalRequests.push(route.request().url())
            await route.abort('blockedbyclient')
          }
        })
        else context.on('request', request => {
          if (/^https?:/.test(request.url()) && !allowedOrigins.has(new URL(request.url()).origin)) externalRequests.push(request.url())
        })
        await page.addInitScript(() => {
          const NativeDate = Date
          const fixedEpoch = NativeDate.parse('2026-08-28T15:00:00Z')
          // Playwright Clock vervangt ook performance/Resource Timing; alleen Date vastzetten.
          globalThis.Date = new Proxy(NativeDate, {
            construct: (target, args) => Reflect.construct(target, args.length ? args : [fixedEpoch]),
            apply: () => new NativeDate(fixedEpoch).toString(),
            get: (target, property, receiver) => property === 'now' ? () => fixedEpoch : Reflect.get(target, property, receiver),
          })
          Object.defineProperty(navigator, 'hardwareConcurrency', { get: () => 4 })
          Object.defineProperty(navigator, 'deviceMemory', { get: () => 4 })
          performance.setResourceTimingBufferSize(10_000)
        })
        if (scenario.devStorage) await page.addInitScript((entries) => { for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value) }, scenario.devStorage)
        await page.addInitScript(installMobileProbe)
        const network = recordPlaywrightNetwork(warmVisit ? context : page, warmVisit, context)
        const capturedAt = new Date().toISOString()
        if (warmingCache) await installSeedWorker(page, baseURL!)
        // Een ?t-preset zet de tijdlijn stil; zonder preset speelt de app vanzelf, zoals bij een gewone bezoeker.
        await page.goto(`${scenario.autoplay ? '/?perf=1&modus=weer' : '/?perf=1&t=%2B0u&modus=weer'}${scenario.devStorage ? '&dev' : ''}`, { waitUntil: 'commit' })
        if (warmingCache) {
          await completeCacheSeed(page, scenario.durationMs)
          expect(externalRequests, 'geen live-netwerk bij cachevulling').toEqual([])
          console.log('Cache gevuld; browser wordt volledig gesloten, geen performancecijfers geschreven')
          return
        }
        if (warmVisit) expect(await page.evaluate(() => navigator.serviceWorker.controller !== null), 'tweede bezoek gebruikt de geïnstalleerde SW').toBe(true)
        await page.waitForFunction(() => window.__motregenPerf?.snapshot().firstRainMs !== null && window.__motregenPerf?.snapshot().firstRainMs !== undefined, undefined, { timeout: 30_000 }).catch((error) => { throw new Error(`${error}\n${errors.join('\n')}\n${externalRequests.join('\n')}`) })
        if (!scenario.autoplay) await expect(page.getByRole('slider', { name: 'Tijd' })).not.toHaveAttribute('data-playing', '')

        for (const step of scenario.steps) {
          await waitUntil(page, step.atMs)
          const actualMs = await page.evaluate(() => performance.now())
          const detail = await performStep(page, step)
          actions.push({ action: step.action, plannedMs: step.atMs, actualMs, detail })
          if (step.action !== 'seek' && actualMs - step.atMs > 250) findings.push(`Scenarioactie ${step.action} ${Math.round(actualMs - step.atMs)} ms later dan gepland`)
        }
        await waitUntil(page, scenario.durationMs)
        const captured = await page.evaluate(async (durationMs) => {
          const monitor = window.__motregenPerf as PerfMonitor
          const sample = monitor.snapshot() as ReturnType<PerfMonitor['snapshot']> & { windowReadyMs?: Record<string, number> }
          const self = await window.__mobileProbe.stop()
          return {
            self,
            snapshot: sample,
            entries: monitor.traceSlice(0, durationMs),
            loads: monitor.loads.snapshot(),
            milestones: {
              ttfrMs: sample.ttfrMs,
              firstRainMs: sample.firstRainMs,
              basemapReadyMs: sample.basemapReadyMs,
              ttfpMs: sample.ttfpMs,
              blankVisibleMs: sample.blankVisibleMs,
              blankSlotSeconds: sample.blankSlotSeconds,
              blankShareSeconds: sample.blankShareSeconds,
              firstBarMs: sample.firstBarMs,
              splashGoneMs: window.__mobileProbe.splashGoneMs,
              ttfhMs: window.__mobileProbe.ttfhMs,
              windowReadyMs: sample.windowReadyMs ?? {},
              histogramSource: window.__mobileProbe.histogramSource,
            },
            frameTimes: window.__mobileProbe.frameTimes,
            temperatureBlankDraws: (() => {
              const settled = (window as unknown as { __blankDrawsAtSettle?: number }).__blankDrawsAtSettle
              const total = (window as unknown as { __motregenIsolines?: () => { blankDraws?: number } }).__motregenIsolines?.().blankDraws ?? 0
              return settled === undefined ? null : total - settled
            })(),
            temperatureBlankReasons: (window as unknown as { __motregenIsolines?: () => { blankReasons?: { slice: number; palette: number; fill: number } } }).__motregenIsolines?.().blankReasons ?? null,
            temperatureBlankAt: (window as unknown as { __motregenIsolines?: () => { blankAt?: number[] } }).__motregenIsolines?.().blankAt ?? [],
            timeOrigin: performance.timeOrigin,
            hardwareConcurrency: navigator.hardwareConcurrency,
          }
        }, scenario.durationMs)
        // Laat requests die vlak vóór de meetgrens begonnen uitlopen; beide bytebronnen meten
        // dezelfde requests op starttijd, zonder een halve response als ontbrekende body te melden.
        const observedRequests = await network.snapshot(captured.timeOrigin)
        const pageResources = await page.evaluate(() =>
          ([...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')] as PerformanceResourceTiming[]).map((entry) => ({
            url: entry.name, startMs: entry.startTime, endMs: entry.responseEnd,
            encodedBodyBytes: entry.transferSize === 0 ? 0 : entry.encodedBodySize,
          })))
        const workerResources = []
        for (const worker of [...page.workers(), ...(warmVisit ? context.serviceWorkers() : [])]) {
          const owner = context.serviceWorkers().includes(worker) ? 'service-worker' as const : 'client' as const
          const entries = await worker.evaluate(() => ({
            timeOrigin: performance.timeOrigin,
            resources: (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).map((entry) => ({
              url: entry.name, startMs: entry.startTime, endMs: entry.responseEnd,
              encodedBodyBytes: entry.transferSize === 0 ? 0 : entry.encodedBodySize,
            })),
          }))
          for (const entry of entries.resources) {
            const offset = entries.timeOrigin - captured.timeOrigin
            const normalized = { ...entry, owner, startMs: entry.startMs + offset, endMs: entry.endMs + offset }
            workerResources.push(normalized)
          }
        }
        const selectedWire = wireWindow(observedRequests, [...pageResources, ...workerResources], scenario.durationMs)
        const requests = selectedWire.requests
        const wire = reconcileWire(requests, selectedWire.timing)
        const warmCache = warmVisit ? { seed: seedEvidence(), visit: await cacheInventory(page), workerNetwork: workerNetwork(context)?.evidence() } : undefined
        const decode = summarizePhases(captured.entries.measures, scenario.durationMs)
        const longFrames = captured.entries.longFrames.filter((frame) => frame.startTime + frame.duration <= scenario.durationMs)
        const longSources = new Map<string, number>()
        for (const frame of longFrames) {
          for (const script of frame.scripts) {
            const source = `${script.sourceURL} ${script.sourceFunctionName || script.invoker}`
            longSources.set(source, (longSources.get(source) ?? 0) + script.duration)
          }
        }
        const self = filterSelfProfile(captured.self.trace, scenario.durationMs)
        const trace = buildChromeTrace({
          entries: captured.entries,
          timeOrigin: captured.timeOrigin,
          captureStartTime: 0,
          captureEndTime: scenario.durationMs,
          profileStartTime: captured.self.startedAt,
          selfProfile: self ?? undefined,
          capturedAt,
          origin: baseURL!,
          platform: `Pixel 5-emulatie, renderer-quota ${rendererCpuQuotaPercent ?? 'geen'}`,
          userAgent: await page.evaluate(() => navigator.userAgent),
        })
        const resolveFrame = createSourceMapResolver(process.env.MOTREGEN_RIG_DIST ?? 'dist')
        const unmappedPositions = new Set<string>()
        const top = profileTop(trace, (frame) => {
          try { return resolveFrame(frame) }
          catch (error) {
            const message = String(error)
            if (!message.includes('geen sourcemap-positie')) throw error
            unmappedPositions.add(`${frame.url}:${frame.lineNumber + 1}:${frame.columnNumber + 1}`)
            return frame
          }
        })
        if (unmappedPositions.size) findings.push(`${unmappedPositions.size} sampleposities zonder sourcemap-positie; oorspronkelijke bundelpositie bewaard`)
        const fixtureHash = hashFixture()
        const contractHash = hashContract({ fixtureHash, profile, scenario })
        const basemapContractHash = hashContract({ weatherHash: hashWeatherFixture(), profile, scenario, viewport: page.viewportSize() })
        const fieldBytes: Record<string, number> = {}
        const traceRequests = captured.loads.requests
        const lateOutsideIntent: WireRequest[] = []
        for (const request of requests) {
          const traceRequest = traceRequests.find((candidate) => candidate.url === request.url && request.range === `bytes=${candidate.range[0]}-${candidate.range[1]}`)
          const field = inferField(request.url)
          if (field) fieldBytes[field] = (fieldBytes[field] ?? 0) + (request.encodedBodyBytes ?? 0)
          const lastMode = actions.filter((action) => action.action === 'mode' && action.actualMs <= request.startMs).at(-1)
          const nextMode = actions.find((action) => action.action === 'mode' && action.actualMs > request.startMs)
          const isFocusField = traceRequest && traceRequest.layer !== 'header' && ['temp_c', 'pressure_hpa', 'cloud_frac'].includes(field ?? '')
          if (isFocusField && lastMode && nextMode && request.endMs !== null && request.endMs > nextMode.actualMs) lateOutsideIntent.push(request)
        }
        if (captured.milestones.blankVisibleMs > 0) findings.push(`blank-visible-ms ${captured.milestones.blankVisibleMs}: na de splash stond er een leeg slot in beeld (doel 0, MIP-19)`)
        if (captured.temperatureBlankDraws) findings.push(`Temperatuurlaag ${captured.temperatureBlankDraws} beelden leeg na de eerste 300 ms van de moduswissel (doel 0); oorzaken over de hele run: ${JSON.stringify(captured.temperatureBlankReasons)}, tijdstippen ${captured.temperatureBlankAt.join(' ')}`)
        if (scenario.autoplay && captured.milestones.ttfpMs === null) findings.push('ttfp niet bereikt: geen frame-wissel tijdens afspelen binnen de meetduur')
        if (!self) findings.push(captured.self.error ?? 'Self-Profiling leverde geen samples')
        if (!Object.keys(captured.milestones.windowReadyMs).length) findings.push('U52 window-ready-meetpunten ontbreken op deze main; ttfh komt uit de loadtrace')
        if (scenario.steps.some((step) => step.mode === 'Lucht') && !actions.some((action) => action.detail === 'modus Lucht')) findings.push('Deze main heeft nog geen Lucht-knop: bestaande Weer-wolkenfocus gebruikt en expliciet geregistreerd')
        const report: MobileReport = {
          meta: { profile: profileId, scenario: scenarioId, sourceSha, capturedAt, cpuThrottleRate: profile.cpuThrottleRate, contractHash, fixtureHash, basemapContractHash, network: profile.network, hardwareConcurrency: captured.hardwareConcurrency, loadAverage, synthGridScale, rendererCpuQuotaPercent, requestOrderOnly: options.requestOrderOnly ?? false, cacheState: warmVisit ? 'warm-disk-new-browser' : 'cold', warmCache },
          milestones: captured.milestones,
          decode,
          wire: { ...wire, rangeRequests: requests.filter((request) => request.range !== null).length, beforeTtfrBytes: completedBytesBefore(requests, captured.milestones.ttfrMs), beforeTtfhBytes: completedBytesBefore(requests, captured.milestones.ttfhMs) },
          longFrames: { first12s: longFrameTotals(longFrames.filter((frame) => frame.startTime < 12_000)), count: longFrames.length, totalMs: longFrames.reduce((total, frame) => total + frame.duration, 0), blockingMs: longFrames.reduce((total, frame) => total + frame.blockingDuration, 0), topSources: [...longSources].sort((left, right) => right[1] - left[1]).slice(0, 3).map(([source, durationMs]) => ({ source, durationMs })) },
          mainThread: { samples: self?.samples.length ?? 0, busySamples: self?.samples.filter((sample) => sample.stackId !== undefined).length ?? 0, busyPercent: self?.samples.length ? 100 * self.samples.filter((sample) => sample.stackId !== undefined).length / self.samples.length : null, topSources: top.functions.filter((entry) => entry.url).slice(0, 3).map(({ functionName, url, selfSamples }) => ({ functionName, url, selfSamples })) },
          intent: { fieldBytes, lateOutsideIntent },
          actions,
          temperatureBlankDraws: captured.temperatureBlankDraws,
          smoothness: (scenario.windows ?? []).map((window) => smoothness(captured.frameTimes, window, longFrames)),
          scrub: captured.snapshot.scrub,
          findings: [...wire.findings, ...findings, ...errors, ...externalRequests.map((url) => `Extern netwerk geblokkeerd: ${url}`)],
        }
        mkdirSync('tmp/perf-mobile', { recursive: true })
        const output = `tmp/perf-mobile/${profileId}-${scenarioId}-run${repetition}`
        writeFileSync(`${output}.json`, `${JSON.stringify(report, null, 2)}\n`)
        writeFileSync(`${output}.md`, renderMobileReport(report))
        writeFileSync(`${output}.trace.json`, JSON.stringify(trace))
        writeFileSync(`${output}.raw.json`, JSON.stringify({ requests, observedRequests, selectedResourceTiming: selectedWire.timing, pageResourceTiming: pageResources, workerResourceTiming: workerResources, actions, loads: captured.loads, selfProfile: self, entries: captured.entries }))
        console.log(`${profileId}/${scenarioId}: ${decode.phases['frame-decode']?.count} decodes, ${wire.playwright.total.bytes} bodybytes, ${wire.findings.length} netwerkbevindingen → ${output}.md`)
        for (const window of report.smoothness) console.log(`  ${window.name}: frame-tijd p95 ${window.p95Ms} ms, ${window.over50Ms} beelden > 50 ms, ${window.frames} beelden, LoAF ${window.longFrames.totalMs} ms`)
        if (scenario.requireFilledTemperature) expect(captured.temperatureBlankDraws, `temperatuurlaag nooit leeg na de eerste 300 ms; oorzaken ${JSON.stringify(captured.temperatureBlankReasons)}`).toBe(0)
        expect(externalRequests, 'geen live-netwerk').toEqual([])
        expect(errors, 'geen pagina-/consolefouten').toEqual([])
        expect(captured.milestones.ttfrMs).not.toBeNull()
        if (!warmVisit) {
          expect(wire.playwright.manifest.bytes, 'Playwright observeert een echte manifestbody').toBeGreaterThan(0)
          expect(wire.resourceTiming.manifest.bytes, 'native Resource Timing blijft actief').toBeGreaterThan(0)
        }
      })
    }
  }
}

function longFrameTotals(frames: Array<{ duration: number; blockingDuration: number }>) {
  return { count: frames.length, totalMs: frames.reduce((total, frame) => total + frame.duration, 0), blockingMs: frames.reduce((total, frame) => total + frame.blockingDuration, 0) }
}

async function waitUntil(page: Page, timestampMs: number): Promise<void> {
  const remaining = timestampMs - await page.evaluate(() => performance.now())
  if (remaining > 0) await page.waitForTimeout(remaining)
}

async function performStep(page: Page, step: ScenarioStep): Promise<string> {
  const slider = page.getByRole('slider', { name: 'Tijd' })
  if (step.action === 'play') {
    const playing = await slider.getAttribute('data-playing') !== null
    if (playing !== step.playing) await slider.press(' ')
    return step.playing ? 'afspelen' : 'pauzeren'
  }
  if (step.action === 'jump') {
    for (let press = 0; press < step.presses!; press++) await slider.press('PageUp')
    return `sprong ${step.presses}× PageUp`
  }
  if (step.action === 'seek') {
    const until = Date.now() + step.seekMs!
    let presses = 0
    while (Date.now() < until) {
      await slider.press('ArrowRight')
      presses++
      await page.waitForTimeout(100)
    }
    return `seek ${presses} stappen in ${step.seekMs} ms`
  }
  if (step.action === 'scrub') {
    const before = Number(await page.locator('.app-shell').getAttribute('data-epoch'))
    for (let offset = 0; offset < step.minutes! / 30; offset++) await slider.press('PageUp')
    const after = Number(await page.locator('.app-shell').getAttribute('data-epoch'))
    expect(after - before, `scrub precies ${step.minutes} minuten vooruit`).toBe(step.minutes! * 60_000)
    return `scrub ${step.minutes} minuten`
  }
  let label = step.mode!
  const nativeAir = await page.getByRole('button', { name: 'Lucht', exact: true }).count() > 0
  if (label === 'Lucht' && !nativeAir) label = 'Weer'
  // Temperatuurlaag: na 300 ms mag er geen beeld meer zijn waarin de laag leeg is (MIP-19).
  if (label === 'Gevoel') setTimeout(() => { void page.evaluate(() => { (window as unknown as { __blankDrawsAtSettle?: number }).__blankDrawsAtSettle = (window as unknown as { __motregenIsolines: () => { blankDraws?: number } }).__motregenIsolines().blankDraws ?? 0 }).catch(() => undefined) }, 300)
  const button = page.getByRole('button', { name: label, exact: true })
  // Een DOM-klik, geen Playwright-klik: die scrolt bij een mislukte hit-test de pagina naar de kop, en op
  // een telefoon is dat de tabel openen — dan laadt de hele tabel en meet het scenario iets anders (U58).
  const tap = (target: typeof button) => target.evaluate((element: HTMLElement) => element.click())
  if (step.mode === 'Weer' && !nativeAir) {
    const pinned = page.locator('.forecast-table button.column-mode[aria-pressed="true"]')
    if (await pinned.count()) await tap(pinned.first())
  } else if (await button.getAttribute('aria-pressed') !== 'true') await tap(button)
  await button.evaluate((element: HTMLElement) => element.blur())
  await page.mouse.move(1, 1)
  return label !== step.mode ? `modus Lucht via bestaande Weer-wolkenfocus` : `modus ${label}`
}

function filterSelfProfile(trace: SelfProfilerTrace | null, durationMs: number): SelfProfilerTrace | null {
  return trace ? { ...trace, samples: trace.samples.filter((sample) => sample.timestamp <= durationMs) } : null
}

interface NetworkRecord {
  fromHttpCache?: boolean
  fromServiceWorker?: boolean
  cacheControl?: string | null
  range: string | null
  bytes: number | null
  status: number | null
  failure: string | null
  bodySizeSource: 'playwright-sizes' | 'completed-content-length'
  playwrightBodySize: number | null
  contentLength: number | null
  completed: Promise<void>
  finish: () => void
}

function recordPlaywrightNetwork(page: Page | BrowserContext, warm = false, context?: BrowserContext) {
  const requests = new Map<Request, NetworkRecord>()
  page.on('request', (request) => {
    if (!/^https?:/.test(request.url())) return
    let finish!: () => void
    const completed = new Promise<void>((resolve) => { finish = resolve })
    requests.set(request, { range: request.headers().range ?? null, bytes: null, status: null, failure: null, bodySizeSource: 'playwright-sizes', playwrightBodySize: null, contentLength: null, completed, finish })
  })
  const collect = async (request: Request) => {
    const record = requests.get(request)
    if (!record) return
    try {
      const response = await request.response()
      record.status = response?.status() ?? null
      record.fromServiceWorker = response?.fromServiceWorker() ?? false
      record.cacheControl = response?.headers()['cache-control'] ?? null
      const sizes = await request.sizes()
      const declared = response?.headers()['content-length']
      record.playwrightBodySize = sizes.responseBodySize
      record.contentLength = declared === undefined ? null : Number(declared)
      record.fromHttpCache = Boolean(warm && request.serviceWorker() && context && workerNetwork(context)?.cached(request.url(), record.range, request.timing().startTime))
      record.bodySizeSource = !warm && sizes.responseBodySize === 0 && record.contentLength !== null && record.failure === null ? 'completed-content-length' : 'playwright-sizes'
      record.bytes = warm && (response?.fromServiceWorker() || record.fromHttpCache) ? 0 : record.bodySizeSource === 'completed-content-length' ? record.contentLength : sizes.responseBodySize
    }
    catch (error) { record.failure = String(error) }
    finally { record.finish() }
  }
  page.on('requestfinished', (request) => { void collect(request) })
  page.on('requestfailed', (request) => {
    const record = requests.get(request)
    if (record) record.failure = request.failure()?.errorText ?? 'request mislukt'
    void collect(request)
  })
  return {
    snapshot: async (timeOrigin: number): Promise<WireRequest[]> => {
      const observed = [...requests]
      let deadline: ReturnType<typeof setTimeout> | undefined
      try {
        await Promise.race([
          Promise.all(observed.map(([, record]) => record.completed)),
          new Promise<never>((_, reject) => { deadline = setTimeout(() => reject(new Error('Netwerkrequests lopen niet binnen 10 s na de meetgrens uit')), 10_000) }),
        ])
      } finally {
        clearTimeout(deadline)
      }
      const result: WireRequest[] = []
      for (const [request, record] of observed) {
        const timing = request.timing()
        // De onafhankelijke CDP-socket kan loadingFinished later bezorgen dan Playwright.
        if (warm && request.serviceWorker() && context && workerNetwork(context)?.cached(request.url(), record.range, timing.startTime)) {
          record.fromHttpCache = true
          record.bytes = 0
        }
        const startMs = timing.startTime - timeOrigin
        const endMs = timing.responseEnd < 0 ? null : startMs + timing.responseEnd
        if (startMs < 0) throw new Error(`Playwright heeft geen geldige request-starttijd: ${request.url()}`)
        result.push({ url: request.url(), startMs, endMs, encodedBodyBytes: record.bytes, range: record.range, status: record.status, failure: record.failure, bodySizeSource: record.bodySizeSource, playwrightBodySize: record.playwrightBodySize, contentLength: record.contentLength, fromServiceWorker: record.fromServiceWorker, fromHttpCache: record.fromHttpCache, cacheControl: record.cacheControl, owner: request.serviceWorker() ? 'service-worker' : 'client' })
      }
      return result
    },
  }
}

function hashFixture(): string {
  const hash = createHash('sha256')
  function files(directory: string, prefix = ''): string[] {
    return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => entry.isDirectory()
      ? files(join(directory, entry.name), `${prefix}${entry.name}/`)
      : [`${prefix}${entry.name}`])
  }
  for (const filename of files(fixtureRoot).sort()) {
    const content = readFileSync(join(fixtureRoot, filename))
    hash.update(filename)
    // De style-URL bevat uitsluitend een lokale poort, geen deel van de datasetidentiteit.
    hash.update(filename.endsWith('.json') ? content.toString().replace(/127\.0\.0\.1:\d+/g, '127.0.0.1:DATA') : content)
  }
  return hash.digest('hex')
}

function hashWeatherFixture(): string {
  const hash = createHash('sha256')
  for (const filename of ['manifest.json', ...readdirSync(join(fixtureRoot, 'chunks')).sort().map((name) => `chunks/${name}`)]) {
    hash.update(filename).update(readFileSync(join(fixtureRoot, filename)))
  }
  return hash.digest('hex')
}

function hashContract(measurement: unknown): string {
  const hash = createHash('sha256').update(JSON.stringify(measurement))
  for (const path of ['perf/scenarios.json', 'perf/Caddyfile', 'perf/Preview.Caddyfile', 'scripts/synthgen.ts', 'scripts/mobile-fixture.ts', 'scripts/mobile-assets.ts', 'scripts/mobile-report.ts', 'scripts/perf-mobile.ts', 'scripts/perf-run.ts', 'scripts/rig-host.ts', 'scripts/rig-worker-network.ts', 'e2e/mobile-load.rig.ts', 'e2e/rig-cache.ts', 'e2e/mobile-probe.ts', 'playwright.mobile.config.ts']) hash.update(readFileSync(path))
  return hash.digest('hex')
}

function inferField(url: string): string | null {
  const file = new URL(url).pathname.split('/').at(-1) ?? ''
  if (!file.endsWith('.mrf')) return null
  const field = file.split('-')[0]!
  return ['rtcor', 'nowcast', 'seamless', 'harmonie'].includes(field) ? 'rain_rate' : field
}
