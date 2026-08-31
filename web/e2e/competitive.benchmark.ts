import { expect, test, type CDPSession, type Page } from '@playwright/test'
import { performanceProfile, type PerformanceProfile } from './profiles'

interface Milestone {
  elapsedMs: number
  requests: number
  bytes: number
}

interface BenchmarkResult {
  profile: string
  profileLabel: string
  emulation: string
  site: 'motregen' | 'buienradar'
  firstRadar: Milestone
  fullyLoaded: Milestone & { timedOut: boolean }
  lcpMs: number | null
  session: Milestone & { quietTimedOut: boolean }
  failedRequests: number
}

interface NetworkTracker {
  snapshot: () => Milestone
  waitForQuiet: (quietMs: number, timeoutMs: number) => Promise<boolean>
}

const motregenOrigin = process.env.MOTREGEN_BENCHMARK_ORIGIN
if (!motregenOrigin) throw new Error('MOTREGEN_BENCHMARK_ORIGIN is verplicht voor de externe benchmark')

const sites = [
  { id: 'motregen', origin: motregenOrigin },
  { id: 'buienradar', origin: 'https://www.buienradar.nl' },
] as const

for (const site of sites) {
  test(`${site.id}: cold open and short radar journey`, async ({ page, context }, testInfo) => {
    const profile = performanceProfile(testInfo.project.name)
    const failures: string[] = []
    page.on('requestfailed', (request) => failures.push(`${request.method()} ${request.url()}: ${request.failure()?.errorText ?? 'failed'}`))

    await installLcpObserver(page)
    const cdp = await context.newCDPSession(page)
    await applyEmulation(cdp, profile)
    const network = await observeNetwork(cdp)

    await page.goto(site.origin, { waitUntil: 'domcontentloaded', timeout: 180_000 })
    if (site.id === 'motregen') await waitForMotregenRadar(page)
    else await waitForBuienradarRadar(page)
    const firstRadar = network.snapshot()

    const quietTimeout = profile.network ? 60_000 : 30_000
    const fullyLoadedTimedOut = !(await network.waitForQuiet(2_000, quietTimeout))
    const fullyLoaded = { ...network.snapshot(), timedOut: fullyLoadedTimedOut }
    const lcpMs = await page.evaluate(() => (window as typeof window & { __benchmarkLcp?: number }).__benchmarkLcp ?? null)

    if (site.id === 'motregen') await runMotregenJourney(page)
    else await runBuienradarJourney(page)
    const quietTimedOut = !(await network.waitForQuiet(2_000, quietTimeout))
    const session = { ...network.snapshot(), quietTimedOut }

    const result: BenchmarkResult = {
      profile: profile.id,
      profileLabel: profile.label,
      emulation: profile.network?.label ?? 'Geen netwerk- of CPU-emulatie',
      site: site.id,
      firstRadar,
      fullyLoaded,
      lcpMs,
      session,
      failedRequests: failures.length,
    }
    await testInfo.attach('benchmark-result', { body: JSON.stringify(result), contentType: 'application/json' })
    console.log(`${profile.label} / ${site.id}: radar ${format(firstRadar)}, idle ${format(fullyLoaded)}, LCP ${lcpMs?.toFixed(0) ?? '—'} ms, session ${format(session)}`)
  })
}

async function installLcpObserver(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const target = window as typeof window & { __benchmarkLcp?: number }
    target.__benchmarkLcp = 0
    new PerformanceObserver((list) => {
      const last = list.getEntries().at(-1)
      if (last) target.__benchmarkLcp = last.startTime
    }).observe({ type: 'largest-contentful-paint', buffered: true })
  })
}

async function applyEmulation(cdp: CDPSession, profile: PerformanceProfile): Promise<void> {
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpuThrottleRate })
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

