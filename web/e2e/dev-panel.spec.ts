import { expect, test } from '@playwright/test'

// MIP-12: ?dev is de enige poort; het paneel is gegroepeerd en elke knop legt zichzelf uit.
test('dev panel only behind ?dev, grouped, every control explained', async ({ page }, testInfo) => {
  await page.goto('/?perf=1&histogram=wait&zon=markering&uvbalk=stip')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  await expect(page.getByTestId('dev-panel')).toHaveCount(0)
  // Losse ?-parameters doen niets meer.
  await expect(page.getByTestId('perf-hud')).toBeHidden()

  await page.goto('/?dev')
  const panel = page.getByTestId('dev-panel')
  await expect(panel).toBeVisible()
  const groups = panel.locator('.dev-group')
  await expect(groups.locator('> summary')).toHaveText(['Temperatuur', 'Wind', 'Diagnose'])
  // Alleen de eerste groep start open.
  await expect.poll(() => groups.evaluateAll((elements) => elements.map((element) => (element as HTMLDetailsElement).open))).toEqual([true, false, false])
  await expect(panel).not.toContainText('Wolkrand')

  const controls = panel.locator('.dev-control')
  const count = await controls.count()
  expect(count).toBeGreaterThan(0)
  for (let index = 0; index < count; index++) {
    const control = controls.nth(index)
    const hint = (await control.locator('.dev-hint').textContent())?.trim() ?? ''
    expect(hint.length).toBeGreaterThan(10)
    await expect(control).toHaveAttribute('title', hint)
  }

  // Wind: de vier MIP-12-knoppen, opgeslagen als v4 (alleen afwijkingen).
  await groups.locator('> summary', { hasText: 'Wind' }).click()
  const wind = groups.filter({ hasText: 'Wind' })
  await expect(wind.locator('input[type=range]')).toHaveCount(4)
  await expect(wind.locator('.dev-control label > span')).toHaveText(['Dichtheid', 'Intensiteit', 'Lijnbreedte', 'Tempo'])
  await wind.getByLabel('Intensiteit').fill('0.5')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('motregen-wind-tuning-v4'))).toBe('{"intensity":0.5}')
  await expect(page.locator('.map-shell')).toHaveAttribute('data-wind-intensity', '0.50')

  await groups.locator('> summary', { hasText: 'Diagnose' }).click()
  const perfToggle = panel.getByRole('checkbox', { name: /Perf-HUD/ })
  await perfToggle.check()
  await expect(page.getByTestId('perf-hud')).toBeVisible()
  await perfToggle.uncheck()
  await expect(page.getByTestId('perf-hud')).toBeHidden()
  await panel.getByRole('button', { name: 'Reset alle instellingen' }).click()
  await expect.poll(() => page.evaluate(() => localStorage.getItem('motregen-wind-tuning-v4'))).toBeNull()

  for (const summary of await groups.locator('> summary').all()) {
    if (!await summary.evaluate((element) => (element.parentElement as HTMLDetailsElement).open)) await summary.click()
  }
  await panel.screenshot({ path: testInfo.outputPath('dev-panel.png') })
})
