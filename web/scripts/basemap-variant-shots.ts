import { chromium, type Browser } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// U108: de `?dev&kaart=`-varianten van de basiskaart naast elkaar. Per variant zoom 6/7/8/10 op telefoon en
// desktop, licht en donker, plus Gevoel en Wind op z7; daarna koude kaartbytes op de telefoon (startbeeld).
// De worker bekijkt de beelden zelf. Gebruik: pnpm exec tsx scripts/basemap-variant-shots.ts ORIGIN OUT_DIR [variant…]
const [origin, outDir, ...requested] = process.argv.slice(2)
if (!origin || !outDir) throw new Error('usage: pnpm exec tsx scripts/basemap-variant-shots.ts ORIGIN OUT_DIR [variant…]')
const variants = requested.length ? requested : ['nu', 'licht', 'licht-rivieren', 'atlas', 'strak']
mkdirSync(outDir, { recursive: true })

const DEVICES = {
  telefoon: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true },
  desktop: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 },
} as const
// Rivierland rond Waal/Lek/Maas: daar viel de oude kaart uiteen.
// Plus de Wadden op z7/z8 (PO-bug strak: eilanden weg).
const VIEWS: Array<{ zoom: number; lng: number; lat: number; tag?: string }> = [
  { zoom: 6, lng: 5.3, lat: 52.2 },
  { zoom: 7, lng: 5.3, lat: 52.0 },
  { zoom: 8, lng: 5.5, lat: 51.9 },
  { zoom: 10, lng: 5.25, lat: 51.93 },
  { zoom: 7, lng: 5.4, lat: 53.2, tag: 'wadden' },
  { zoom: 8, lng: 5.6, lat: 53.35, tag: 'wadden' },
]
const MODES = ['Gevoel', 'Wind']

const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })

async function shoot(browser: Browser, variant: string, device: keyof typeof DEVICES, theme: 'light' | 'dark', view: typeof VIEWS[number], mode?: string) {
  const context = await browser.newContext({ ...DEVICES[device], serviceWorkers: 'block', locale: 'nl-NL', timezoneId: 'Europe/Amsterdam' })
  await context.addInitScript(({ theme, view }) => {
    localStorage.setItem('motregen-theme', theme)
    // Vast licht of donker: anders volgt de kaart na zonsondergang de kaarttijd.
    localStorage.setItem('motregen-expressive', 'off')
    localStorage.setItem('motregen-map-view', JSON.stringify({ zoom: view.zoom, lng: view.lng, lat: view.lat }))
  }, { theme, view })
  const page = await context.newPage()
  page.setDefaultTimeout(90_000)
  await page.goto(new URL(`/?dev&kaart=${variant}`, origin).href)
  await page.locator('.map-splash.ready').waitFor({ state: 'attached' })
  await page.addStyleTag({ content: '.dev-panel { display: none !important; }' })
  if (mode) await page.getByRole('button', { name: mode, exact: true }).first().click()
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2500)
  const name = `${variant}-${device}-${theme}-z${view.zoom}${view.tag ? `-${view.tag}` : ''}${mode ? `-${mode.toLowerCase()}` : ''}.png`
  await page.locator('.map-shell').screenshot({ path: join(outDir, name) })
  await context.close()
  return name
}

// Koud laden op de telefoon: alle requests van de context (ook uit workers), kaarttegels apart geteld.
async function coldMapBytes(browser: Browser, variant: string, view?: typeof VIEWS[number]) {
  const context = await browser.newContext({ ...DEVICES.telefoon, serviceWorkers: 'block' })
  if (view) await context.addInitScript((view) => localStorage.setItem('motregen-map-view', JSON.stringify({ zoom: view.zoom, lng: view.lng, lat: view.lat })), view)
  let tiles = 0
  let styles = 0
  let requests = 0
  context.on('requestfinished', async (request) => {
    const size = (await request.sizes()).responseBodySize
    if (/\/data\/basemap\/nl-[0-9a-f]{16}\.pmtiles/.test(request.url())) { tiles += size; requests++ }
    if (/\/(basemap|dev-kaart)\/[^/]+\.json/.test(request.url())) styles += size
  })
  const page = await context.newPage()
  await page.goto(new URL(`/?dev&kaart=${variant}`, origin).href)
  await page.locator('.map-splash.ready').waitFor({ state: 'attached' })
  await page.waitForLoadState('networkidle')
  await page.waitForTimeout(2500)
  await context.close()
  return { variant, view: view ? `z${view.zoom}` : 'start', tileBytes: tiles, rangeRequests: requests, styleBytes: styles }
}

for (const variant of process.env.SKIP_SHOTS ? [] : variants) {
  for (const device of Object.keys(DEVICES) as Array<keyof typeof DEVICES>) {
    for (const theme of ['light', 'dark'] as const) {
      for (const view of VIEWS) console.log(await shoot(browser, variant, device, theme, view))
      if (device === 'desktop') for (const mode of MODES) console.log(await shoot(browser, variant, device, theme, VIEWS[1]!, mode))
    }
  }
}
if (!process.env.SKIP_SHOTS || process.env.BYTES) {
  for (const view of [undefined, VIEWS[1], VIEWS[2]]) for (const variant of variants) console.log(JSON.stringify(await coldMapBytes(browser, variant, view)))
}
await browser.close()
