import { expect, test, type Page } from '@playwright/test'

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

const coldTtfrBudgetMs = 2_000
const warmTtfrBudgetMs = 750
const sessionByteBudget = 8_000_000

test('deterministic user journey stays within performance budgets', async ({ page, context }) => {
  const errors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') errors.push(`console: ${message.text()}`) })
  page.on('pageerror', (error) => errors.push(`page: ${error.message}`))
  page.on('requestfailed', (request) => errors.push(`request: ${request.url()} (${request.failure()?.errorText ?? 'failed'})`))

  const cdp = await context.newCDPSession(page)
  let sessionBytes = 0
  cdp.on('Network.loadingFinished', (event) => { sessionBytes += event.encodedDataLength })
  await cdp.send('Network.enable')

  await test.step('cold load renders rain without browser errors', async () => {
    await page.goto('/?perf=1')
    const cold = await waitForTtfr(page)
    expect(cold.ttfrMs).toBeLessThan(coldTtfrBudgetMs)
    await expect(page.getByTestId('perf-hud')).toBeVisible()
    await expect(page.locator('.location-label')).toHaveText('De Bilt')
    expect(errors).toEqual([])
    console.log(`cold TTFR ${cold.ttfrMs} ms`)
  })

  await test.step('logo triple-tap toggles the HUD and JSON is copyable', async () => {
    await page.locator('.brand').click({ clickCount: 3, delay: 80 })
    await expect(page.getByTestId('perf-hud')).toBeHidden()
    await page.locator('.brand').click({ clickCount: 3, delay: 80 })
    await expect(page.getByTestId('perf-hud')).toBeVisible()
    await page.getByRole('button', { name: 'Kopieer JSON' }).click()
    await expect(page.getByRole('button', { name: 'Gekopieerd' })).toBeVisible()
  })

  await test.step('warm reload uses cached chunks and meets TTFR budget', async () => {
    await page.goto('/?perf=1')
    const warm = await waitForTtfr(page)
    expect(warm.ttfrMs).toBeLessThan(warmTtfrBudgetMs)
    expect(warm.network.manifest.requests).toBe(1)
    expect(warm.network.chunks.bytes).toBe(0)
    expect(errors).toEqual([])
    console.log(`warm TTFR ${warm.ttfrMs} ms; chunk transfer ${warm.network.chunks.bytes} B`)
  })

  await test.step('full timeline scrub avoids a request storm', async () => {
    await expect(page.locator('.location-label')).toHaveText('De Bilt')
    const scrubber = page.getByRole('slider', { name: 'Tijd' })
    const frames = Number(await scrubber.getAttribute('aria-valuemax')) + 1
    const requestStart = await transferredDataRequests(page, '/data/chunks/')
    await scrubber.focus()
    await scrubber.press('Home')
    for (let index = 1; index < frames; index++) await scrubber.press('ArrowRight')
    await page.waitForTimeout(1_000)
    const chunkRequests = await transferredDataRequests(page, '/data/chunks/') - requestStart
    expect(chunkRequests).toBeLessThan(frames / 3)
    const measured = await perfSnapshot(page)
    expect(measured.scrub.samples).toBeGreaterThan(0)
    expect(errors).toEqual([])
    console.log(`scrub ${chunkRequests} chunk requests / ${frames} frames; p50 ${measured.scrub.p50Ms} ms; p95 ${measured.scrub.p95Ms} ms; fps ${measured.fps ?? 'pending'}`)
  })

  await test.step('a second location click reads cached data without requests', async () => {
    const canvas = page.locator('.map canvas').first()
    await canvas.click({ position: { x: 250, y: 240 } })
    await expect(page.locator('.location-label')).not.toContainText('laden')
    await expect(page.locator('tbody tr').first().locator('td').last()).not.toContainText('—')
    await page.waitForTimeout(250)

    const requestStart = await transferredDataRequests(page, '/data/')
    await canvas.click({ position: { x: 700, y: 300 } })
    await expect(page.locator('.location-label')).not.toContainText('laden')
    await expect(page.locator('tbody tr').first().locator('td').last()).not.toContainText('—')
    await page.waitForTimeout(250)
    const secondClickRequests = await transferredDataRequests(page, '/data/') - requestStart
    expect(secondClickRequests).toBe(0)
    expect(errors).toEqual([])
  })

  await test.step('the complete session remains below eight megabytes', async () => {
    await page.waitForTimeout(500)
    expect(sessionBytes).toBeLessThan(sessionByteBudget)
    const measured = await perfSnapshot(page)
    console.log(`session ${sessionBytes} transferred bytes; browser resource total ${measured.network.total.bytes} B; fps ${measured.fps ?? 'pending'}`)
  })
})

async function waitForTtfr(page: Page): Promise<PerfSnapshot> {
  await page.waitForFunction(() => {
    const monitor = (window as typeof window & { __motregenPerf?: { snapshot: () => PerfSnapshot } }).__motregenPerf
    return monitor?.snapshot().ttfrMs !== null
  })
  return perfSnapshot(page)
}

function perfSnapshot(page: Page): Promise<PerfSnapshot> {
  return page.evaluate(() => (window as typeof window & { __motregenPerf: { snapshot: () => PerfSnapshot } }).__motregenPerf.snapshot())
}

function transferredDataRequests(page: Page, path: string): Promise<number> {
  return page.evaluate((needle) => performance.getEntriesByType('resource')
    .filter((entry) => entry.name.includes(needle) && (entry as PerformanceResourceTiming).transferSize > 0).length, path)
}
