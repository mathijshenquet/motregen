/// <reference lib="dom" />
// Maakt public/og-image.png (1200×630) uit een screenshot van de kaart.
// Gebruik: pnpm tsx scripts/og-image.ts [url]   (default https://motregen.nl/)
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'

const url = process.argv[2] ?? 'https://motregen.nl/'
const droplet = readFileSync(new URL('../public/droplet.svg', import.meta.url), 'utf8')

const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, colorScheme: 'light' })
await page.goto(url)
await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
await page.addStyleTag({ content: `
  .app-shell { grid-template-columns: minmax(0, 1fr) !important; }
  .dashboard, .search, .map-clock, .map-brand, .maplibregl-ctrl-top-right, .maplibregl-ctrl-bottom-right { display: none !important; }
  .og-card { position: absolute; left: 36px; top: 36px; z-index: 50; display: flex; align-items: center; gap: 22px;
    padding: 26px 34px 26px 28px; border-radius: 22px; background: rgba(255, 255, 255, .94); color: #0d2630;
    box-shadow: 0 12px 40px rgba(13, 38, 48, .22); font-family: system-ui, sans-serif; }
  .og-card svg { width: 58px; height: 68px; flex: none; }
  .og-card b { display: block; font-size: 50px; line-height: 1; letter-spacing: -.02em; }
  .og-card span { display: block; margin-top: 10px; font-size: 22px; color: #3d5a64; }
` })
await page.evaluate((svg) => {
  const card = document.createElement('div')
  card.className = 'og-card'
  card.innerHTML = `${svg}<div><b>motregen.nl</b><span>Regenradar en verwachting voor Nederland en Vlaanderen</span></div>`
  document.querySelector('.map-shell')!.append(card)
}, droplet)
// Kaart laten herschalen naar de volle breedte en de windsporen laten opbouwen.
await page.waitForTimeout(5_000)
await page.screenshot({ path: new URL('../public/og-image.png', import.meta.url).pathname })
await browser.close()
