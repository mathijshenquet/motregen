import { expect, test, type Page } from '@playwright/test'

// U37 (experiment achter ?dev): de scrubber wisselt tussen regen en de wolkendoorsnede.
test('dev toggle switches the scrubber between rain and the cloud cross-section', async ({ page }, testInfo) => {
  await page.goto('/?dev')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  const surface = page.locator('.scrub-surface')
  await expect(surface).toHaveAttribute('data-scrubber-view', 'rain')
  await expect(page.getByTestId('cloud-section')).toHaveCount(0)
  await expect(page.locator('.rain-bar:not(.pending)').first()).toBeAttached()

  const panel = page.getByTestId('dev-panel')
  await panel.locator('.dev-group > summary', { hasText: 'Kaart' }).click()
  const select = panel.getByRole('combobox', { name: 'Scrubber' })

  for (const view of ['clouds-replace', 'clouds-strip'] as const) {
    await select.selectOption(view)
    await expect(surface).toHaveAttribute('data-scrubber-view', view)
    const section = page.getByTestId('cloud-section')
    await expect(section).toBeAttached()
    // De synthetische dag heeft een front: alle drie lagen tekenen iets binnen +8 u.
    for (const layer of ['high', 'mid', 'low']) await expect(section.locator(`[data-layer=${layer}] path`).first()).toBeAttached()
    await expect(page.locator('.rain-bar:not(.pending)').first()).toBeAttached()
    await stills(page, view, testInfo.outputPath.bind(testInfo))
  }
  await expect.poll(() => page.evaluate(() => localStorage.getItem('motregen-scrubber-view'))).toBe('clouds-strip')

  await select.selectOption('rain')
  await expect(surface).toHaveAttribute('data-scrubber-view', 'rain')
  await expect(page.getByTestId('cloud-section')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => localStorage.getItem('motregen-scrubber-view'))).toBeNull()
})

async function stills(page: Page, view: string, outputPath: (name: string) => string): Promise<void> {
  const surface = page.locator('.scrub-surface')
  await surface.focus()
  // Stilstaand beeld: pauzeren en de cursor op een vast uur.
  if (await page.locator('.cursor-pill[aria-label=Pauzeren]').count()) await page.locator('.cursor-pill').click()
  await surface.press('Home')
  for (let step = 0; step < 40; step++) await surface.press('ArrowRight')
  await surface.blur()
  for (const theme of ['light', 'dark'] as const) {
    await page.evaluate((choice) => document.documentElement.setAttribute('data-theme', choice), theme)
    await page.waitForTimeout(150)
    await page.locator('.scrubber').screenshot({ path: outputPath(`u37-${view}-${theme}.png`) })
  }
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'))
}
