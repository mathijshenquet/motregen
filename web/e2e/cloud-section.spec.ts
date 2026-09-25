import { expect, test } from '@playwright/test'
import { pausePlayback } from './playback'

// U37 (PO-keuze variant A): in de weermodus vervangt de wolkendoorsnede het regenhistogram;
// een gepinde modus toont de regen weer.
test('weather mode shows the cloud cross-section; a pinned mode shows the rain histogram', async ({ page }, testInfo) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await page.goto('/')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  const surface = page.locator('.scrub-surface')
  await expect(surface).toHaveAttribute('data-scrubber-view', 'clouds')
  const section = page.getByTestId('cloud-section')
  // De synthetische dag heeft een front: alle drie lagen tekenen iets binnen +8 u.
  for (const layer of ['high', 'mid', 'low']) await expect(section.locator(`[data-layer=${layer}] path`).first()).toBeAttached()
  await expect(page.locator('.rain-bar:not(.pending)').first()).toBeAttached()

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
  await expect(surface).toHaveAttribute('data-scrubber-view', 'clouds')
  await expect(section).toBeAttached()
})
