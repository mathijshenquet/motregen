// Usage (from web/): node ../.dev/tracks/u14-mobiel-layout/shots.mjs <url> <prefix>
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
const require = createRequire(join(process.cwd(), 'package.json'))
const { chromium, devices } = require('@playwright/test')
const [url, prefix] = process.argv.slice(2)
const out = join(dirname(fileURLToPath(import.meta.url)), 'shots')
const pixel5 = devices['Pixel 5']
const orientations = [
  { id: 'portrait', options: pixel5 },
  { id: 'landscape', options: { ...pixel5, viewport: { width: pixel5.viewport.height, height: pixel5.viewport.width }, screen: { width: pixel5.screen.height, height: pixel5.screen.width } } },
]
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const metrics = []
for (const orientation of orientations) for (const scheme of ['light', 'dark']) {
  const context = await browser.newContext({ ...orientation.options, locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', colorScheme: scheme })
  await context.addInitScript((theme) => localStorage.setItem('motregen-theme', theme), scheme)
  const page = await context.newPage()
  await page.goto(url)
  await page.waitForSelector('.map-splash.ready', { timeout: 60_000 })
  await page.waitForTimeout(6_000)
  const name = `${prefix}-${orientation.id}-${scheme}`
  await page.screenshot({ path: `${out}/${name}.png` })
  metrics.push({ name, ...await page.evaluate(() => {
    const rect = (selector) => { const r = document.querySelector(selector)?.getBoundingClientRect(); return r ? [Math.round(r.top), Math.round(r.bottom), Math.round(r.left), Math.round(r.right)] : null }
    return { viewport: [innerWidth, innerHeight], scrollWidth: document.documentElement.scrollWidth, scrollHeight: document.documentElement.scrollHeight,
      map: rect('.map-shell'), nav: rect('.sidebar-nav'), scrubber: rect('.scrubber'), table: rect('.forecast-panel'), search: rect('.search'), brand: rect('.map-brand'), clock: rect('.map-clock'), theme: rect('.mobile-map-theme'), insetTop: document.querySelector('.map')?.dataset.insetTop,
      tableOverflow: (() => { const t = document.querySelector('.table-scroll'); return t ? t.scrollWidth - t.clientWidth : null })(),
      small: [...document.querySelectorAll('button, input, [role=slider], a')].filter((e) => e.checkVisibility()).map((e) => [e.className || e.tagName, Math.round(e.getBoundingClientRect().width), Math.round(e.getBoundingClientRect().height)]).filter(([, w, h]) => w < 44 || h < 44).slice(0, 12) }
  }) })
  await page.evaluate(() => { window.scrollTo(0, 700); document.querySelector('.dashboard').scrollTop = 500 })
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${out}/${name}-scrolled.png` })
  await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.dashboard').scrollTop = 0 })
  await page.waitForTimeout(300)
  await page.locator('.search input').click()
  await page.waitForTimeout(500)
  await page.screenshot({ path: `${out}/${name}-search.png` })
  // Een fullPage-opname heft in Chromium de pointer:coarse-emulatie op; daarom als laatste.
  await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.dashboard').scrollTop = 0 })
  await page.keyboard.press('Escape')
  await page.screenshot({ path: `${out}/${name}-full.jpg`, fullPage: true, quality: 70 })
  await context.close()
}
await browser.close()
for (const metric of metrics) console.log(JSON.stringify(metric))
