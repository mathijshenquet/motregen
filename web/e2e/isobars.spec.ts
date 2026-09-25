import { expect, test, type Page } from '@playwright/test'

const shell = (page: Page) => page.locator('.map-shell')
const temperatureHeading = (page: Page) => page.locator('.temperature-focus')
const windHeading = (page: Page) => page.locator('.wind-focus')

async function ready(page: Page, pressureRequests: string[]): Promise<void> {
  page.on('request', (request) => { if (request.url().includes('pressure_hpa')) pressureRequests.push(request.url()) })
  await page.goto('/')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  await expect(page.locator('.temperature-cell').first()).toBeVisible()
  await expect(shell(page)).toHaveAttribute('data-wind-focus', '0.00')
}

async function isobarLevels(page: Page): Promise<number[]> {
  return (await page.locator('.isobar-label').allTextContents()).map(Number)
}

test('wind focus draws labelled isobars under the particles; temperature focus draws none', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'muishover en lagenvolgorde: één profiel volstaat')
  await page.emulateMedia({ colorScheme: 'light', reducedMotion: 'reduce' })
  const pressureRequests: string[] = []
  await ready(page, pressureRequests)
  // Luchtdruk laadt pas bij windfocus: ook geen header in de cold start.
  await page.waitForTimeout(1_000)
  expect(pressureRequests).toEqual([])

  await windHeading(page).hover()
  await expect(shell(page)).toHaveAttribute('data-wind-focus', '1.00')
  await expect.poll(async () => Number(await shell(page).getAttribute('data-isobars'))).toBeGreaterThan(0)
  await expect.poll(() => page.locator('.isobar-label').count()).toBeGreaterThan(0)
  expect(pressureRequests.length).toBeGreaterThan(0)
  for (const level of await isobarLevels(page)) {
    // "1012": veelvoud van 4 hPa, zonder eenheid.
    expect(level % 4).toBe(0)
    expect(level).toBeGreaterThan(960)
    expect(level).toBeLessThan(1_060)
  }
  await expect(shell(page)).toHaveAttribute('data-isolines', '0')
  // Isobaren liggen onder de windparticles: hun canvas komt eerder in de DOM.
  expect(await page.evaluate(() => {
    const isobars = document.querySelector('.map-overlay-motregen-isobars'), wind = document.querySelector('.map-overlay-motregen-wind')
    return !!isobars && !!wind && !!(isobars.compareDocumentPosition(wind) & Node.DOCUMENT_POSITION_FOLLOWING)
  })).toBe(true)
  // Geen desaturatie in windmodus.
  expect(await page.locator('.maplibregl-canvas').evaluate((canvas) => getComputedStyle(canvas).filter)).toBe('none')
  await page.screenshot({ path: testInfo.outputPath('isobars-light.png') })

  await temperatureHeading(page).hover()
  await expect(shell(page)).toHaveAttribute('data-focus', '1.00')
  await expect(shell(page)).toHaveAttribute('data-wind-focus', '0.00')
  await expect(shell(page)).toHaveAttribute('data-isobars', '0')
  await expect(page.locator('.isobar-label')).toHaveCount(0)
  await expect.poll(() => page.locator('.isoline-label').count()).toBeGreaterThan(0)

  await page.mouse.move(5, 5)
  await expect(shell(page)).toHaveAttribute('data-focus', '0.00')
  await expect(page.locator('.isoline-label')).toHaveCount(0)
})

test('pinned wind focus shows isobars in the dark theme', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'één profiel volstaat voor de still')
  await page.emulateMedia({ colorScheme: 'dark', reducedMotion: 'reduce' })
  // De app start licht tenzij de gebruiker een thema koos.
  await page.addInitScript(() => localStorage.setItem('motregen-theme', 'dark'))
  await ready(page, [])
  await windHeading(page).click()
  await windHeading(page).blur()
  await page.mouse.move(5, 5)
  await expect(windHeading(page)).toHaveAttribute('aria-pressed', 'true')
  await expect.poll(() => page.locator('.isobar-label').count()).toBeGreaterThan(0)
  expect(await page.locator('.isobar-label').first().evaluate((label) => getComputedStyle(label).color)).toBe('rgb(179, 195, 201)')
  await page.screenshot({ path: testInfo.outputPath('isobars-dark.png') })
})

function pressureTransfer(page: Page): Promise<{ requests: number; bytes: number }> {
  return page.evaluate(() => {
    const entries = performance.getEntriesByType('resource').filter((entry) => entry.name.includes('pressure_hpa')) as PerformanceResourceTiming[]
    return { requests: entries.filter((entry) => entry.transferSize > 0).length, bytes: entries.reduce((sum, entry) => sum + entry.transferSize, 0) }
  })
}

test('isobars cost bytes on the first wind focus only: a warm reload fetches 0 B', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'cachegedrag, één profiel volstaat')
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await ready(page, [])
  const pin = async () => {
    await windHeading(page).click()
    await windHeading(page).blur()
    await page.mouse.move(5, 5)
    await expect.poll(() => page.locator('.isobar-label').count()).toBeGreaterThan(0)
    await page.waitForTimeout(1_000)
  }
  await pin()
  const cold = await pressureTransfer(page)
  expect(cold.bytes).toBeGreaterThan(0)
  await page.reload()
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  await pin()
  const warm = await pressureTransfer(page)
  console.log(`isobars: cold ${cold.requests} requests / ${cold.bytes} B; warm ${warm.requests} requests / ${warm.bytes} B`)
  expect(warm.bytes).toBe(0)
})
