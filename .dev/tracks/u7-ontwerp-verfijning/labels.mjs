// Usage (from web/, preview built with the dev-only window.__map hook): node ../.dev/tracks/u7-ontwerp-verfijning/labels.mjs <url>
import { createRequire } from 'node:module'
import { join } from 'node:path'
const require = createRequire(join(process.cwd(), 'package.json'))
const { chromium, devices } = require('@playwright/test')
const [url] = process.argv.slice(2)
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
for (const [id, options] of [['desktop', { viewport: { width: 1440, height: 900 } }], ['pixel5', devices['Pixel 5']]]) {
  const context = await browser.newContext({ ...options, locale: 'nl-NL', timezoneId: 'Europe/Amsterdam' })
  const page = await context.newPage()
  await page.goto(url.includes('?') ? `${url}&dev` : `${url}?dev`)
  await page.waitForSelector('.map-splash.ready', { timeout: 60_000 })
  await page.waitForTimeout(5_000)
  for (const zoom of [null, 6, 6.6, 7.2, 8]) {
    const result = await page.evaluate(async (zoom) => {
      const map = window.__map
      if (zoom !== null) map.jumpTo({ center: [5.3, 52.15], zoom })
      await new Promise((resolve) => map.once('idle', resolve))
      await new Promise((resolve) => setTimeout(resolve, 400))
      await new Promise((resolve) => map.once('idle', resolve))
      const bounds = map.getBounds()
      const sourced = [...new Map(map.querySourceFeatures('motregen-temperature').filter((f) => bounds.contains(f.geometry.coordinates)).map((f) => [f.properties.name, f])).keys()]
      const shown = new Set(map.queryRenderedFeatures({ layers: ['motregen-temperature'] }).map((f) => f.properties.name))
      return { zoom: map.getZoom().toFixed(2), inView: sourced.length, shown: shown.size, missing: sourced.filter((name) => !shown.has(name)) }
    }, zoom)
    console.log(id, JSON.stringify(result))
  }
  await context.close()
}
await browser.close()
