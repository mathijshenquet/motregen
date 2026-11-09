import { expect, test } from '@playwright/test'

// U107 (PO 2026-11-09): één legenda-knop op dezelfde plek in elke modus; hij opent en sluit de legenda van die
// modus. Desktop begint open.
const modes = [
  { path: '/weer', legend: '.rain-isoline-legend' },
  { path: '/lucht', legend: '.air-legend' },
  { path: '/gevoel', legend: '.feels-legend' },
  { path: '/wind', legend: '.wind-legend' },
]

for (const { path, legend } of modes) {
  test(`legenda-knop in ${path} opent en sluit de legenda van de modus`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktop begint open; de telefoon heeft dezelfde knop')
    await page.goto(path)
    await expect(page.locator('.map-splash.ready')).toBeAttached()
    const button = page.locator('.map-legend-button')
    await expect(button).toBeVisible()
    await expect(button).toHaveAttribute('aria-expanded', 'true')
    await expect(page.locator(`#map-legend${legend}`)).toBeVisible()
    const box = await button.boundingBox()
    const shell = await page.locator('.map-shell').boundingBox()
    // Rechtsonder in de kaart, overal op dezelfde plek.
    expect(Math.round(shell!.x + shell!.width - box!.x - box!.width)).toBe(12)
    expect(Math.round(box!.width)).toBe(44)
    await button.click()
    await expect(button).toHaveAttribute('aria-expanded', 'false')
    await expect(page.locator('#map-legend')).toHaveCount(0)
    await button.click()
    await expect(page.locator(`#map-legend${legend}`)).toBeVisible()
  })
}

test.describe('telefoonbreedte', () => {
  test.use({ viewport: { width: 402, height: 844 } })
  for (const { path, legend } of modes) {
    test(`legenda in ${path} begint dicht en opent als één band zo hoog als de knop`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'één profiel volstaat; de breedte zet de telefoonlayout')
      await page.goto(path)
      await expect(page.locator('.map-splash.ready')).toBeAttached()
      const button = page.locator('.map-legend-button')
      await expect(button).toHaveAttribute('aria-expanded', 'false')
      await expect(page.locator('#map-legend')).toHaveCount(0)
      await button.click()
      const panel = page.locator(`#map-legend${legend}`)
      await expect(panel).toBeVisible()
      const [panelBox, buttonBox] = [await panel.boundingBox(), await button.boundingBox()]
      expect(Math.round(panelBox!.height)).toBe(Math.round(buttonBox!.height))
      expect(Math.abs(panelBox!.y - buttonBox!.y)).toBeLessThanOrEqual(1)
      // Eén rij: niets loopt onder de band uit.
      expect(await panel.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(true)
    })
  }
})
