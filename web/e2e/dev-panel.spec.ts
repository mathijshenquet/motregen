import { expect, test } from '@playwright/test'

// MIP-12: ?dev is de enige poort; het paneel is gegroepeerd en elke knop legt zichzelf uit.
test('dev panel only behind ?dev, grouped, every control explained', async ({ page }, testInfo) => {
  // `?perf` staat hier bewust niet meer tussen: sinds MIP-16 (U43) is dat de profielmodus en toont het de HUD.
  await page.goto('/?histogram=wait&zon=markering&uvbalk=stip')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  await expect(page.getByTestId('dev-panel')).toHaveCount(0)
  // De oude losse ?-parameters doen niets meer.
  await expect(page.getByTestId('perf-hud')).toBeHidden()

  const removedKeys = ['dev-regenpalet', 'dev-regenmenging', 'dev-regencontrast', 'dev-regen-wind-lucht', 'dev-regenveld-radar', 'dev-regenveld-harmonie', 'dev-regenveld-meet', 'dev-eerste-regen', 'wind-tuning-v4', 'wind-tuning-v3']
  await page.evaluate((keys) => {
    for (const key of keys) localStorage.setItem(`motregen-${key}`, 'oude proefwaarde')
  }, removedKeys)
  await page.goto('/?dev')
  const panel = page.getByTestId('dev-panel')
  await expect(panel).toBeVisible()
  const groups = panel.locator('.dev-group')
  await expect(groups.locator('> summary')).toHaveText(['Wolkenkaart', 'Regen', 'Lucht nu', 'Meting', 'Diagnose'])
  // Alleen de eerste groep start open.
  await expect.poll(() => groups.evaluateAll((elements) => elements.map((element) => (element as HTMLDetailsElement).open))).toEqual([true, false, false, false, false])
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

  // Sinds de PO-keuzes van 2026-10-08 geen knoppen meer: onder Expressief tinten klokpil, zoekbalk en
  // merkdruppel mee met het cursoruur en volgt de basiskaart de kaarttijd.
  await expect(page.locator('.map-shell')).toHaveClass(/sky-(day|night)/)
  await expect(page.locator('.map')).toHaveAttribute('data-map-night', /^[01]\.\d\d$/)
  await expect(page.locator('.map-shell')).toHaveAttribute('data-wind-intensity', '0.50')

  await groups.locator('> summary', { hasText: /^Regen$/ }).click()
  const rainGroup = groups.filter({ has: page.locator('summary', { hasText: /^Regen$/ }) })
  await expect(rainGroup.locator('.dev-control label > span')).toHaveText(['Regenisolijnen'])
  const isolines = rainGroup.getByRole('combobox')
  await expect(isolines).toHaveValue('kleurgrenzen')
  await isolines.selectOption('dicht')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('motregen-dev-regenisolijnen'))).toBe('dicht')
  await page.reload()
  await groups.locator('> summary', { hasText: /^Regen$/ }).click()
  await expect(rainGroup.getByRole('combobox')).toHaveValue('dicht')

  await groups.locator('> summary', { hasText: 'Diagnose' }).click()
  const perfToggle = panel.getByRole('checkbox', { name: /Perf-HUD/ })
  await perfToggle.check()
  await expect(page.getByTestId('perf-hud')).toBeVisible()
  await perfToggle.uncheck()
  await expect(page.getByTestId('perf-hud')).toBeHidden()
  await panel.getByRole('button', { name: 'Reset alle instellingen' }).click()
  await expect.poll(() => page.evaluate((keys) => keys.map((key) => localStorage.getItem(`motregen-${key}`)), removedKeys)).toEqual(removedKeys.map(() => null))
  await expect(rainGroup.getByRole('combobox')).toHaveValue('kleurgrenzen')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('motregen-dev-regenisolijnen'))).toBeNull()

  for (const summary of await groups.locator('> summary').all()) {
    if (!await summary.evaluate((element) => (element.parentElement as HTMLDetailsElement).open)) await summary.click()
  }
  await panel.screenshot({ path: testInfo.outputPath('dev-panel.png') })
})

test.describe('telefoon', () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

  // U62 (PO 2026-10-08): op een telefoon of smal scherm staat de wind op de achtergrond een stap sterker.
  test('the ambient wind is one step stronger on a phone, without a dev control', async ({ page }) => {
    await page.goto('/?dev')
    await expect(page.locator('.map-splash.ready')).toBeAttached()
    await expect(page.locator('.map-shell')).toHaveAttribute('data-wind-intensity', '0.63')
    await expect(page.getByTestId('dev-panel').getByLabel('Windstreepjes')).toHaveCount(0)
  })
})
