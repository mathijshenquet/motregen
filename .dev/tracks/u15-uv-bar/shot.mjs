import { chromium } from '@playwright/test'
const [base, out, prefix = ''] = process.argv.slice(2)
const browser = await chromium.launch()
for (const [name, query, theme] of [['dubbel', '', 'light'], ['stip', '?uvbalk=stip', 'light'], ['dubbel-donker', '', 'dark']]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 1000 }, deviceScaleFactor: 2 })
  await page.addInitScript((t) => { try { localStorage.setItem('motregen-theme', t) } catch {} }, theme)
  await page.goto(base + query)
  await page.waitForSelector('.uv-bar-fill', { timeout: 60_000 })
  await page.waitForTimeout(4000)
  const table = page.locator('table').first()
  const box = (await table.boundingBox())
  await page.setViewportSize({ width: 1280, height: Math.min(4000, Math.ceil(box.y + box.height + 20)) })
  await page.waitForTimeout(500)
  await table.screenshot({ path: `${out}/${prefix}tabel-${name}.png` })
  const chip = page.locator('.sidebar-uv-chip')
  if (await chip.count()) await chip.screenshot({ path: `${out}/${prefix}chip-${name}.png` })
  await page.close()
}
await browser.close()
