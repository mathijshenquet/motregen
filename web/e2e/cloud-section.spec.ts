import { expect, test } from '@playwright/test'
import { pausePlayback } from './playback'

// U37 → U34 (PO 2026-09-25 live): altijd de drie wolkenlagen met het regenhistogram eroverheen; de
// wolkenmodus (kop Weer) voegt de laagwaarden bij de cursor en de sluier op de kaart toe; Gevoel en
// Wind hebben een eigen grafiek.
test('the scrubber always shows the cloud layers under the rain; the cloud mode adds the map veil', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  const surface = page.locator('.scrub-surface')
  await expect(surface).toHaveAttribute('data-scrubber-view', 'rain')
  const section = page.getByTestId('cloud-section')
  // De synthetische dag heeft een front: alle drie lagen tekenen iets.
  for (const layer of ['high', 'mid', 'low']) await expect(section.locator(`[data-layer=${layer}] path`).first()).toBeAttached()
  await expect(page.locator('.rain-bar:not(.pending)').first()).toBeAttached()

  // Wolkenmodus via de kop Weer: de regen blijft, de sluier komt op de kaart.
  const clouds = page.getByRole('button', { name: 'Weer' })
  await clouds.click()
  await clouds.blur()
  await page.mouse.move(5, 5)
  await expect(surface).toHaveAttribute('data-scrubber-view', 'clouds')
  await expect(page.locator('.rain-bar:not(.pending)').first()).toBeAttached()
  await expect(page.locator('.map-overlay-motregen-cloud-veil')).toBeAttached()

  // Stilstaand beeld: pauzeren en de cursor op een vast punt.
  await surface.focus()
  await pausePlayback(page)
  await surface.press('Home')
  for (let step = 0; step < 40; step++) await surface.press('ArrowRight')
  await surface.blur()
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((choice) => document.documentElement.setAttribute('data-theme', choice), theme)
    await page.waitForTimeout(150)
    await page.locator('.scrubber').screenshot({ path: testInfo.outputPath(`u37-clouds-${theme}.png`) })
  }
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))

  const temperature = page.locator('.temperature-focus')
  await temperature.click()
  await temperature.blur()
  await page.mouse.move(5, 5)
  await expect(temperature).toHaveAttribute('aria-pressed', 'true')
  // Gevoel heeft sinds U34 een eigen temperatuurgrafiek.
  await expect(surface).toHaveAttribute('data-scrubber-view', 'temperature')

  // Nog eens op de gepinde kop: terug naar de standaard (bewolkingsband boven de regen).
  await temperature.click()
  await page.mouse.move(5, 5)
  await expect(surface).toHaveAttribute('data-scrubber-view', 'rain')
  await expect(section).toBeAttached()
})
