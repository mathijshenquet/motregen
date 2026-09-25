// Usage (from web/): node ../.dev/tracks/u26-pin-navigatie/pin-crops.mjs <url>
// Per zoom: 200 %-crop van de pin zonder (voor) en met (na) de U26-ruimte, plus de ankermeting.
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { mkdirSync, readFileSync } from 'node:fs'
const require = createRequire(join(process.cwd(), 'package.json'))
const { chromium } = require('@playwright/test')
const [url] = process.argv.slice(2)
const out = join(dirname(fileURLToPath(import.meta.url)), 'shots')
mkdirSync(out, { recursive: true })
const revert = '.location-pin { padding: 0 !important } .location-pin svg { overflow: hidden !important }'
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const results = []
for (const zoom of [7.3, 8.7]) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1, locale: 'nl-NL' })
  await context.addInitScript((view) => localStorage.setItem('motregen-map-view', JSON.stringify(view)), { lng: 5.18, lat: 52.1, zoom })
  const page = await context.newPage()
  await page.goto(url)
  await page.waitForSelector('.map-splash.ready', { timeout: 60_000 })
  await page.waitForSelector('.location-pin')
  await page.getByRole('button', { name: 'Pauzeren' }).first().click().catch(() => undefined)
  await page.waitForTimeout(2_000)
  for (const variant of ['voor', 'na']) {
    const handle = variant === 'voor' ? await page.addStyleTag({ content: revert }) : undefined
    await page.waitForTimeout(300)
    const measured = await page.evaluate(() => {
      const svg = document.querySelector('.location-pin svg').getBoundingClientRect()
      const element = document.querySelector('.location-pin')
      const box = element.getBoundingClientRect()
      return { tip: [svg.left + svg.width / 2, svg.bottom], svg: [svg.width, svg.height], element: [box.width, box.height], transform: element.style.transform }
    })
    const [x, y] = measured.tip
    const clip = { x: Math.round(x - 24), y: Math.round(y - 50), width: 48, height: 58 }
    const file = join(out, `pin-z${zoom}-${variant}-1x.png`)
    await page.screenshot({ path: file, clip })
    results.push({ zoom, variant, ...measured })
    if (handle) await handle.evaluate((node) => node.remove())
  }
  await context.close()
}
// 200 %: dezelfde crops pixelgetrouw vergroot, voor/na naast elkaar per zoom.
const page = await browser.newPage({ viewport: { width: 480, height: 300 }, deviceScaleFactor: 1 })
for (const zoom of [7.3, 8.7]) {
  const img = (variant) => `data:image/png;base64,${readFileSync(join(out, `pin-z${zoom}-${variant}-1x.png`)).toString('base64')}`
  await page.setContent(`<body style="margin:0;background:#fff;font:12px sans-serif;display:flex;gap:16px;padding:8px">
    ${['voor', 'na'].map((variant) => `<figure style="margin:0"><img src="${img(variant)}" style="width:96px;height:116px;image-rendering:pixelated;outline:1px solid #ccc"><figcaption>z${zoom} ${variant}</figcaption></figure>`).join('')}</body>`)
  await page.screenshot({ path: join(out, `pin-z${zoom}-200pct.png`), fullPage: false, clip: { x: 0, y: 0, width: 240, height: 150 } })
}
await browser.close()
console.log(JSON.stringify(results, null, 1))
