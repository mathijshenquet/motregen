// U62: de ?dev-schakelaar "Rand kaart/zijpaneel" zoals hij live staat (A en B), desktop 1280 px, uitsnede rond de naad.
import { chromium } from '@playwright/test'
import sharp from 'sharp'
const [baseURL = 'http://127.0.0.1:4320'] = process.argv.slice(2)
const outputDir = new URL('./out/', import.meta.url).pathname
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const parts: Buffer[] = []
for (const edge of ['geen', 'a', 'b']) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })
  await context.addInitScript((choice) => localStorage.setItem('motregen-dev-rand', choice), edge)
  const page = await context.newPage()
  await page.goto(`${baseURL}/weer?dev`)
  await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
  await page.evaluate(() => document.querySelector('.dev-panel')?.removeAttribute('open'))
  await page.waitForTimeout(6_000)
  console.log(`${edge}: app-shell "${(await page.locator('.app-shell').getAttribute('class'))}", box-shadow ${await page.locator('.dashboard').evaluate((element) => getComputedStyle(element).boxShadow)}`)
  parts.push(await sharp(await page.screenshot()).extract({ left: 600 * 2, top: 250 * 2, width: 420 * 2, height: 400 * 2 }).resize({ width: 630 }).png().toBuffer())
  await context.close()
}
await browser.close()
await sharp({ create: { width: 630 * 3 + 24, height: 600, channels: 3, background: '#ff00ff' } }).composite(parts.map((input, index) => ({ input, left: index * 642, top: 0 }))).png().toFile(`${outputDir}rand-live.png`)
