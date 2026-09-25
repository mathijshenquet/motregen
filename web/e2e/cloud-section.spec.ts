import { expect, test } from '@playwright/test'
import { pausePlayback } from './playback'

// U37 → U34 (PO 2026-09-25 live): in de weermodus één band totale bewolking boven het regenhistogram;
// de drie lagen alleen in de modus Wolken (zonder regen); Gevoel/Wind tonen alleen regen.
test('weather mode shows total cloud cover above the rain; the Wolken mode shows the layers', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  const surface = page.locator('.scrub-surface')
  await expect(surface).toHaveAttribute('data-scrubber-view', 'cover')
  const section = page.getByTestId('cloud-section')
  await expect(section.locator('[data-layer=total] path').first()).toBeAttached()
  await expect(page.locator('.rain-bar:not(.pending)').first()).toBeAttached()

  // Modus Wolken: de drie lagen (de synthetische dag heeft een front), geen regen.
  const clouds = page.getByRole('button', { name: 'Wolken' })
  await clouds.click()
  await clouds.blur()
  await page.mouse.move(5, 5)
  await expect(surface).toHaveAttribute('data-scrubber-view', 'clouds')
  for (const layer of ['high', 'mid', 'low']) await expect(section.locator(`[data-layer=${layer}] path`).first()).toBeAttached()
  await expect(page.locator('.rain-bar')).toHaveCount(0)

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
  await expect(surface).toHaveAttribute('data-scrubber-view', 'rain')
  await expect(section).toHaveCount(0)

  await page.getByRole('button', { name: 'Weer' }).click()
  await page.mouse.move(5, 5)
  await expect(surface).toHaveAttribute('data-scrubber-view', 'cover')
  await expect(section).toBeAttached()
})
