// Usage (from web/): node ../.dev/tracks/u9-histogram-polish/shots.mjs <url> <prefix> [profile-filter]
// Seeds Texel (rain in radar history + model on the 2026-09-23 snapshot) as the saved place.
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const require = createRequire(join(process.cwd(), 'package.json'))
const { chromium, devices } = require('@playwright/test')
const [url, prefix, filter] = process.argv.slice(2)
const out = join(dirname(fileURLToPath(import.meta.url)), 'shots', prefix)
mkdirSync(out, { recursive: true })
const place = { id: '4.76000,53.04000', name: 'Texel', sourceLabel: 'Texel', lng: 4.76, lat: 53.04 }
const profiles = [
  { id: 'desktop', options: { viewport: { width: 1440, height: 900 } } },
  { id: 'pixel5', options: { ...devices['Pixel 5'] } },
]
// Clip instead of element screenshots: playback keeps re-rendering, so Playwright's stability wait can hang.
async function shot(page, path) {
  const scrubber = page.locator('.scrubber')
  await scrubber.scrollIntoViewIfNeeded()
  await page.screenshot({ path, clip: await scrubber.boundingBox(), animations: 'disabled', timeout: 120_000 })
}
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] })
for (const profile of profiles) {
  if (filter && !profile.id.includes(filter)) continue
  for (const theme of ['light', 'dark']) {
    const tag = `${profile.id}-${theme}`
    const context = await browser.newContext({ ...profile.options, locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', colorScheme: theme })
    await context.addInitScript(([place, theme]) => {
      localStorage.setItem('motregen-theme', theme)
      localStorage.setItem('motregen-saved-places', JSON.stringify([place]))
      localStorage.setItem('motregen-last-saved-place', place.id)
    }, [place, theme])
    const page = await context.newPage()
    let slow = theme === 'light'
    // Slow chunk bytes on the first light load so the loading skeleton is visible.
    await page.route('**/data/chunks/**', async (route) => { if (slow) await new Promise((r) => setTimeout(r, 2500)); await route.continue() })
    await page.goto(url)
    await page.waitForSelector('.map-splash.ready', { timeout: 60_000 })
    if (slow) {
      await page.waitForTimeout(300)
      await shot(page, `${out}/${tag}-loading.png`)
      slow = false
    }
    await page.waitForSelector('.scrub-surface[data-load-stage="complete"]', { timeout: 90_000 })
    await page.waitForTimeout(1_500)
    await shot(page, `${out}/${tag}-scrubber.png`)
    if (profile.id === 'desktop') await page.screenshot({ path: `${out}/${tag}-page.png` })
    const touch = profile.id !== 'desktop'
    const plot = await page.locator('.chart-plot').boundingBox()
    // Pin the cursor at a plot fraction and pause playback (autoplay is on by default).
    async function pin(fraction) {
      const x = plot.x + plot.width * fraction, y = plot.y + plot.height * 0.6
      if (touch) await page.touchscreen.tap(x, y); else await page.mouse.click(x, y)
      await page.waitForTimeout(150)
      const pill = page.locator('.cursor-marker button')
      if ((await pill.getAttribute('aria-label')) === 'Pauzeren') { if (touch) await pill.tap({ force: true }); else await pill.click({ force: true }) }
      if (!touch) await page.mouse.move(2, 2)
      await page.waitForTimeout(500)
    }
    await pin(0.62)
    await shot(page, `${out}/${tag}-future.png`)
    await pin(0.16)
    await shot(page, `${out}/${tag}-past.png`)
    await page.locator('.scrub-surface').focus()
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(300)
    await shot(page, `${out}/${tag}-focus.png`)
    await page.evaluate(() => document.activeElement?.blur())
    await page.locator('.time-horizon button', { hasText: 'Alles' }).click()
    await page.waitForTimeout(600)
    await shot(page, `${out}/${tag}-alles.png`)
    await context.close()
  }
}
await browser.close()
