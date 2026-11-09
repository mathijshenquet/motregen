import { expect, test, type Locator, type Page } from '@playwright/test'

// U101 ronde 3: de windzakken staan alleen in kaartmodus Wind en faden in dezelfde overgang als de andere lagen
// helemaal uit (PO: ze bleven half zichtbaar na Wind → Gevoel); in Wind staat er geen regen op de kaart.
const shell = (page: Page) => page.locator('.map-shell')
const socks = (page: Page) => page.locator('.map-overlay-windsocks')
const windHeading = (page: Page) => page.locator('.wind-focus')
const temperatureHeading = (page: Page) => page.locator('.temperature-focus')

async function pin(heading: Locator, page: Page): Promise<void> {
  await heading.click()
  await heading.blur()
  await page.mouse.move(5, 5)
}

async function socksHidden(page: Page): Promise<void> {
  await expect(shell(page)).toHaveAttribute('data-wind-focus', '0.00')
  await expect(socks(page)).toHaveCSS('visibility', 'hidden')
  await expect(socks(page)).toHaveAttribute('data-socks', '0|0')
  expect(Number(await socks(page).evaluate((canvas) => (canvas as HTMLCanvasElement).style.opacity))).toBe(0)
}

test('windzakken alleen in Wind: helemaal weg na Wind → Gevoel, ook bij snel wisselen', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'één profiel volstaat')
  // Geen isobaren in de windmodus (PO 2026-11-09, U101 ronde 2): de luchtdruk wordt ook niet meer opgehaald.
  const pressureRequests: string[] = []
  page.on('request', (request) => { if (request.url().includes('pressure_hpa')) pressureRequests.push(request.url()) })
  await page.goto('/')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  await expect(page.locator('.temperature-cell').first()).toBeVisible()

  await pin(windHeading(page), page)
  await expect(shell(page)).toHaveAttribute('data-wind-focus', '1.00')
  await expect.poll(async () => Number((await socks(page).getAttribute('data-socks'))?.split('|')[0])).toBeGreaterThan(0)
  await expect(socks(page)).toHaveCSS('opacity', '1')
  await expect(shell(page)).toHaveAttribute('data-rain-opacity', '0.00')
  await expect(shell(page)).toHaveAttribute('data-isobars', '0')
  expect(pressureRequests).toEqual([])

  await pin(temperatureHeading(page), page)
  await socksHidden(page)

  for (let round = 0; round < 4; round++) {
    await windHeading(page).click()
    await page.waitForTimeout(100)
    await temperatureHeading(page).click()
    await page.waitForTimeout(80)
  }
  await page.mouse.move(5, 5)
  await socksHidden(page)

  await pin(windHeading(page), page)
  await expect(socks(page)).toHaveCSS('opacity', '1')
  await expect(socks(page)).toHaveCSS('visibility', 'visible')
})
