import { expect, test } from '@playwright/test'

// U107 (PO 2026-11-09): op desktop de vlakke legendastrook van vóór U107, linksonder tegen de kaartrand, altijd
// zichtbaar en zonder knop; op de telefoon een kleine chip linksonder die de legenda als één band ernaast opent.
const modes = [
  { path: '/weer', legend: '.rain-isoline-legend' },
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

// Lucht codeert niets dat uitleg nodig heeft (PO 2026-11-09): geen legenda en geen chip, desktop en telefoon.
for (const viewport of [{ width: 1440, height: 900 }, { width: 402, height: 844 }]) {
  test(`Lucht ${viewport.width} px: geen legenda en geen chip`, async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'één profiel volstaat; de breedte zet de layout')
    await page.setViewportSize(viewport)
    await page.goto('/lucht')
    await expect(page.locator('.map-splash.ready')).toBeAttached()
    await expect(page.locator('.map-legend')).toHaveCount(0)
    await expect(page.locator('.map-legend-button')).toHaveCount(0)
  })
}

test.describe('telefoonbreedte', () => {
  test.use({ viewport: { width: 402, height: 844 } })
  for (const { path, legend } of modes) {
    test(`telefoon ${path}: chipje tegen de kaartrand, open vervangt het op dezelfde plek, tik sluit`, async ({ page }, testInfo) => {
      test.skip(testInfo.project.name !== 'desktop', 'één profiel volstaat; de breedte zet de telefoonlayout')
      await page.goto(path)
      await expect(page.locator('.map-splash.ready')).toBeAttached()
      const shell = (await page.locator('.map-shell').boundingBox())!
      const button = page.locator('.map-legend-button')
      await expect(page.locator('#map-legend')).toHaveCount(0)
      const [target, chip] = [(await button.boundingBox())!, (await button.locator('.legend-chip').boundingBox())!]
      // Tapdoel 44 px, zichtbaar een klein chipje vlak in de hoek linksonder.
      expect(Math.round(target.height)).toBe(44)
      expect(chip.height).toBeLessThanOrEqual(20)
      expect(Math.round(chip.x - shell.x)).toBe(0)
      expect(Math.round(shell.y + shell.height - chip.y - chip.height)).toBe(0)
      await button.click()
      const panel = page.locator(`#map-legend${legend}`)
      await expect(panel).toBeVisible()
      await expect(button).toHaveCount(0)
      const box = (await panel.boundingBox())!
      expect(Math.round(box.x - shell.x)).toBe(0)
      expect(Math.round(shell.y + shell.height - box.y - box.height)).toBe(0)
      expect(box.width).toBeLessThanOrEqual(shell.width)
      // Tik op de strook sluit; tik ernaast (op de kaart) ook.
      await panel.click()
      await expect(page.locator('#map-legend')).toHaveCount(0)
      await page.locator('.map-legend-button').click()
      await expect(panel).toBeVisible()
      await page.mouse.click(shell.x + shell.width / 2, shell.y + shell.height / 3)
      await expect(page.locator('#map-legend')).toHaveCount(0)
      await expect(page.locator('.map-legend-button')).toBeVisible()
    })
  }

  test('telefoon: een moduswissel houdt de legenda open', async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== 'desktop', 'één profiel volstaat')
    await page.goto('/weer')
    await expect(page.locator('.map-splash.ready')).toBeAttached()
    await page.locator('.map-legend-button').click()
    await expect(page.locator('#map-legend.rain-isoline-legend')).toBeVisible()
    await page.locator('.temperature-focus').first().click()
    await expect(page.locator('#map-legend.feels-legend')).toBeVisible()
  })
})
