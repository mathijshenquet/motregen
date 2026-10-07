import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test, type Page, type Request } from '@playwright/test'
import { applyEmulation, performanceProfile } from './profiles'
import { installMobileProbe } from './mobile-probe'
import { buildChromeTrace, type SelfProfilerTrace } from '../src/core/profile-recorder'
import { createSourceMapResolver } from '../scripts/prof-source-map'
import { profileTop } from '../scripts/prof-top'
import { hostLoadAverage, waitForQuietHost } from '../scripts/rig-host'
import { completedBytesBefore, reconcileWire, renderMobileReport, summarizePhases, type MobileReport, type WireRequest } from '../scripts/mobile-report'
import type { PerfMonitor } from '../src/core/perf'

interface ScenarioStep {
  atMs: number
  action: 'scrub' | 'play' | 'mode'
  minutes?: number
  playing?: boolean
  mode?: 'Weer' | 'Lucht' | 'Gevoel' | 'Wind'
}
interface Scenario { durationMs: number; description: string; steps: ScenarioStep[]; autoplay?: boolean; devStorage?: Record<string, string> }
interface RigOptions { profiles: string[]; scenarios: string[]; repeat: number; cpuRate?: number }
const options = JSON.parse(process.env.MOTREGEN_MOBILE_OPTIONS ?? '{"profiles":["mobile-4g"],"scenarios":["koud"],"repeat":1,"cpuRate":4}') as RigOptions
const scenarios = JSON.parse(readFileSync('perf/scenarios.json', 'utf8')) as Record<string, Scenario>
const QUIET_HOST_WAIT_MS = 15 * 60_000
const synthGridScale = Number(process.env.MOTREGEN_SYNTH_GRID_SCALE ?? 1)
const sourceSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()

