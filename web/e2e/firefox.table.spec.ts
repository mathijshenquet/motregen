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
