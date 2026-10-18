import { expect, test, type Page } from '@playwright/test'

// Firefox voor Android verschoof bij een terugkerende adresbalk het einde van de paginascroll (U62). Sinds
// 2026-10-17 scrolt op een staande telefoon de app-shell en niet het document; Gecko moet het tabelpaneel dan
// precies aan het scrolleinde zetten en daar houden.

const panelTop = (page: Page) => page.locator('.forecast-panel').evaluate((element) => Math.round(element.getBoundingClientRect().top))

async function openTable(page: Page): Promise<void> {
  await page.goto('/')
  await expect(page.locator('tr.current-hour')).toBeAttached()
  await page.getByRole('button', { name: 'Tabel' }).click()
}

test('the table panel snaps to the end of the app-shell scroll and the document never scrolls', async ({ page }) => {
  await openTable(page)
  await expect.poll(() => panelTop(page), { timeout: 10_000 }).toBe(0)
  await expect(page.locator('.app-shell')).toHaveClass(/table-view-open/)
  const position = await page.locator('.app-shell').evaluate((shell) => ({
    document: document.scrollingElement!.scrollTop,
    remaining: Math.round(shell.scrollHeight - shell.clientHeight - shell.scrollTop),
  }))
  expect(position).toEqual({ document: 0, remaining: 0 })
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
