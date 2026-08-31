import { expect, test, type CDPSession, type Locator, type Page } from '@playwright/test'
import { performanceProfile, type PerformanceProfile } from './profiles'

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
  scrubP50Ms: number | null
  scrubP95Ms: number | null
  scrubTransfers: number
  scrubFrames: number
  secondClickRequests: number
  sessionBytes: number
  resourceBytes: number
  sessionDownloadMs: number
  fps: number | null
  errors: string[]
}

const sessionByteBudget = 8_000_000
const live = process.env.MOTREGEN_PERF_MODE === 'live'

test('user journey measures performance and cache behaviour', async ({ page, context }, testInfo) => {
  const profile = performanceProfile(testInfo.project.name)
  testInfo.setTimeout(live ? 240_000 : 120_000)

  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`))
  page.on('requestfailed', (request) => errors.push(`request: ${request.url()} (${request.failure()?.errorText ?? 'failed'})`))

  const cdp = await context.newCDPSession(page)
  const network = await observeNetwork(cdp)
  await applyEmulation(cdp, profile)

  let cold: PerfSnapshot | null = null
  let warm: PerfSnapshot | null = null
  let scrubTransfers = 0
  let scrubFrames = 0
  let secondClickRequests = 0

  await test.step('cold load renders rain without browser errors', async () => {
    network.startJourney()
    await page.goto('/?perf=1')
    cold = await waitForTtfr(page)
    if (!live) expect(cold.ttfrMs).toBeLessThan(profile.coldTtfrBudgetMs)
    await expect(page.getByTestId('perf-hud')).toBeVisible()
    await expect(page.locator('.scrubber')).toHaveAttribute('aria-label', /voor De Bilt$/, { timeout: live ? 180_000 : 10_000 })
    expect(errors).toEqual([])
    console.log(`${profile.label}: cold TTFR ${cold.ttfrMs} ms`)
  })

  await test.step('logo triple-tap toggles the HUD and JSON is copyable', async () => {
    await page.locator('.brand').click({ clickCount: 3, delay: 20 })
    await expect(page.getByTestId('perf-hud')).toBeHidden()
    await page.locator('.brand').click({ clickCount: 3, delay: 20 })
    await expect(page.getByTestId('perf-hud')).toBeVisible()
    await page.getByRole('button', { name: 'Kopieer JSON' }).click()
    await expect(page.getByRole('button', { name: 'Gekopieerd' })).toBeVisible()
    await page.getByRole('slider', { name: 'Tijd' }).hover()
    await page.waitForLoadState('networkidle')
  })

  await test.step('warm reload measures cache reuse', async () => {
    await page.goto('/?perf=1')
    await waitForTtfr(page)
    const warmScrubber = page.getByRole('slider', { name: 'Tijd' })
    await warmScrubber.hover()
    await expect(page.locator('.scrubber')).toHaveAttribute('aria-label', /voor De Bilt$/)
    await page.waitForLoadState('networkidle')
    warm = await perfSnapshot(page)
    const warmChunkResources = await transferredResources(page, '/data/chunks/')
    if (warmChunkResources.length) console.log(`${profile.label}: warm chunk resources ${JSON.stringify(warmChunkResources)}`)
    if (!live) {
      expect(warm.ttfrMs).toBeLessThan(profile.warmTtfrBudgetMs)
      expect(warm.network.manifest.requests).toBe(1)
      expect(warm.network.chunks.bytes).toBeLessThanOrEqual(profile.warmChunkByteBudget)
    }
    expect(errors).toEqual([])
    console.log(`${profile.label}: warm TTFR ${warm.ttfrMs} ms; chunk transfer ${warm.network.chunks.bytes} B`)
  })

  await test.step('full timeline scrub measures request coalescing', async () => {
    await expect(page.locator('.scrubber')).toHaveAttribute('aria-label', /voor De Bilt$/)
    await page.getByRole('button', { name: 'Alles' }).click()
    const scrubber = page.getByRole('slider', { name: 'Tijd' })
    scrubFrames = Number(await scrubber.getAttribute('aria-valuemax')) + 1
    const requestStart = await transferredDataRequests(page, '/data/chunks/')
    await scrubber.focus()
    await scrubber.press('Home')
    for (let index = 1; index < scrubFrames; index++) await scrubber.press('ArrowRight')
    await page.waitForTimeout(1_000)
    scrubTransfers = await transferredDataRequests(page, '/data/chunks/') - requestStart
    if (!live) expect(scrubTransfers).toBeLessThan(scrubFrames / 3)
    const measured = await perfSnapshot(page)
    expect(measured.scrub.samples).toBeGreaterThan(0)
    expect(errors).toEqual([])
    console.log(`${profile.label}: scrub ${scrubTransfers} chunk requests / ${scrubFrames} frames; p50 ${measured.scrub.p50Ms} ms; p95 ${measured.scrub.p95Ms} ms; fps ${measured.fps ?? 'pending'}`)
  })

  await test.step('two location clicks measure session-cache reuse', async () => {
    const canvas = page.locator('.map canvas').first()
    await clickCanvasAtRatio(canvas, 0.25, 0.4)
    await expect(page.locator('.scrubber')).not.toHaveAttribute('aria-label', /laden/)
    await expect(page.locator('tr.current-hour td').last()).not.toContainText('—')
    await page.waitForTimeout(250)

    const requestStart = await transferredDataRequests(page, '/data/')
    await clickCanvasAtRatio(canvas, 0.75, 0.5)
    await expect(page.locator('.scrubber')).not.toHaveAttribute('aria-label', /laden/)
    await expect(page.locator('tr.current-hour td').last()).not.toContainText('—')
    await page.waitForTimeout(250)
    secondClickRequests = await transferredDataRequests(page, '/data/') - requestStart
    if (!live) expect(secondClickRequests).toBe(0)
    expect(errors).toEqual([])
  })

  await test.step('the complete session reports transfer volume and duration', async () => {
    await page.waitForTimeout(500)
    if (!live) expect(network.bytes()).toBeLessThan(sessionByteBudget)
    const measured = await perfSnapshot(page)
    const result: JourneyResult = {
      profile: profile.id,
      label: profile.label,
      emulation: profile.network?.label ?? 'Geen netwerkemulatie',
      cpuThrottleRate: profile.cpuThrottleRate,
      coldTtfrMs: cold?.ttfrMs ?? null,
      warmTtfrMs: warm?.ttfrMs ?? null,
      scrubP50Ms: measured.scrub.p50Ms,
      scrubP95Ms: measured.scrub.p95Ms,
      scrubTransfers,
      scrubFrames,
      secondClickRequests,
      sessionBytes: network.bytes(),
      resourceBytes: measured.network.total.bytes,
      sessionDownloadMs: network.downloadDurationMs(),
      fps: measured.fps,
      errors,
    }
    await testInfo.attach('perf-result', { body: JSON.stringify(result), contentType: 'application/json' })
    console.log(`${profile.label}: session ${result.sessionBytes} transferred bytes in ${result.sessionDownloadMs.toFixed(1)} ms; browser resource total ${result.resourceBytes} B; second click ${secondClickRequests} requests`)
  })
})

async function applyEmulation(cdp: CDPSession, profile: PerformanceProfile): Promise<void> {
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuThrottleRate })
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: false })
  if (!profile.network) return
  const conditions = {
    offline: false,
    latency: profile.network.latency,
    downloadThroughput: profile.network.downloadThroughput,
    uploadThroughput: profile.network.uploadThroughput,
    connectionType: profile.network.connectionType,
  } as const
  await cdp.send('Network.overrideNetworkState', conditions)
  await cdp.send('Network.emulateNetworkConditionsByRule', {
    matchedNetworkConditions: [{ urlPattern: '', ...conditions }],
  })
}

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

async function clickCanvasAtRatio(canvas: Locator, xRatio: number, yRatio: number): Promise<void> {
  const box = await canvas.boundingBox()
  if (!box) throw new Error('Kaartcanvas heeft geen zichtbare bounding box')
  await canvas.click({ position: { x: box.width * xRatio, y: box.height * yRatio } })
}

async function waitForTtfr(page: Page): Promise<PerfSnapshot> {
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
