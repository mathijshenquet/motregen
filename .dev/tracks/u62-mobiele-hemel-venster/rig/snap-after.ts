// U62: het beeld ná de fix — tabel open, pagina 35 px naast het snappunt gezet (CSS-snap uit, zoals Firefox
// haar laat staan), en een halve seconde later gefotografeerd.
import { chromium, devices } from '@playwright/test'
const [baseURL = 'http://127.0.0.1:4320', output = 'tmp/u62/out/adresbalk-na.png'] = process.argv.slice(2)
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const page = await (await browser.newContext({ ...devices['Pixel 5'], viewport: { width: 390, height: 844 } })).newPage()
await page.goto(`${baseURL}/weer`)
await page.locator('tr.current-hour').waitFor({ state: 'attached', timeout: 60_000 })
await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
await page.addStyleTag({ content: 'html { scroll-snap-type: none !important; }' })
await page.getByRole('button', { name: 'Tabel' }).click()
await page.waitForTimeout(1_500)
const displaced = await page.evaluate(() => { window.scrollBy(0, -35); return Math.round(document.querySelector('.forecast-panel')!.getBoundingClientRect().top) })
await page.waitForTimeout(500)
const settled = await page.evaluate(() => Math.round(document.querySelector('.forecast-panel')!.getBoundingClientRect().top))
await page.screenshot({ path: output })
console.log(`paneel direct na het verschuiven op ${displaced} px, een halve seconde later op ${settled} px`)
await browser.close()
