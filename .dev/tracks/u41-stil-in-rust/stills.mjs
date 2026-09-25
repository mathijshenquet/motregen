// Stills vóór/ná (gepauzeerd op een vast frame): node stills.mjs <url> <prefix>
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
const require = createRequire(`${process.cwd()}/`)
const { chromium } = require('@playwright/test')
const [url, prefix] = [process.argv[2], process.argv[3]]
const out = new URL('./stills/', import.meta.url).pathname
mkdirSync(out, { recursive: true })
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
for (const scheme of ['light', 'dark']) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, colorScheme: scheme })
  await context.addInitScript((theme) => localStorage.setItem('motregen-theme', theme), scheme)
  const page = await context.newPage()
  await page.goto(url)
  await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
  await page.locator('.temperature-cell').first().waitFor({ timeout: 60_000 })
  const slider = page.getByRole('slider', { name: 'Tijd' })
  await slider.focus()
  if (await slider.getAttribute('data-playing') !== null) await slider.press(' ')
  await slider.press('End')
  for (let i = 0; i < 3; i++) await slider.press('PageDown')
  // Scrubben laadt de volledige puntreeks; pas daarna liggen tabel en wolkband vast.
  await page.locator('[role="slider"][data-load-stage="complete"]').waitFor({ timeout: 60_000 })
  const shoot = async (name) => { await page.waitForTimeout(3_000); await page.screenshot({ path: `${out}${prefix}-${scheme}-${name}.png` }) }
  await shoot('weer')
  await page.locator('.temperature-focus').first().click()
  await shoot('temperatuur')
  if (scheme === 'light') {
    await page.locator('.temperature-focus').first().click()
    await page.locator('.wind-focus').first().click()
    await shoot('wind')
  }
  await context.close()
}
await browser.close()