async function observeNetwork(cdp: CDPSession): Promise<NetworkTracker> {
  const startedAt = performance.now()
  const inflight = new Set<string>()
  let requests = 0
  let bytes = 0
  let lastActivityAt = startedAt

  cdp.on('Network.requestWillBeSent', (event) => {
    requests += 1
    inflight.add(event.requestId)
    lastActivityAt = performance.now()
  })
  cdp.on('Network.loadingFinished', (event) => {
    bytes += event.encodedDataLength
    inflight.delete(event.requestId)
    lastActivityAt = performance.now()
  })
  cdp.on('Network.loadingFailed', (event) => {
    inflight.delete(event.requestId)
    lastActivityAt = performance.now()
  })

  return {
    snapshot: () => ({ elapsedMs: performance.now() - startedAt, requests, bytes }),
    async waitForQuiet(quietMs, timeoutMs) {
      const deadline = performance.now() + timeoutMs
      while (performance.now() < deadline) {
        if (inflight.size <= 2 && performance.now() - lastActivityAt >= quietMs) return true
        await new Promise((resolve) => setTimeout(resolve, 100))
      }
      return false
    },
  }
}

async function waitForMotregenRadar(page: Page): Promise<void> {
  await page.waitForFunction(() => {
    const monitor = (window as typeof window & { __motregenPerf?: { snapshot: () => { ttfrMs: number | null } } }).__motregenPerf
    return monitor?.snapshot().ttfrMs !== null
  }, undefined, { timeout: 180_000 })
  await expect(page.locator('.map canvas').first()).toBeVisible({ timeout: 30_000 })
  await afterPaint(page)
}

async function waitForBuienradarRadar(page: Page): Promise<void> {
  await page.getByText('Met persoonlijke advertenties', { exact: true }).click({ timeout: 60_000 })
  await page.getByRole('button', { name: 'Doorgaan' }).click()
  const accept = page.locator('#onetrust-accept-btn-handler')
  if (await accept.isVisible({ timeout: 15_000 }).catch(() => false)) await accept.click()
  await page.waitForFunction(() => {
    const image = [...document.querySelectorAll<HTMLImageElement>('img.leaflet-image-layer')]
      .find((candidate) => candidate.src.includes('/rain/'))
    if (!image?.complete || image.naturalWidth === 0) return false
    const rect = image.getBoundingClientRect()
    const style = getComputedStyle(image)
    return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0
  }, undefined, { timeout: 180_000 })
  await expect(page.locator('.payok')).toBeHidden({ timeout: 30_000 })
  await afterPaint(page)
}

async function runMotregenJourney(page: Page): Promise<void> {
  const scrubber = page.getByRole('slider', { name: 'Tijd' })
  await scrubber.focus()
  for (let index = 0; index < 5; index++) await scrubber.press('ArrowRight')
  await page.getByRole('button', { name: 'Afspelen' }).click()
  await page.waitForTimeout(2_000)
  await page.getByRole('button', { name: 'Pauzeren' }).click()
}

async function runBuienradarJourney(page: Page): Promise<void> {
  await dismissBuienradarPromotion(page)
  await page.getByRole('button', { name: '+3u', exact: true }).click({ timeout: 30_000 })
  await page.getByRole('button', { name: '-1u', exact: true }).click({ timeout: 30_000 })
  await page.waitForTimeout(1_000)
  await dismissBuienradarPromotion(page)
  await page.getByRole('button', { name: '-1u', exact: true }).click({ timeout: 30_000 })
  await page.getByRole('button', { name: '+3u', exact: true }).click({ timeout: 30_000 })
  await page.waitForTimeout(2_000)
}

async function dismissBuienradarPromotion(page: Page): Promise<void> {
  const survey = page.locator('iframe[title="Usabilla Feedback Form"]')
  if (await survey.isVisible().catch(() => false)) {
    await page.frameLocator('iframe[title="Usabilla Feedback Form"]').locator('#close').click({ timeout: 15_000 })
  }
}

async function afterPaint(page: Page): Promise<void> {
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
}

function format(value: Milestone): string {
  return `${value.elapsedMs.toFixed(0)} ms / ${value.requests} req / ${(value.bytes / 1_000_000).toFixed(2)} MB`
}
