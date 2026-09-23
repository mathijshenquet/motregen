// Usage (from web/): node ../.dev/tracks/u9-histogram-polish/shots.mjs <url> <prefix> [tag-regex]
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
// PLACE="lng,lat,name" and PINS="future,past" override the Texel defaults (e.g. for synth data).
const [lng, lat, name] = (process.env.PLACE ?? '4.76,53.04,Texel').split(',')
const place = { id: `${Number(lng).toFixed(5)},${Number(lat).toFixed(5)}`, name, sourceLabel: name, lng: Number(lng), lat: Number(lat) }
const [futurePin, pastPin] = (process.env.PINS ?? '20:00,14:45').split(',')
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
  for (const theme of ['light', 'dark']) {
    const tag = `${profile.id}-${theme}`
    if (filter && !new RegExp(filter).test(tag)) continue
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
    const slider = page.locator('.scrub-surface')
    // Pin the cursor at a local time (rain on the snapshot: radar 14:45, model 20:00) and pause autoplay, keyboard-only
    // (pointer paths re-enter hover-scrubbing and keep the renderer busy).
    async function pin(time) {
      const pill = page.locator('.cursor-pill, .cursor-marker button').first()
      if ((await pill.getAttribute('aria-label')) === 'Pauzeren') { await pill.focus(); await page.keyboard.press('Enter') }
      await slider.focus()
      await page.keyboard.press('Home')
      const last = Number(await slider.getAttribute('aria-valuemax'))
      for (let i = 0; i < last && !(await slider.getAttribute('aria-valuetext'))?.includes(` ${time}`); i++) await page.keyboard.press('ArrowRight')
      await page.evaluate(() => document.activeElement?.blur())
      await page.waitForTimeout(600)
    }
    await pin(futurePin)
    await shot(page, `${out}/${tag}-future.png`)
    await pin(pastPin)
    await shot(page, `${out}/${tag}-past.png`)
    await page.locator('.scrub-surface').focus()
    await page.keyboard.press('ArrowRight')
    await page.waitForTimeout(300)
    await shot(page, `${out}/${tag}-focus.png`)
    await page.evaluate(() => document.activeElement?.blur())
    await page.locator('.time-horizon button', { hasText: '+24u' }).click()
    await page.waitForTimeout(600)
    await shot(page, `${out}/${tag}-24u.png`)
    if (profile.id === 'desktop') await page.screenshot({ path: `${out}/${tag}-nav.png`, clip: await page.locator('.sidebar-nav').boundingBox(), timeout: 120_000 })
    await page.locator('.time-horizon button', { hasText: 'Alles' }).click()
    await page.waitForTimeout(600)
    await shot(page, `${out}/${tag}-alles.png`)
    await context.close()
  }
}
await browser.close()
