// Usage (from web/): node ../.dev/tracks/u27-vlaanderen/stills.mjs <url> <prefix>
// Contain-fit-stills (desktop 1440×900, Pixel 5 portret/liggend) + de gemeten kaartviewport.
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const require = createRequire(join(process.cwd(), 'package.json'))
const { chromium, devices } = require('@playwright/test')
const [url, prefix] = process.argv.slice(2)
const out = join(dirname(fileURLToPath(import.meta.url)), 'shots')
const pixel5 = devices['Pixel 5']
const profiles = [
  { id: 'desktop', options: { viewport: { width: 1440, height: 900 } } },
  { id: 'pixel5', options: pixel5 },
  { id: 'pixel5-landscape', options: { ...pixel5, viewport: { width: pixel5.viewport.height, height: pixel5.viewport.width }, screen: { width: pixel5.screen.height, height: pixel5.screen.width } } },
]
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
for (const profile of profiles) {
  const context = await browser.newContext({ ...profile.options, locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', colorScheme: 'light' })
  const page = await context.newPage()
  await page.goto(url)
  await page.waitForSelector('.map-splash.ready', { timeout: 90_000 })
  await page.waitForTimeout(8_000)
  await page.screenshot({ path: `${out}/${prefix}-${profile.id}.png` })
  const viewport = await page.locator('.map').evaluate((element) => ({ width: element.clientWidth, height: element.clientHeight, insetTop: Number(element.dataset.insetTop ?? 0) }))
  console.log(JSON.stringify({ name: `${prefix}-${profile.id}`, viewport }))
  await context.close()
}
await browser.close()
