import { expect, test, type Page } from '@playwright/test'

// U62 (PO, Firefox voor Android 2026-10-08): komt de adresbalk terug, dan bleef er een strook scrubber boven
// de open tabel staan. Gecko op de desktop heeft geen meebewegende adresbalk; de twee toestanden waarin de
// pagina dan kan blijven hangen worden hier nagebootst.

const panelTop = (page: Page) => page.locator('.forecast-panel').evaluate((element) => Math.round(element.getBoundingClientRect().top))

async function openTable(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator('tr.current-hour')).toBeAttached()
  await page.getByRole('button', { name: 'Tabel' }).click()
}

test('the table panel makes up its own shortfall when the page ends before the panel reaches the top', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('tr.current-hour')).toBeAttached()
  // Een browser die de scroll begrenst met een hoger scherm dan 100dvh: het paneel is 56 px te kort.
  const shortPanel = await page.addStyleTag({ content: '.forecast-panel { height: calc(100dvh - 56px + var(--table-panel-shortfall, 0px)) !important; min-height: 0 !important; }' })
  await page.getByRole('button', { name: 'Tabel' }).click()
  await expect.poll(() => panelTop(page), { timeout: 10_000 }).toBe(0)
  await expect(page.locator('.app-shell')).toHaveClass(/table-view-open/)
  expect(await page.locator('.forecast-panel').evaluate((element) => (element as HTMLElement).style.getPropertyValue('--table-panel-shortfall'))).toBe('56px')

  // De adresbalk verdwijnt: het scherm wordt hoger en 100dvh klopt weer, dus de verlenging vervalt.
  await shortPanel.evaluate((element) => element.remove())
  await page.setViewportSize({ width: 390, height: 900 })
  await expect.poll(() => page.locator('.forecast-panel').evaluate((element) => (element as HTMLElement).style.getPropertyValue('--table-panel-shortfall'))).toBe('')
  await expect.poll(() => panelTop(page)).toBe(0)
})

test('a page left just beside the table snap point is pulled back', async ({ page }) => {
  await page.goto('/')
  await expect(page.locator('tr.current-hour')).toBeAttached()
  await page.addStyleTag({ content: 'html { scroll-snap-type: none !important; }' })
  await page.getByRole('button', { name: 'Tabel' }).click()
  await expect.poll(() => panelTop(page)).toBe(0)
  expect(await page.evaluate(() => {
    window.scrollBy(0, -35)
    return Math.round(document.querySelector('.forecast-panel')!.getBoundingClientRect().top)
  })).toBe(35)
  await expect.poll(() => panelTop(page)).toBe(0)
  await expect(page.locator('.app-shell')).toHaveClass(/table-view-open/)
})

test('the table panel stays at the top when the viewport height changes after scrolling', async ({ page }) => {
  await openTable(page)
  await expect.poll(() => panelTop(page)).toBe(0)
  for (const height of [788, 844]) {
    await page.setViewportSize({ width: 390, height })
    await page.waitForTimeout(600)
    expect(await panelTop(page)).toBe(0)
  }
})

test('the strip of scrubber does not stay above the table when the address bar returns during a touch scroll', async ({ page }, testInfo) => {
  // Het recept van de PO (Firefox voor Android, 2026-10-08): tabel bijna tot het einde scrollen, een korte veeg
  // terug zodat de adresbalk terugkomt, loslaten. De balk maakt het zichtbare scherm lager terwijl de vinger er
  // nog op ligt; de browser begrenst de scroll daarna met een hoger scherm dan `innerHeight` meldt.
  await openTable(page)
  await expect.poll(() => panelTop(page)).toBe(0)
  await expect(page.locator('.app-shell')).toHaveClass(/table-scroll-open/)
  const scroller = page.locator('.table-scroll')
  await scroller.evaluate((element) => { element.scrollTop = element.scrollHeight - element.clientHeight - 40 })

  const touch = (type: 'touchstart' | 'touchmove' | 'touchend', held: boolean) => page.evaluate(([eventType, active]) => {
    const target = document.querySelector('.table-scroll')!
    const finger = new Touch({ identifier: 1, target, clientX: 190, clientY: 400 })
    target.dispatchEvent(new TouchEvent(eventType as string, { bubbles: true, cancelable: true, touches: active ? [finger] : [], changedTouches: [finger] }))
  }, [type, held] as const)

  await touch('touchstart', true)
  await scroller.evaluate((element) => { element.scrollTop -= 30 })
  await touch('touchmove', true)
  // De adresbalk komt terug: 56 px minder zichtbaar scherm. 100dvh (en dus het paneel) krimpt mee en
  // `innerHeight` ook, maar de scroll van de pagina blijft begrensd door het hogere scherm.
  await page.evaluate(() => {
    const realInnerHeight = window.innerHeight
    Object.defineProperty(window, 'innerHeight', { configurable: true, get: () => realInnerHeight - 56 })
    const style = document.createElement('style')
    style.textContent = '.forecast-panel { height: calc(100dvh - 56px + var(--table-panel-shortfall, 0px)) !important; min-height: 0 !important; }'
    document.head.append(style)
    window.dispatchEvent(new Event('resize'))
    window.visualViewport?.dispatchEvent(new Event('resize'))
  })
  // Zolang de vinger ligt blijft de app eraf: de strook staat er.
  await page.waitForTimeout(500)
  expect(await panelTop(page)).toBe(56)

  await page.screenshot({ path: testInfo.outputPath('strook-tijdens-het-gebaar.png') })
  await touch('touchend', false)
  await expect.poll(() => panelTop(page), { timeout: 10_000 }).toBe(0)
  await page.screenshot({ path: testInfo.outputPath('na-loslaten.png') })
  await expect(page.locator('.app-shell')).toHaveClass(/table-view-open/)
  await expect.poll(() => page.locator('.forecast-panel').evaluate((element) => (element as HTMLElement).style.getPropertyValue('--table-panel-shortfall')), { timeout: 10_000 }).toBe('56px')
})

