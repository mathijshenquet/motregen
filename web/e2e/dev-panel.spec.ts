import { expect, test } from '@playwright/test'

// MIP-12: ?dev is de enige poort; het paneel is gegroepeerd en elke knop legt zichzelf uit.
test('dev panel only behind ?dev, grouped, every control explained', async ({ page }, testInfo) => {
  // `?perf` staat hier bewust niet meer tussen: sinds MIP-16 (U43) is dat de profielmodus en toont het de HUD.
  await page.goto('/?histogram=wait&zon=markering&uvbalk=stip')
  await expect(page.locator('.map-splash.ready')).toBeAttached()
  await expect(page.getByTestId('dev-panel')).toHaveCount(0)
  // De oude losse ?-parameters doen niets meer.
  await expect(page.getByTestId('perf-hud')).toBeHidden()

  await page.goto('/?dev')
  const panel = page.getByTestId('dev-panel')
  await expect(panel).toBeVisible()
  const groups = panel.locator('.dev-group')
  await expect(groups.locator('> summary')).toHaveText(['Temperatuur', 'Wind', 'Laden', 'Chrome', 'Lucht nu', 'Diagnose'])
  // Alleen de eerste groep start open.
  await expect.poll(() => groups.evaluateAll((elements) => elements.map((element) => (element as HTMLDetailsElement).open))).toEqual([true, false, false, false, false, false])
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
  // Op de groepstitel, niet op de inhoud.
  const wind = groups.filter({ has: page.locator('summary', { hasText: /^Wind$/ }) })
  await expect(wind.locator('input[type=range]')).toHaveCount(4)
  await expect(wind.locator('.dev-control label > span')).toHaveText(['Dichtheid', 'Intensiteit', 'Lijnbreedte', 'Tempo'])
  // Alleen afwijkingen worden opgeslagen; 0,5 is sinds de live windtuning (U34) zelf de default.
  await wind.getByLabel('Intensiteit').fill('0.8')
  await expect.poll(() => page.evaluate(() => localStorage.getItem('motregen-wind-tuning-v4'))).toBe('{"intensity":0.8}')
  await expect(page.locator('.map-shell')).toHaveAttribute('data-wind-intensity', '0.80')

  // Sinds de PO-keuzes van 2026-10-08 geen knoppen meer: onder Expressief tinten klokpil, zoekbalk en
  // merkdruppel mee met het cursoruur en volgt de basiskaart de kaarttijd.
  await expect(page.locator('.map-shell')).toHaveClass(/sky-(day|night)/)
  await expect(page.locator('.map')).toHaveAttribute('data-map-night', /^[01]\.\d\d$/)

  // Tijdelijke proef (U62): rand tussen kaart en zijpaneel. "oud" is de stand van vóór de proef.
  const dashboard = page.locator('.dashboard')
  const leftBorder = () => dashboard.evaluate((element) => getComputedStyle(element).borderLeftWidth)
  const shadow = () => dashboard.evaluate((element) => getComputedStyle(element).boxShadow)
  expect(await leftBorder()).toBe('1px')
  await groups.locator('> summary', { hasText: 'Chrome' }).click()
  const edge = panel.getByLabel('Rand kaart/zijpaneel')
  await edge.selectOption('geen')
  await expect(page.locator('.app-shell')).toHaveClass(/edge-none/)
  expect(await leftBorder()).toBe('0px')
  expect(await shadow()).toBe('none')
  await edge.selectOption('a')
  expect(await leftBorder()).toBe('0px')
  expect(await shadow()).toMatch(/-1px 0px 0px 0px$/)
  await edge.selectOption('b')
  expect(await leftBorder()).toBe('0px')
  expect(await shadow()).toMatch(/-\d+px 0px \d+px -\d+px$/)
  await edge.selectOption('oud')
  expect(await leftBorder()).toBe('1px')

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
