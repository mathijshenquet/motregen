import { expect, test, type CDPSession, type Page } from '@playwright/test'
import type { Manifest } from '../src/core/contract'
import { pausePlayback, startPlayback } from './playback'
import { applyEmulation, performanceProfile } from './profiles'

interface PerfSnapshot {
  ttfrMs: number | null
  scrub: { samples: number; p50Ms: number | null; p95Ms: number | null }
  fps: number | null
  network: {
    manifest: { requests: number; bytes: number }
    chunks: { requests: number; bytes: number }
    total: { requests: number; bytes: number }
  }
}

interface JourneyResult {
  profile: string
  label: string
  emulation: string
  cpuThrottleRate: number
  coldTtfrMs: number | null
  warmTtfrMs: number | null
  passiveChunkBytes: number
  timeToLoadStageMs: number
  scrubP50Ms: number | null
  scrubP95Ms: number | null
  scrubTransfers: number
  scrubFrames: number
  locationTransfers: number
  sessionBytes: number
  resourceBytes: number
  sessionDownloadMs: number
  fps: number | null
  errors: string[]
}

const live = process.env.MOTREGEN_PERF_MODE === 'live'

test('?perf opens the compact profiler controls while a plain URL closes stale state', async ({ page }) => {
  await page.route('**/data/**', (route) => route.abort())
  await page.goto('/?perf')
  await expect(page.getByTestId('perf-hud')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Opname 30 s' })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Koude start' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('motregen-perf'))).toBe('1')

  await page.goto('/')
  await expect(page.getByTestId('perf-hud')).toBeHidden()
  expect(await page.evaluate(() => localStorage.getItem('motregen-perf'))).toBeNull()

  await page.goto('/?perf=0')
  await expect(page.getByTestId('perf-hud')).toBeHidden()
  expect(await page.evaluate(() => localStorage.getItem('motregen-perf'))).toBeNull()

  await page.goto('/?dev')
  await page.getByTestId('dev-panel').locator('details.dev-group').filter({ hasText: 'Diagnose' })
    .evaluate((element: HTMLDetailsElement) => { element.open = true })
  await expect(page.getByTestId('dev-panel').getByRole('button', { name: 'Opname 30 s' })).toBeVisible()
  await expect(page.getByTestId('dev-panel').getByRole('button', { name: 'Koude start' })).toBeVisible()
})

