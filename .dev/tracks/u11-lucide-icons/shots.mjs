// Usage (from web/): node ../.dev/tracks/u11-lucide-icons/shots.mjs <url> <prefix>
// Desktop 1440×900 + Pixel 5, licht + donker; twee opgeslagen plaatsen zodat ster-markers en de lijst zichtbaar zijn.
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const require = createRequire(join(process.cwd(), 'package.json'))
const { chromium, devices } = require('@playwright/test')
const [url, prefix] = process.argv.slice(2)
const out = join(dirname(fileURLToPath(import.meta.url)), 'shots')
const saved = [
  { id: 'home', name: 'Thuis', sourceLabel: 'Utrecht', lng: 5.1214, lat: 52.0907 },
  { id: 'work', name: 'Werk', sourceLabel: 'Amsterdam', lng: 4.9041, lat: 52.3676 },
]
const profiles = [
  { id: 'desktop', options: { viewport: { width: 1440, height: 900 } } },
  { id: 'pixel5', options: { ...devices['Pixel 5'] } },
]
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
for (const profile of profiles) for (const theme of ['licht', 'donker']) {
  const context = await browser.newContext({ ...profile.options, locale: 'nl-NL', timezoneId: 'Europe/Amsterdam' })
  await context.addInitScript(([places, choice]) => {
    localStorage.setItem('motregen-saved-places', places)
    localStorage.setItem('motregen-theme', choice)
  }, [JSON.stringify(saved), theme === 'licht' ? 'light' : 'dark'])
  const page = await context.newPage()
  const name = `${prefix}-${profile.id}-${theme}`
  await page.goto(url)
  await page.waitForSelector('.map-splash.ready', { timeout: 60_000 })
  await page.waitForTimeout(5_000)
  await page.screenshot({ path: `${out}/${name}-page.png` })
  await page.getByRole('textbox', { name: 'Zoek plaats' }).focus()
  await page.waitForTimeout(400)
  await page.screenshot({ path: `${out}/${name}-search.png` })
  await page.keyboard.press('Escape')
  await page.locator('.about-button').click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: `${out}/${name}-about.png` })
  await context.close()
}
await browser.close()
