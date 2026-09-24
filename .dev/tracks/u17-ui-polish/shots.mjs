// node shots.mjs <base-url> <out-dir> <prefix>  — kaart, zoeklijst met favoriet, About; desktop + Pixel 5, licht + donker.
import { chromium, devices } from '@playwright/test'
const [base, out, prefix] = process.argv.slice(2)
const saved = [{ id: '5.12140,52.09070', name: 'Thuis', sourceLabel: 'Utrecht', lng: 5.1214, lat: 52.0907 }, { id: '4.89520,52.37020', name: 'Werk', sourceLabel: 'Amsterdam', lng: 4.8952, lat: 52.3702 }]
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const profiles = { desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 }, pixel5: devices['Pixel 5'] }
for (const [device, options] of Object.entries(profiles)) for (const theme of ['light', 'dark']) {
  const context = await browser.newContext({ ...options, colorScheme: theme })
  await context.addInitScript(([t, s]) => { try { localStorage.setItem('motregen-theme', t); localStorage.setItem('motregen-saved-places', s) } catch {} }, [theme, JSON.stringify(saved)])
  const page = await context.newPage()
  await page.goto(base)
  await page.waitForSelector('.map-splash.ready', { state: 'attached', timeout: 60_000 })
  await page.waitForTimeout(3000)
  const name = (state) => `${out}/${prefix}-${device}-${state}-${theme}.png`
  await page.screenshot({ path: name('kaart') })
  await page.locator('.search > input').click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: name('zoeken') })
  const remove = page.locator('.remove-saved').first()
  if (await remove.count()) {
    await remove.click()
    await page.waitForTimeout(300)
    await page.screenshot({ path: name('verwijderen') })
  }
  await page.keyboard.press('Escape')
  await page.locator('body').click({ position: { x: 5, y: 400 } }).catch(() => {})
  await page.locator('.map-brand').click()
  await page.waitForTimeout(700)
  await page.screenshot({ path: name('about') })
  await page.keyboard.press('Escape')
  await page.locator('.freshness-trigger').click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: name('paneel') })
  await context.close()
}
await browser.close()
