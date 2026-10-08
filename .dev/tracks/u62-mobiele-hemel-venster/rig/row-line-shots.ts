// U62 punt 5: tabelrijlijnen dag/nacht, 390 px en 1280 px, licht en donker thema; meet de lijnkleur per rijsoort.
// Gebruik: pnpm exec tsx tmp/u62/row-line-shots.ts <baseURL> <label>
import { chromium, devices } from '@playwright/test'
import { mkdirSync } from 'node:fs'
const [baseURL = 'http://127.0.0.1:4320', label = 'rijlijnen'] = process.argv.slice(2)
const outputDir = new URL('./out/', import.meta.url).pathname
mkdirSync(outputDir, { recursive: true })
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
for (const device of ['390', '1280'] as const) for (const theme of ['light', 'dark'] as const) {
  const context = await browser.newContext(device === '390' ? { ...devices['Pixel 5'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 })
  await context.addInitScript((choice) => localStorage.setItem('motregen-theme', choice), theme)
  const page = await context.newPage()
  await page.goto(`${baseURL}/`)
  await page.locator('tr.current-hour').waitFor({ state: 'attached', timeout: 60_000 })
  await page.waitForTimeout(6_000)
  if (device === '390') { await page.getByRole('button', { name: 'Tabel' }).click(); await page.waitForTimeout(1_500) }
  // Naar de eerste zonsovergang, zodat dag- en nachtrijen samen in beeld staan.
  await page.evaluate(() => document.querySelector('tr.sun-row')?.scrollIntoView({ block: 'center' }))
  await page.waitForTimeout(800)
  const lines = await page.evaluate(() => ['day-hour', 'night-hour'].map((kind) => {
    const cell = document.querySelector(`tbody tr.${kind}:not(.before-sun-row) td`)
    return `${kind} ${cell ? getComputedStyle(cell).borderBottomColor : 'geen rij'}`
  }))
  console.log(`${device} ${theme}: ${lines.join(' · ')}`)
  await page.locator('.forecast-panel').screenshot({ path: `${outputDir}${label}-${device}-${theme}.png` })
  await context.close()
}
await browser.close()