for (const profileId of options.profiles) {
  for (const scenarioId of options.scenarios) {
    for (let repetition = 1; repetition <= options.repeat; repetition++) {
      test(`${profileId} / ${scenarioId} / run ${repetition}`, async ({ page, context, baseURL }) => {
        const scenario = scenarios[scenarioId]!
        // Ook tussen de herhalingen kan de host druk worden; een run die druk begint is weggegooid werk.
        test.setTimeout(60_000 + QUIET_HOST_WAIT_MS)
        await waitForQuietHost(QUIET_HOST_WAIT_MS, (message) => console.log(message))
        const loadAverage = hostLoadAverage()
        const calibrated = performanceProfile(profileId)
        const profile = { ...calibrated, cpuThrottleRate: options.cpuRate ?? calibrated.cpuThrottleRate }
        const actions: MobileReport['actions'] = []
        const errors: string[] = []
        const findings: string[] = []
        const externalRequests: string[] = []
        page.on('pageerror', (error) => errors.push(error.message))
        page.on('console', (message) => { if (message.type() === 'error') errors.push(message.text()) })
        const cdp = await context.newCDPSession(page)
        await applyEmulation(cdp, profile)
        await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
        if (profile.device) {
          await page.setViewportSize(profile.device.viewport)
          await cdp.send('Emulation.setUserAgentOverride', { userAgent: profile.device.userAgent })
        }
        const allowedOrigins = new Set([baseURL!, `http://127.0.0.1:${process.env.MOTREGEN_E2E_DATA_PORT ?? 8392}`])
        await context.route(/^https?:\/\//, async (route) => {
          if (allowedOrigins.has(new URL(route.request().url()).origin)) await route.continue()
          else {
            externalRequests.push(route.request().url())
            await route.abort('blockedbyclient')
          }
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
        const network = recordPlaywrightNetwork(page)
        const capturedAt = new Date().toISOString()
        // Een ?t-preset zet de tijdlijn stil; zonder preset speelt de app vanzelf, zoals bij een gewone bezoeker.
        await page.goto(`${scenario.autoplay ? '/?perf=1&modus=weer' : '/?perf=1&t=%2B0u&modus=weer'}${scenario.devStorage ? '&dev' : ''}`, { waitUntil: 'commit' })
        await page.waitForFunction(() => window.__motregenPerf?.snapshot().firstRainMs !== null && window.__motregenPerf?.snapshot().firstRainMs !== undefined)
        if (!scenario.autoplay) await expect(page.getByRole('slider', { name: 'Tijd' })).not.toHaveAttribute('data-playing', '')

        for (const step of scenario.steps) {
          await waitUntil(page, step.atMs)
          const actualMs = await page.evaluate(() => performance.now())
          const detail = await performStep(page, step)
          actions.push({ action: step.action, plannedMs: step.atMs, actualMs, detail })
          if (actualMs - step.atMs > 250) findings.push(`Scenarioactie ${step.action} ${Math.round(actualMs - step.atMs)} ms later dan gepland`)
        }
        await waitUntil(page, scenario.durationMs)
        const captured = await page.evaluate(async (durationMs) => {
          const monitor = window.__motregenPerf as PerfMonitor
          const sample = monitor.snapshot() as ReturnType<PerfMonitor['snapshot']> & { windowReadyMs?: Record<string, number> }
          const self = await window.__mobileProbe.stop()
          const resourceEntries = [...performance.getEntriesByType('navigation'), ...performance.getEntriesByType('resource')] as PerformanceResourceTiming[]
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
              splashGoneMs: window.__mobileProbe.splashGoneMs,
              ttfhMs: window.__mobileProbe.ttfhMs,
              windowReadyMs: sample.windowReadyMs ?? {},
              histogramSource: window.__mobileProbe.histogramSource,
            },
            resources: resourceEntries.filter((entry) => entry.responseEnd <= durationMs).map((entry) => ({
              url: entry.name, startMs: entry.startTime, endMs: entry.responseEnd,
              encodedBodyBytes: entry.transferSize === 0 ? 0 : entry.encodedBodySize,
            })),
            timeOrigin: performance.timeOrigin,
            hardwareConcurrency: navigator.hardwareConcurrency,
          }
        }, scenario.durationMs)
        const workerResources = []
        for (const worker of page.workers()) {
          const entries = await worker.evaluate(() => ({
            timeOrigin: performance.timeOrigin,
            resources: (performance.getEntriesByType('resource') as PerformanceResourceTiming[]).map((entry) => ({
              url: entry.name, startMs: entry.startTime, endMs: entry.responseEnd,
              encodedBodyBytes: entry.transferSize === 0 ? 0 : entry.encodedBodySize,
            })),
          }))
          for (const entry of entries.resources) {
            const offset = entries.timeOrigin - captured.timeOrigin
            if (entry.endMs + offset <= scenario.durationMs) workerResources.push({ ...entry, startMs: entry.startMs + offset, endMs: entry.endMs + offset })
          }
        }
        const requests = await network.snapshot(captured.timeOrigin, scenario.durationMs)
        const wire = reconcileWire(requests, [...captured.resources, ...workerResources])
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
          platform: 'Pixel 5-emulatie, worker-CPU ongeremd',
          userAgent: await page.evaluate(() => navigator.userAgent),
        })
        const resolveFrame = createSourceMapResolver('dist')
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
        if (scenario.autoplay && captured.milestones.ttfpMs === null) findings.push('ttfp niet bereikt: geen frame-wissel tijdens afspelen binnen de meetduur')
        if (!self) findings.push(captured.self.error ?? 'Self-Profiling leverde geen samples')
        if (!Object.keys(captured.milestones.windowReadyMs).length) findings.push('U52 window-ready-meetpunten ontbreken op deze main; ttfh komt uit de loadtrace')
        if (scenario.steps.some((step) => step.mode === 'Lucht') && !actions.some((action) => action.detail === 'modus Lucht')) findings.push('Deze main heeft nog geen Lucht-knop: bestaande Weer-wolkenfocus gebruikt en expliciet geregistreerd')
        const report: MobileReport = {
          meta: { profile: profileId, scenario: scenarioId, sourceSha, capturedAt, cpuThrottleRate: profile.cpuThrottleRate, contractHash, fixtureHash, network: profile.network, hardwareConcurrency: captured.hardwareConcurrency, loadAverage, synthGridScale },
          milestones: captured.milestones,
          decode,
          wire: { ...wire, rangeRequests: requests.filter((request) => request.range !== null).length, beforeTtfrBytes: completedBytesBefore(requests, captured.milestones.ttfrMs), beforeTtfhBytes: completedBytesBefore(requests, captured.milestones.ttfhMs) },
          longFrames: { first12s: longFrameTotals(longFrames.filter((frame) => frame.startTime < 12_000)), count: longFrames.length, totalMs: longFrames.reduce((total, frame) => total + frame.duration, 0), blockingMs: longFrames.reduce((total, frame) => total + frame.blockingDuration, 0), topSources: [...longSources].sort((left, right) => right[1] - left[1]).slice(0, 3).map(([source, durationMs]) => ({ source, durationMs })) },
          mainThread: { samples: self?.samples.length ?? 0, busySamples: self?.samples.filter((sample) => sample.stackId !== undefined).length ?? 0, busyPercent: self?.samples.length ? 100 * self.samples.filter((sample) => sample.stackId !== undefined).length / self.samples.length : null, topSources: top.functions.filter((entry) => entry.url).slice(0, 3).map(({ functionName, url, selfSamples }) => ({ functionName, url, selfSamples })) },
          intent: { fieldBytes, lateOutsideIntent },
          actions,
          findings: [...wire.findings, ...findings, ...errors, ...externalRequests.map((url) => `Extern netwerk geblokkeerd: ${url}`)],
        }
        mkdirSync('tmp/perf-mobile', { recursive: true })
        const output = `tmp/perf-mobile/${profileId}-${scenarioId}-run${repetition}`
        writeFileSync(`${output}.json`, `${JSON.stringify(report, null, 2)}\n`)
        writeFileSync(`${output}.md`, renderMobileReport(report))
        writeFileSync(`${output}.trace.json`, JSON.stringify(trace))
        writeFileSync(`${output}.raw.json`, JSON.stringify({ requests, pageResourceTiming: captured.resources, workerResourceTiming: workerResources, actions, loads: captured.loads, selfProfile: self, entries: captured.entries }))
        console.log(`${profileId}/${scenarioId}: ${decode.phases['frame-decode']?.count} decodes, ${wire.playwright.total.bytes} bodybytes, ${wire.findings.length} netwerkbevindingen → ${output}.md`)
        expect(externalRequests, 'geen live-netwerk').toEqual([])
        expect(errors, 'geen pagina-/consolefouten').toEqual([])
        expect(captured.milestones.ttfrMs).not.toBeNull()
        expect(wire.playwright.manifest.bytes, 'Playwright observeert een echte manifestbody').toBeGreaterThan(0)
        expect(wire.resourceTiming.manifest.bytes, 'native Resource Timing blijft actief').toBeGreaterThan(0)
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
  if (step.action === 'scrub') {
    const before = Number(await page.locator('.app-shell').getAttribute('data-epoch'))
    for (let offset = 0; offset < step.minutes! / 30; offset++) await slider.press('PageUp')
    const after = Number(await page.locator('.app-shell').getAttribute('data-epoch'))
    expect(after - before, 'scrub precies twee uur vooruit').toBe(step.minutes! * 60_000)
    return `scrub ${step.minutes} minuten`
  }
  let label = step.mode!
  const nativeAir = await page.getByRole('button', { name: 'Lucht', exact: true }).count() > 0
  if (label === 'Lucht' && !nativeAir) label = 'Weer'
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

function recordPlaywrightNetwork(page: Page) {
  const requests = new Map<Request, { range: string | null; bytes: number | null; status: number | null; failure: string | null; bodySizeSource: 'playwright-sizes' | 'completed-content-length'; playwrightBodySize: number | null; contentLength: number | null }>()
  const pending = new Set<Promise<void>>()
  page.on('request', (request) => requests.set(request, { range: request.headers().range ?? null, bytes: null, status: null, failure: null, bodySizeSource: 'playwright-sizes', playwrightBodySize: null, contentLength: null }))
  const collect = (request: Request) => {
    const task = (async () => {
      const record = requests.get(request)
      if (!record) return
      const response = await request.response()
      record.status = response?.status() ?? null
      try {
        const sizes = await request.sizes()
        const declared = response?.headers()['content-length']
        record.playwrightBodySize = sizes.responseBodySize
        record.contentLength = declared === undefined ? null : Number(declared)
        record.bodySizeSource = sizes.responseBodySize === 0 && record.contentLength !== null && record.failure === null ? 'completed-content-length' : 'playwright-sizes'
        record.bytes = record.bodySizeSource === 'completed-content-length' ? record.contentLength : sizes.responseBodySize
      }
      catch (error) { record.failure = String(error) }
    })()
    pending.add(task)
    void task.finally(() => pending.delete(task))
  }
  page.on('requestfinished', collect)
  page.on('requestfailed', (request) => {
    const record = requests.get(request)
    if (record) record.failure = request.failure()?.errorText ?? 'request mislukt'
    collect(request)
  })
  return {
    snapshot: async (timeOrigin: number, durationMs: number): Promise<WireRequest[]> => {
      await Promise.all(pending)
      const result: WireRequest[] = []
      for (const [request, record] of requests) {
        const timing = request.timing()
        const startMs = timing.startTime - timeOrigin
        const endMs = timing.responseEnd < 0 ? null : startMs + timing.responseEnd
        if (startMs > durationMs) continue
        result.push({ url: request.url(), startMs, endMs: endMs !== null && endMs <= durationMs ? endMs : null, encodedBodyBytes: endMs !== null && endMs <= durationMs ? record.bytes : null, range: record.range, status: record.status, failure: record.failure, bodySizeSource: record.bodySizeSource, playwrightBodySize: record.playwrightBodySize, contentLength: record.contentLength })
      }
      return result
    },
  }
}

function hashFixture(): string {
  const hash = createHash('sha256')
  for (const filename of ['manifest.json', ...readdirSync('public/perf-mobile/chunks').sort().map((name) => `chunks/${name}`), 'style.json', 'tile.pbf']) {
    const content = readFileSync(join('public/perf-mobile', filename))
    hash.update(filename)
    // De style-URL bevat uitsluitend een lokale poort, geen deel van de datasetidentiteit.
    hash.update(filename === 'style.json' ? content.toString().replace(/127\.0\.0\.1:\d+/g, '127.0.0.1:DATA') : content)
  }
  return hash.digest('hex')
}

function hashContract(measurement: unknown): string {
  const hash = createHash('sha256').update(JSON.stringify(measurement))
  for (const path of ['perf/scenarios.json', 'perf/Caddyfile', 'perf/Preview.Caddyfile', 'scripts/synthgen.ts', 'scripts/mobile-fixture.ts', 'scripts/mobile-assets.ts', 'e2e/mobile-load.rig.ts', 'e2e/mobile-probe.ts', 'playwright.mobile.config.ts']) hash.update(readFileSync(path))
  return hash.digest('hex')
}

function inferField(url: string): string | null {
  const file = new URL(url).pathname.split('/').at(-1) ?? ''
  if (!file.endsWith('.mrf')) return null
  const field = file.split('-')[0]!
  return ['rtcor', 'nowcast', 'seamless', 'harmonie'].includes(field) ? 'rain_rate' : field
}
