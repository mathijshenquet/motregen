import { chromium, type Page } from '@playwright/test'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Plekkenorde (U114, PO-bevindingen 2026-11-10): dezelfde beelden vóór en na de monotonie-ronde. Per beeld de
// zichtbare plekken (getallen in Gevoel, zakken in Wind, labels in Weer) in counts.json.
// usage: pnpm exec tsx scripts/plekkenorde-monotoon-shot.ts ORIGIN OUT_DIR
//   SHOT_ONLY=po-uit,zeeland beperkt tot die beelden.
const [origin, outDir] = process.argv.slice(2)
if (!origin || !outDir) throw new Error('usage: pnpm exec tsx scripts/plekkenorde-monotoon-shot.ts ORIGIN OUT_DIR')
rmSync(outDir, { recursive: true, force: true })
mkdirSync(outDir, { recursive: true })

const DAY = '2026-11-10T11:00:00.000Z'
const NIGHT = '2026-11-10T20:00:00.000Z'
// Kaart ≈ 760 × 650 css-px op desktop (de schermafdrukken van de PO), 970 × 900 voor de overige desktopbeelden.
const SMALL = { width: 1230, height: 700 }
const DESKTOP = { width: 1440, height: 900 }
const PHONE = { width: 402, height: 844 }

interface Shot {
  name: string
  mode: 'weer' | 'gevoel' | 'wind'
  pin: string
  query: string
  time: string
  viewport: { width: number; height: number }
  /** Middelpunt en zoomstappen boven het overzicht. */
  at: [number, number, number]
}

const D = 'dev&plekken=orde&namen=samen'
const shots: Shot[] = [
  ...(['weer', 'wind'] as const).flatMap((mode) => ([['donker', NIGHT], ['licht', DAY]] as const).flatMap(([theme, time]): Shot[] => [
    { name: `po-uit-${mode}-${theme}`, mode, pin: 'utrecht', query: D, time, viewport: SMALL, at: [4.95, 52.0, 1.5] },
    { name: `po-in-${mode}-${theme}`, mode, pin: 'utrecht', query: D, time, viewport: SMALL, at: [4.62, 52.02, 2.5] },
  ])),
  ...(['gevoel', 'wind'] as const).flatMap((mode): Shot[] => [
    { name: `pin-eindhoven-${mode}`, mode, pin: 'eindhoven', query: D, time: DAY, viewport: DESKTOP, at: [5.47, 51.44, 3] },
    { name: `pin-elders-${mode}`, mode, pin: 'utrecht', query: D, time: DAY, viewport: DESKTOP, at: [5.47, 51.44, 3] },
  ]),
  ...(['wind', 'gevoel'] as const).flatMap((mode): Shot[] => [
    { name: `zeeland-${mode}`, mode, pin: 'utrecht', query: D, time: DAY, viewport: DESKTOP, at: [3.75, 51.5, 2.5] },
    { name: `zeeland-dicht-${mode}`, mode, pin: 'utrecht', query: D, time: DAY, viewport: DESKTOP, at: [3.6, 51.45, 3.5] },
    { name: `kop-nh-${mode}`, mode, pin: 'utrecht', query: D, time: DAY, viewport: DESKTOP, at: [4.85, 52.95, 2.5] },
    { name: `wadden-${mode}`, mode, pin: 'utrecht', query: D, time: DAY, viewport: DESKTOP, at: [5.4, 53.3, 2] },
    { name: `zeeland-telefoon-${mode}`, mode, pin: 'utrecht', query: D, time: DAY, viewport: PHONE, at: [3.75, 51.5, 2] },
  ]),
  ...(['gevoel', 'wind'] as const).map((mode): Shot => (
    { name: `te-leeg-${mode}`, mode, pin: 'utrecht', query: `${D}&dichtheid=veel`, time: DAY, viewport: { width: 1185, height: 1000 }, at: [5.3, 51.92, 3] })),
]
const only = process.env.SHOT_ONLY?.split(',')

const counts: Record<string, unknown> = {}
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
for (const shot of shots) {
  if (only && !only.some((prefix) => shot.name.startsWith(prefix))) continue
  const phone = shot.viewport.width < 600
  const context = await browser.newContext({
    viewport: shot.viewport, deviceScaleFactor: phone ? 2 : 1, isMobile: phone, hasTouch: phone,
    colorScheme: 'light', locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', serviceWorkers: 'block',
  })
  const page = await context.newPage()
  page.setDefaultTimeout(120_000)
  page.on('pageerror', (error) => console.log('pageerror', shot.name, error.message.slice(0, 200)))
  await page.goto(new URL(`/${shot.mode}/${shot.pin}?t=${encodeURIComponent(shot.time)}&${shot.query}`, origin).href)
  await settle(page)
  await jump(page, 5.12, 52.2, 0)
  const overview = await page.evaluate(() => (window as unknown as { __motregenCamera: () => { zoom: number } }).__motregenCamera().zoom)
  const [lng, lat, step] = shot.at
  await jump(page, lng, lat, overview + step)
  await page.locator('.map-shell').screenshot({ path: join(outDir, `${shot.name}.png`) })
  counts[shot.name] = await page.evaluate(() => ({
    zoom: (window as unknown as { __motregenCamera: () => { zoom: number } }).__motregenCamera().zoom,
    numbers: Array.from(document.querySelectorAll('.temperature-number'), (element) => element.textContent),
    socks: document.querySelector<HTMLElement>('.map-overlay-windsocks')?.dataset.placed ?? document.querySelector<HTMLElement>('.map-overlay-windsocks')?.dataset.socks,
  }))
  console.log('shot', shot.name, JSON.stringify(counts[shot.name]))
  await context.close()
}
await browser.close()
writeFileSync(join(outDir, 'counts.json'), `${JSON.stringify({ origin, counts }, null, 1)}\n`)

async function jump(page: Page, lng: number, lat: number, zoom: number): Promise<void> {
  await page.evaluate(([lng, lat, zoom]) => (window as unknown as { __motregenJumpTo: (lng: number, lat: number, zoom: number) => void }).__motregenJumpTo(lng!, lat!, zoom!), [lng, lat, zoom])
  await page.waitForTimeout(3_500)
  await page.mouse.move(5, 5)
}

async function settle(page: Page): Promise<void> {
  await page.locator('.map-splash.ready').waitFor({ state: 'attached' })
  await page.addStyleTag({ content: '.dev-panel { display: none !important; }' })
  await page.locator('.scrubber-placeholder').waitFor({ state: 'detached' })
  const close = page.locator('.freshness-close')
  if (await close.isVisible().catch(() => false)) await close.click()
  await page.mouse.move(5, 5)
}
