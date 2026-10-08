// U62: blijft er een strook scrubber boven de open tabel staan als de schermhoogte verandert nadat de tabel
// is opengescrold (zoals een adresbalk die verschijnt of verdwijnt)? Meet de bovenkant van het tabelpaneel.
// Gebruik: pnpm exec tsx tmp/u62/toolbar-resize.ts <baseURL> <label>
import { chromium, devices } from '@playwright/test'
import { mkdirSync } from 'node:fs'
const [baseURL = 'http://127.0.0.1:4320', label = 'adresbalk'] = process.argv.slice(2)
const outputDir = new URL('./out/', import.meta.url).pathname
mkdirSync(outputDir, { recursive: true })
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const TOOLBAR_PX = 56
for (const [name, startHeight, endHeight] of [['balk-verschijnt', 844, 844 - TOOLBAR_PX], ['balk-verdwijnt', 844 - TOOLBAR_PX, 844]] as const) {
  const context = await browser.newContext({ ...devices['Pixel 5'], viewport: { width: 390, height: startHeight } })
  const page = await context.newPage()
  await page.goto(`${baseURL}/weer`)
  await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
  await page.locator('tr.current-hour').waitFor({ state: 'attached', timeout: 60_000 })
  await page.getByRole('button', { name: 'Tabel' }).click()
  await page.waitForTimeout(1_500)
  const read = () => page.evaluate(() => ({
    panelTop: Math.round(document.querySelector('.forecast-panel')!.getBoundingClientRect().top),
    panelHeight: Math.round(document.querySelector('.forecast-panel')!.getBoundingClientRect().height),
    innerHeight, scrollY: Math.round(scrollY), maxScroll: Math.round(document.documentElement.scrollHeight - innerHeight),
    open: document.querySelector('.app-shell')!.classList.contains('table-view-open'),
  }))
  const before = await read()
  await page.setViewportSize({ width: 390, height: endHeight })
  await page.waitForTimeout(1_200)
  const after = await read()
  await page.screenshot({ path: `${outputDir}${label}-${name}.png` })
  console.log(`${name}: vóór ${JSON.stringify(before)} → ná ${JSON.stringify(after)}`)
  await context.close()
}
await browser.close()
