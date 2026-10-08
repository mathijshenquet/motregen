// U62 splash-proef: klopt de onthulling (druppelvormig gat dat groeit) nog bij een doorzichtige sluier?
// Beelden op +150 / +500 / +1000 ms nadat de splash "ready" wordt, 390 px, stand 40 % en dekkend.
import { chromium, devices } from '@playwright/test'
import sharp from 'sharp'
const [baseURL = 'http://127.0.0.1:4320'] = process.argv.slice(2)
const outputDir = new URL('./out/', import.meta.url).pathname
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
for (const veil of ['dekkend', '40']) {
  const context = await browser.newContext({ ...devices['Pixel 5'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 })
  await context.addInitScript((choice) => {
    localStorage.setItem('motregen-dev-splash', choice)
    addEventListener('DOMContentLoaded', () => { const style = document.createElement('style'); style.textContent = '.dev-panel { display: none !important; }'; document.head.append(style) })
  }, veil)
  const page = await context.newPage()
  await page.goto(`${baseURL}/weer?dev`, { waitUntil: 'commit' })
  await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
  const readyAt = Date.now()
  const cells: Buffer[] = []
  for (const moment of [150, 500, 1_000]) {
    const wait = readyAt + moment - Date.now()
    if (wait > 0) await page.waitForTimeout(wait)
    cells.push(await sharp(await page.screenshot()).extract({ left: 0, top: 0, width: 390, height: 470 }).png().toBuffer())
  }
  await sharp({ create: { width: 396 * 3 - 6, height: 470, channels: 3, background: '#ff00ff' } }).composite(cells.map((input, index) => ({ input, left: index * 396, top: 0 }))).png().toFile(`${outputDir}splash-onthulling-${veil}.png`)
  await context.close()
}
await browser.close()
console.log('klaar')
