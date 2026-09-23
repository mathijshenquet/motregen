import { expect, test, type Page } from '@playwright/test'

const home = { id: 'home', name: 'Thuis', sourceLabel: 'Groningen', lng: 6.5665, lat: 53.2194 }
const work = { id: 'work', name: 'Werk', sourceLabel: 'Maastricht', lng: 5.6909, lat: 50.8514 }

test('start location remembers saved places and the last map view', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop', 'gedrag, geen performance: één profiel volstaat')
  const scrubber = page.locator('.scrubber')

  await page.goto('/')
  await expect(scrubber).toHaveAttribute('aria-label', /voor De Bilt$/)

  await setStorage(page, {
    'motregen-saved-places': JSON.stringify([home, work]),
    'motregen-map-view': JSON.stringify({ lng: 6.57, lat: 53.21, zoom: 7 }),
  })
  await page.reload()
  await expect(scrubber).toHaveAttribute('aria-label', /voor Groningen$/)

  const viewBefore = await page.evaluate(() => localStorage.getItem('motregen-map-view'))
  await page.getByRole('textbox', { name: 'Zoek plaats' }).focus()
  await page.getByRole('option', { name: /Werk/ }).click()
  await expect(scrubber).toHaveAttribute('aria-label', /voor Werk$/)
  await page.waitForTimeout(1_000)
  expect(await page.evaluate(() => localStorage.getItem('motregen-map-view'))).toBe(viewBefore)

  await page.reload()
  await expect(scrubber).toHaveAttribute('aria-label', /voor Werk$/)

  await setStorage(page, { 'motregen-last-saved-place': 'removed', 'motregen-map-view': '{' })
  await page.reload()
  await expect(scrubber).toHaveAttribute('aria-label', /voor De Bilt$/)
})

async function setStorage(page: Page, values: Record<string, string>): Promise<void> {
  await page.evaluate((entries) => {
    for (const [key, value] of Object.entries(entries)) localStorage.setItem(key, value)
  }, values)
}