test('a strip the browser shows above the layout viewport is closed, and shows panel colour until then', async ({ page }, testInfo) => {
  // PO-overlay (Firefox voor Android, 2026-10-08) in de bugtoestand: paneel top 0, scrollTop = max, maar
  // visualViewport.offsetTop −63,7 — de browser toont 64 px boven de layout-viewport, met daarin de scrubber.
  await openTable(page)
  await expect.poll(() => panelTop(page)).toBe(0)
  await expect(page.locator('.app-shell')).toHaveClass(/table-covers-viewport/)

  // Vangnet: boven het paneel ligt een strook in de kleur van de koppenrij, over de scrubber heen.
  const strip = await page.locator('.forecast-panel').evaluate((panel) => {
    const before = getComputedStyle(panel, '::before')
    return { top: before.top, height: before.height, background: before.backgroundColor, head: getComputedStyle(panel.querySelector('thead th')!).backgroundColor }
  })
  expect(strip.top).toBe('-120px')
  expect(strip.height).toBe('120px')
  expect(strip.background).toBe(strip.head)

  // De adresbalk komt terug: het zichtbare scherm schuift 64 px boven de layout-viewport.
  // In dezelfde tik teruglezen: een al geplande hercontrole van de app kan de strook anders al gedicht hebben
  // vóór de test kijkt (onder load gezien: 0 in plaats van 64).
  const visibleTop = () => page.evaluate(() => Math.round(document.querySelector('.forecast-panel')!.getBoundingClientRect().top - window.visualViewport!.offsetTop))
  expect(await page.evaluate(() => {
    const visual = window.visualViewport!
    Object.defineProperty(visual, 'offsetTop', { configurable: true, get: () => -64 })
    Object.defineProperty(visual, 'pageTop', { configurable: true, get: () => window.scrollY - 64 })
    const shown = Math.round(document.querySelector('.forecast-panel')!.getBoundingClientRect().top - visual.offsetTop)
    visual.dispatchEvent(new Event('resize'))
    return shown
  })).toBe(64)
  await expect.poll(visibleTop, { timeout: 10_000 }).toBe(0)
  // De pagina kon niet verder: het paneel is 64 px verlengd en de layout is 64 px doorgescrold.
  const shortfall = () => page.locator('.forecast-panel').evaluate((element) => (element as HTMLElement).style.getPropertyValue('--table-panel-shortfall'))
  await expect.poll(shortfall, { timeout: 10_000 }).toBe('64px')
  await expect.poll(() => panelTop(page), { timeout: 10_000 }).toBe(-64)
  await expect(page.locator('.app-shell')).toHaveClass(/table-view-open/)
  await page.screenshot({ path: testInfo.outputPath('na-correctie.png') })

  // De balk verdwijnt weer: geen verschuiving meer en een hoger scherm → verlenging weg, paneel bovenaan.
  await page.evaluate(() => {
    const visual = window.visualViewport!
    Object.defineProperty(visual, 'offsetTop', { configurable: true, get: () => 0 })
    Object.defineProperty(visual, 'pageTop', { configurable: true, get: () => window.scrollY })
  })
  await page.setViewportSize({ width: 390, height: 900 })
  await expect.poll(visibleTop, { timeout: 5_000 }).toBe(0)
  await expect.poll(() => page.locator('.forecast-panel').evaluate((element) => (element as HTMLElement).style.getPropertyValue('--table-panel-shortfall'))).toBe('')
})
