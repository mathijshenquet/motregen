import { expect, test } from '@playwright/test'

// U107 (PO 2026-11-09): op desktop de vlakke legendastrook van vóór U107, linksonder tegen de kaartrand, altijd
// zichtbaar en zonder knop; op de telefoon een kleine chip linksonder die de legenda als één band ernaast opent.
const modes = [
  { path: '/weer', legend: '.rain-isoline-legend' },
  { path: '/lucht', legend: '.air-legend' },
  { path: '/gevoel', legend: '.feels-legend' },
  { path: '/wind', legend: '.wind-legend' },
]

for (const { path, legend } of modes) {
  test(`desktop ${path}: legenda als vlakke strook linksonder, zonder knop`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'desktoplayout')
    await page.goto(path)
    await expect(page.locator('.map-splash.ready')).toBeAttached()
    const panel = page.locator(`#map-legend${legend}`)
    await expect(panel).toBeVisible()
    await expect(page.locator('.map-legend-button')).toBeHidden()
    const [box, shell] = [await panel.boundingBox(), await page.locator('.map-shell').boundingBox()]
    expect(Math.round(box!.x - shell!.x)).toBe(0)
    expect(Math.round(shell!.y + shell!.height - box!.y - box!.height)).toBe(0)
    // Eén regel; Wind heeft de zonewoorden eronder, zoals vóór U107.
    expect(box!.height).toBeLessThan(path === '/wind' ? 44 : 24)
  })
}

test.describe('telefoonbreedte', () => {
  test.use({ viewport: { width: 402, height: 844 } })
  for (const { path, legend } of modes) {
    test(`telefoon ${path}: kleine chip opent de legenda als één band ernaast`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'één profiel volstaat; de breedte zet de telefoonlayout')
      await page.goto(path)
      await expect(page.locator('.map-splash.ready')).toBeAttached()
      const button = page.locator('.map-legend-button')
      await expect(button).toHaveAttribute('aria-expanded', 'false')
      await expect(page.locator('#map-legend')).toHaveCount(0)
      const [target, chip] = [await button.boundingBox(), await button.locator('.legend-chip').boundingBox()]
      // Tapdoel 44 px, zichtbaar alleen een kleine chip, linksonder.
      expect(Math.round(target!.height)).toBe(44)
      expect(chip!.height).toBeLessThanOrEqual(20)
      expect(chip!.x).toBeLessThan(20)
      await button.click()
      const panel = page.locator(`#map-legend${legend}`)
      await expect(panel).toBeVisible()
      const panelBox = await panel.boundingBox()
      expect(Math.round(panelBox!.height)).toBe(44)
      expect(panelBox!.x).toBeGreaterThanOrEqual(chip!.x + chip!.width)
      expect(await panel.evaluate((element) => element.scrollHeight <= element.clientHeight + 1)).toBe(true)
      const source = await page.locator('.map-shell .source').boundingBox()
      if (source) expect(panelBox!.y + panelBox!.height).toBeLessThanOrEqual(source.y + 1)
      await button.click()
      await expect(page.locator('#map-legend')).toHaveCount(0)
    })
  }
})
