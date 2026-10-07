import { chromium } from '@playwright/test'
import { writeFileSync } from 'node:fs'

// Neemt een Chrome-trace op van twee keer de zoekpil openen (track U58), in hetzelfde formaat als een
// DevTools-opname, zodat scripts/devtools-trace.ts er per frame stijl, layout, paint en gemiste frames uit
// leest. Print de tijdstippen van het openen voor --window.
// Gebruik: pnpm exec tsx scripts/search-trace.ts ORIGIN UIT.json [BREEDTExHOOGTE]
const [origin, output, size = '1280x800'] = process.argv.slice(2)
if (!origin || !output) throw new Error('usage: pnpm exec tsx scripts/search-trace.ts ORIGIN UIT.json [BREEDTExHOOGTE]')
const [width, height] = size.split('x').map(Number) as [number, number]
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const page = await (await browser.newContext({ viewport: { width, height } })).newPage()
await page.goto(new URL('/', origin).href)
await page.locator('.map-splash.ready').waitFor({ state: 'attached' })
await page.locator('.scrubber-placeholder').waitFor({ state: 'detached' })
await page.waitForTimeout(8_000)
await browser.startTracing(page, { categories: ['devtools.timeline', 'blink.animations', 'cc', 'benchmark', 'disabled-by-default-devtools.timeline', 'disabled-by-default-devtools.timeline.frame', 'toplevel', 'blink.user_timing'] })
for (let round = 0; round < 2; round++) {
  await page.waitForTimeout(600)
  await page.locator('.search-field').click()
  await page.waitForTimeout(900)
  await page.keyboard.press('Escape')
}
await page.waitForTimeout(400)
writeFileSync(output, await browser.stopTracing())
await browser.close()
console.log('trace', output)
