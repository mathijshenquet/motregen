import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// U100 ronde 3: dezelfde kaart op drie zooms naast elkaar, om te zien of temperatuurgetallen bij zoomen springen.
// Gebruik: pnpm exec tsx scripts/temperature-zoom-shot.ts ORIGIN OUT_DIR [LOOK] [TIJD]
const [origin, outDir, look = 'plekken-half', time = '+0u'] = process.argv.slice(2)
if (!origin || !outDir) throw new Error('usage: pnpm exec tsx scripts/temperature-zoom-shot.ts ORIGIN OUT_DIR [LOOK] [TIJD]')
mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch()
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
await page.goto(`${origin}/gevoel?dev&t=${encodeURIComponent(time)}&templabels=${look}`)
await page.locator('.map-splash.ready').waitFor({ state: 'attached' })
await page.locator('.dev-panel').evaluate((panel) => { (panel as HTMLDetailsElement).open = false; (panel as HTMLElement).style.display = 'none' })
await page.waitForSelector('.temperature-number', { timeout: 30_000 })
for (const zoom of [7, 7.25, 7.5, 7.75, 8]) {
  await page.evaluate((zoom) => (window as unknown as { __motregenJumpTo: (lng: number, lat: number, zoom: number) => void }).__motregenJumpTo(5.2, 52.1, zoom), zoom)
  await page.mouse.move(700, 880)
  await page.keyboard.press('Escape')
  await page.waitForTimeout(2500)
  const path = join(outDir, `zoom-${look}-${zoom.toFixed(2)}.png`)
  await page.locator('.maplibregl-map').first().screenshot({ path })
  console.log(path)
}
await browser.close()
