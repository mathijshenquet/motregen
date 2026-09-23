// Usage (from web/): node ../.dev/tracks/u7-ontwerp-verfijning/shots.mjs <url> <prefix>
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const require = createRequire(join(process.cwd(), 'package.json'))
const { chromium, devices } = require('@playwright/test')
const [url, prefix] = process.argv.slice(2)
const out = join(dirname(fileURLToPath(import.meta.url)), 'shots')
const profiles = [
  { id: 'desktop', options: { viewport: { width: 1440, height: 900 } } },
  { id: 'pixel5', options: { ...devices['Pixel 5'] } },
]
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
for (const profile of profiles) {
  const context = await browser.newContext({ ...profile.options, locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', colorScheme: 'light' })
  const page = await context.newPage()
  await page.goto(url)
  await page.waitForSelector('.map-splash.ready', { timeout: 60_000 })
  await page.waitForTimeout(6_000)
  // CLICK="x,y;x,y" (desktop;pixel5, CSS px on the map) picks a location first.
  const click = process.env.CLICK?.split(';')[profiles.indexOf(profile)]
  if (click) {
    const [x, y] = click.split(',').map(Number)
    await page.mouse.click(x, y)
    await page.waitForTimeout(4_000)
  }
  await page.screenshot({ path: `${out}/${prefix}-${profile.id}-page.png` })
  await page.locator('.scrubber').screenshot({ path: `${out}/${prefix}-${profile.id}-scrubber.png` })
  const box = await page.locator('.map-shell').boundingBox()
  await page.screenshot({ path: `${out}/${prefix}-${profile.id}-corner.png`, clip: { x: box.x + box.width - 260, y: box.y + box.height - 90, width: 260, height: 90 } })
  await context.close()
}
await browser.close()
