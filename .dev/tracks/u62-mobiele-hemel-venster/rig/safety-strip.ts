// U62: de vangnetstrook boven het open tabelpaneel. Met een vinger op het scherm (de app corrigeert dan niet)
// de pagina 20 px terugschuiven: boven de tab-rij hoort de kleur van de koppenrij te staan, niet de scrubber.
import { chromium, devices } from '@playwright/test'
import sharp from 'sharp'
const [baseURL = 'http://127.0.0.1:4320', output = 'tmp/u62/out/vangnetstrook.png'] = process.argv.slice(2)
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const page = await (await browser.newContext({ ...devices['Pixel 5'], viewport: { width: 390, height: 844 } })).newPage()
await page.goto(`${baseURL}/weer`)
await page.locator('tr.current-hour').waitFor({ state: 'attached', timeout: 60_000 })
await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
await page.addStyleTag({ content: 'html { scroll-snap-type: none !important; }' })
await page.getByRole('button', { name: 'Tabel' }).click()
await page.waitForTimeout(1_500)
const state = await page.evaluate(() => {
  const target = document.querySelector('.table-scroll')!
  const finger = new Touch({ identifier: 1, target, clientX: 190, clientY: 400 })
  target.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [finger], changedTouches: [finger] }))
  window.scrollBy(0, -20)
  const panel = document.querySelector('.forecast-panel')!
  return { panelTop: Math.round(panel.getBoundingClientRect().top), covers: document.querySelector('.app-shell')!.classList.contains('table-covers-viewport'), strip: getComputedStyle(panel, '::before').backgroundColor, head: getComputedStyle(panel.querySelector('thead th')!).backgroundColor }
})
await page.waitForTimeout(400)
const shot = await page.screenshot()
await sharp(shot).extract({ left: 0, top: 0, width: Math.round(390 * 2.75), height: Math.round(160 * 2.75) }).toFile(output)
console.log(JSON.stringify(state))
await browser.close()