test('user journey measures performance and cache behaviour', async ({ page, context }, testInfo) => {
  const profile = performanceProfile(testInfo.project.name)
  testInfo.setTimeout(live ? 240_000 : 120_000)

  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`))
  // Het gebruiksbaken (MIP-13) vertrekt pas als de pagina verdwijnt (hier: de warme reload); de keepalive-POST
  // komt wel aan (e2e/usage.spec.ts telt serverkant), maar Playwright meldt hem voor het oude document als
  // ERR_ABORTED. Tijdens een sessie mag er géén baken gaan: dat telt beaconRequests.
  const beaconRequests: string[] = []
  page.on('request', (request) => { if (new URL(request.url()).pathname === '/hit') beaconRequests.push(request.url()) })
  page.on('requestfailed', (request) => {
    if (new URL(request.url()).pathname === '/hit' && request.failure()?.errorText === 'net::ERR_ABORTED') return
    errors.push(`request: ${request.url()} (${request.failure()?.errorText ?? 'failed'})`)
  })

  const cdp = await context.newCDPSession(page)
  const network = await observeNetwork(cdp)
  await applyEmulation(cdp, profile)
  await page.addInitScript(() => {
    localStorage.setItem('motregen-saved-places', JSON.stringify([{
      id: 'perf-utrecht', name: 'Utrecht', sourceLabel: 'Utrecht', lng: 5.1214, lat: 52.0907,
    }]))
  })

  let cold: PerfSnapshot | null = null
  let warm: PerfSnapshot | null = null
  let passive: PerfSnapshot | null = null
  let timeToLoadStageMs = 0
  let scrubTransfers = 0
  let scrubFrames = 0
  let locationTransfers = 0

  await test.step('cold load renders rain without browser errors', async () => {
    network.startJourney()
    await page.goto('/')
    cold = await waitForTtfr(page)
    if (!live) expect(cold.ttfrMs).toBeLessThan(profile.coldTtfrBudgetMs)
    // Geen URL-parameter meer (MIP-12): de HUD start dicht.
    await expect(page.getByTestId('perf-hud')).toBeHidden()
    await expect(page.locator('.scrubber')).toHaveAttribute('aria-label', /voor De Bilt$/, { timeout: live ? 180_000 : 10_000 })
    await expect(page.getByRole('slider', { name: 'Tijd' })).toHaveAttribute('data-load-stage', 'window', { timeout: live ? 180_000 : 20_000 })
    await page.waitForLoadState('networkidle')
    passive = await perfSnapshot(page)
    if (!live) expect(passive.network.chunks.bytes).toBeLessThanOrEqual(profile.passiveChunkByteBudget)
    expect(beaconRequests, 'geen gebruiksbaken tijdens de sessie').toEqual([])
    expect(errors).toEqual([])
    console.log(`${profile.label}: cold TTFR ${cold.ttfrMs} ms; passive chunks ${passive.network.chunks.bytes} B`)
  })

  await test.step('logo triple-tap toggles the HUD and JSON is copyable', async () => {
    await page.locator('.map-brand').click({ clickCount: 3, delay: 20 })
    await expect(page.getByTestId('perf-hud')).toBeVisible()
    await page.locator('.map-brand').click({ clickCount: 3, delay: 20 })
    await expect(page.getByTestId('perf-hud')).toBeHidden()
    await page.locator('.map-brand').click({ clickCount: 3, delay: 20 })
    await expect(page.getByTestId('perf-hud')).toBeVisible()
    await page.getByRole('button', { name: 'Kopieer JSON' }).click()
    await expect(page.getByRole('button', { name: 'Gekopieerd' })).toBeVisible()
  })

  await test.step('scrubbing and playback use the time slider, without removed range controls', async () => {
    await expect(page.locator('.scrubber')).toHaveAttribute('aria-label', /voor De Bilt$/)
    const requestStart = await transferredDataRequests(page, '/data/chunks/')
    const completeStartedAt = performance.now()
    const scrubber = page.getByRole('slider', { name: 'Tijd' })
    await pausePlayback(page)
    await scrubber.focus()
    await scrubber.press('Home')
    const scrubStart = Number(await scrubber.getAttribute('aria-valuenow'))
    const scrubSteps = 12
    for (let step = 0; step < scrubSteps; step++) await scrubber.press('ArrowRight')
    scrubFrames = Number(await scrubber.getAttribute('aria-valuemax')) + 1
    expect(Number(await scrubber.getAttribute('aria-valuenow'))).toBeGreaterThan(scrubStart)

    const cursorBeforePlayback = await scrubber.getAttribute('aria-valuenow')
    await startPlayback(page)
    await expect.poll(() => scrubber.getAttribute('aria-valuenow')).not.toBe(cursorBeforePlayback)
    await pausePlayback(page)
    await expect(scrubber).toHaveAttribute('data-load-stage', expectedLoadStage(profile), { timeout: live ? 180_000 : 30_000 })
    timeToLoadStageMs = performance.now() - completeStartedAt
    await page.waitForTimeout(500)
    scrubTransfers = await transferredDataRequests(page, '/data/chunks/') - requestStart
    if (!live) expect(scrubTransfers).toBeLessThanOrEqual(profile.scrubTransferBudget)
    const measured = await perfSnapshot(page)
    expect(measured.scrub.samples).toBeGreaterThan(0)
    expect(errors).toEqual([])
    console.log(`${profile.label}: ${expectedLoadStage(profile)} in ${timeToLoadStageMs.toFixed(1)} ms; scrub ${scrubTransfers} chunk requests / ${scrubFrames} frames; p50 ${measured.scrub.p50Ms} ms; p95 ${measured.scrub.p95Ms} ms; fps ${measured.fps ?? 'pending'}`)
  })

  await test.step('location changes through the search pill and reaches the appropriate load window', async () => {
    const scrubber = page.getByRole('slider', { name: 'Tijd' })
    const requestStart = await transferredDataRequests(page, '/data/')
    await page.getByRole('textbox', { name: 'Zoek plaats' }).click()
    await page.getByRole('option', { name: /^Utrecht/ }).click()
    await expect(page.locator('.scrubber')).toHaveAttribute('aria-label', /voor Utrecht$/)
    // De slider-intentie is het productcontract voor L2 op desktop; op een krap apparaat
    // vult dezelfde intentie uitsluitend het huidige zichtbare venster (U49).
    await startPlayback(page)
    await expect(scrubber).toHaveAttribute('data-load-stage', expectedLoadStage(profile), { timeout: live ? 180_000 : 30_000 })
    await pausePlayback(page)
    if (profile.id === 'desktop') await expect(page.locator('rect.rain-bar.pending')).toHaveCount(0)
    await page.waitForTimeout(100)
    locationTransfers = await transferredDataRequests(page, '/data/') - requestStart
    if (!live && profile.id === 'desktop') expect(locationTransfers).toBe(0)
    expect(errors).toEqual([])
  })

  await test.step('manifest refresh preserves the cursor and decoded chunk cache', async () => {
    const response = await page.request.get('/data/manifest.json')
    expect(response.ok()).toBe(true)
    const current = await response.json() as Manifest
    const advanced: Manifest = {
      ...current,
      generated: new Date(Date.parse(current.generated) + 60_000).toISOString(),
      now: new Date(Date.parse(current.now) + 5 * 60_000).toISOString(),
      chunks: current.chunks.map((chunk) => ({ ...chunk, times: [...chunk.times] })),
    }
    await page.route('**/data/manifest.json', (route) => route.fulfill({ json: advanced }))
    const scrubber = page.getByRole('slider', { name: 'Tijd' })
    await pausePlayback(page)
    const cursorTime = await scrubber.getAttribute('aria-valuetext')
    const nowStyle = await page.locator('.now-line').getAttribute('style')
    const chunkRequestStart = await transferredDataRequests(page, '/data/chunks/')
    const refreshStartedAt = performance.now()
    await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')))

    await expect.poll(() => page.locator('.now-line').getAttribute('style')).not.toBe(nowStyle)
    const refreshMs = performance.now() - refreshStartedAt
    expect(await scrubber.getAttribute('aria-valuetext')).toBe(cursorTime)
    await expect(scrubber).toHaveAttribute('data-load-stage', expectedLoadStage(profile))
    if (profile.id === 'desktop') await expect(page.locator('rect.rain-bar.pending')).toHaveCount(0)
    await page.waitForTimeout(100)
    if (!live) expect(await transferredDataRequests(page, '/data/chunks/') - chunkRequestStart).toBe(0)
    await page.unroute('**/data/manifest.json')
    console.log(`${profile.label}: manifest visible-return refresh ${refreshMs.toFixed(1)} ms; unchanged chunk requests 0`)
  })

  await test.step('warm reload measures cache reuse', async () => {
    await page.goto('/')
    await waitForTtfr(page)
    const warmScrubber = page.getByRole('slider', { name: 'Tijd' })
    await expect(page.locator('.scrubber')).toHaveAttribute('aria-label', /voor Utrecht$/)
    await expect(warmScrubber).toHaveAttribute('data-load-stage', 'window', { timeout: live ? 180_000 : 20_000 })
    await page.waitForLoadState('networkidle')
    warm = await perfSnapshot(page)
    await testInfo.attach('warm-perf', { body: JSON.stringify(warm), contentType: 'application/json' })
    const warmChunkResources = await transferredResources(page, '/data/chunks/')
    if (warmChunkResources.length) console.log(`${profile.label}: warm chunk resources ${JSON.stringify(warmChunkResources)}`)
    if (!live) {
      expect(warm.ttfrMs).toBeLessThan(profile.warmTtfrBudgetMs)
      expect(warm.network.manifest.requests).toBe(1)
      expect(beaconRequests, 'precies één baken: dat van de koude pagina bij de reload').toHaveLength(1)
      expect(warm.network.chunks.bytes).toBeLessThanOrEqual(profile.warmChunkByteBudget)
    }
    expect(errors).toEqual([])
    console.log(`${profile.label}: warm TTFR ${warm.ttfrMs} ms; chunk transfer ${warm.network.chunks.bytes} B`)
  })

  await test.step('the complete session reports transfer volume and duration', async () => {
    await page.waitForTimeout(500)
    if (!live) expect(network.bytes()).toBeLessThanOrEqual(profile.sessionByteBudget)
    const measured = await perfSnapshot(page)
    const result: JourneyResult = {
      profile: profile.id,
      label: profile.label,
      emulation: profile.network?.label ?? 'Geen netwerkemulatie',
      cpuThrottleRate: profile.cpuThrottleRate,
      coldTtfrMs: cold?.ttfrMs ?? null,
      warmTtfrMs: warm?.ttfrMs ?? null,
      passiveChunkBytes: passive?.network.chunks.bytes ?? 0,
      timeToLoadStageMs,
      scrubP50Ms: measured.scrub.p50Ms,
      scrubP95Ms: measured.scrub.p95Ms,
      scrubTransfers,
      scrubFrames,
      locationTransfers,
      sessionBytes: network.bytes(),
      resourceBytes: measured.network.total.bytes,
      sessionDownloadMs: network.downloadDurationMs(),
      fps: measured.fps,
      errors,
    }
    await testInfo.attach('perf-result', { body: JSON.stringify(result), contentType: 'application/json' })
    console.log(`${profile.label}: session ${result.sessionBytes} transferred bytes in ${result.sessionDownloadMs.toFixed(1)} ms; browser resource total ${result.resourceBytes} B; location change ${locationTransfers} requests`)
  })
})

async function observeNetwork(cdp: CDPSession): Promise<{
  startJourney: () => void
  bytes: () => number
  downloadDurationMs: () => number
}> {
  let sessionBytes = 0
  let journeyStartedAt = 0
  let lastResponseAt = 0
  cdp.on('Network.loadingFinished', (event) => {
    sessionBytes += event.encodedDataLength
    lastResponseAt = performance.now()
  })
  await cdp.send('Network.enable')
  return {
    startJourney() {
      journeyStartedAt = performance.now()
      lastResponseAt = journeyStartedAt
    },
    bytes: () => sessionBytes,
    downloadDurationMs: () => Math.max(0, lastResponseAt - journeyStartedAt),
  }
}

function expectedLoadStage(profile: ReturnType<typeof performanceProfile>): 'complete' | 'window' {
  return profile.id === 'desktop' ? 'complete' : 'window'
}

async function waitForTtfr(page: Page): Promise<PerfSnapshot> {
  // U68: TTFR meet de gezamenlijke klokstart, onafhankelijk van de onthullingsanimatie.
  try {
    await page.waitForFunction(() => (window as typeof window & { __motregenPerf?: unknown }).__motregenPerf !== undefined, undefined, { timeout: 30_000 })
  } catch {
    throw new Error('De origin publiceert geen window.__motregenPerf; draai eerst een frontend met MIP-7-instrumentatie')
  }
  await page.waitForFunction(() => {
    const monitor = (window as typeof window & { __motregenPerf: { snapshot: () => PerfSnapshot } }).__motregenPerf
    return monitor.snapshot().ttfrMs !== null
  }, undefined, { timeout: live ? 180_000 : 10_000 })
  return perfSnapshot(page)
}

function perfSnapshot(page: Page): Promise<PerfSnapshot> {
  return page.evaluate(() => (window as typeof window & { __motregenPerf: { snapshot: () => PerfSnapshot } }).__motregenPerf.snapshot())
}

function transferredDataRequests(page: Page, path: string): Promise<number> {
  return page.evaluate((needle) => performance.getEntriesByType('resource')
    .filter((entry) => entry.name.includes(needle) && (entry as PerformanceResourceTiming).transferSize > 0).length, path)
}

function transferredResources(page: Page, path: string): Promise<Array<{ name: string; transferSize: number; encodedBodySize: number }>> {
  return page.evaluate((needle) => performance.getEntriesByType('resource')
    .filter((entry) => entry.name.includes(needle) && (entry as PerformanceResourceTiming).transferSize > 0)
    .map((entry) => {
      const resource = entry as PerformanceResourceTiming
      return { name: resource.name, transferSize: resource.transferSize, encodedBodySize: resource.encodedBodySize }
    }), path)
}
