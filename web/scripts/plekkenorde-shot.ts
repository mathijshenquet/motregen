import { chromium, type Page } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Plekkenorde (U114, MIP-43): telefoon en desktop, uitgezoomd en 1–2 zoomstappen in, Weer/Gevoel/Wind, licht,
// met een pin op Utrecht; per still het aantal namen, getallen en zakken in counts.json.
// usage: pnpm exec tsx scripts/plekkenorde-shot.ts ORIGIN OUT_DIR [EXTRA-QUERY] [TIJD-ISO]
//   SHOT_MODES=wind,gevoel, SHOT_PROFILES=telefoon en SHOT_STEPS=0,2 beperken de matrix.
const [origin, outDir, extra = '', fixedTime] = process.argv.slice(2)
if (!origin || !outDir) throw new Error('usage: pnpm exec tsx scripts/plekkenorde-shot.ts ORIGIN OUT_DIR [EXTRA-QUERY] [TIJD-ISO]')
mkdirSync(outDir, { recursive: true })

const profiles = {
  telefoon: { viewport: { width: 402, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
}
const pick = <T extends string>(all: readonly T[], env?: string) => env ? all.filter((value) => env.split(',').includes(value)) : [...all]
const modes = pick(['weer', 'gevoel', 'wind'], process.env.SHOT_MODES)
const steps = (process.env.SHOT_STEPS ?? '0,2').split(',').map(Number)
const UTRECHT = { lng: 5.12, lat: 52.09 }

const manifest = await (await fetch(new URL('/data/manifest.json', origin))).json() as { now: string }
const time = fixedTime ?? new Date(Math.round((Date.parse(manifest.now) + 3_600_000) / 600_000) * 600_000).toISOString()
console.log('kaarttijd', time)
const counts: Record<string, unknown> = {}
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
for (const profileName of pick(Object.keys(profiles) as Array<keyof typeof profiles>, process.env.SHOT_PROFILES)) {
  const context = await browser.newContext({ ...profiles[profileName], colorScheme: 'light', locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', serviceWorkers: 'block' })
  await context.addInitScript(() => { localStorage.setItem('motregen-theme', 'light') })
  for (const mode of modes) {
    const page = await context.newPage()
    page.setDefaultTimeout(120_000)
    page.on('pageerror', (error) => console.log('pageerror', mode, profileName, error.message.slice(0, 200)))
    await page.goto(new URL(`/${mode}/utrecht?t=${encodeURIComponent(time)}${extra ? `&${extra}` : ''}`, origin).href)
    await settle(page)
    // Zoom 0 wordt door de kaartbegrenzing de overzichtszoom.
    await jump(page, UTRECHT.lng, 52.2, 0)
    const overview = (await page.evaluate(() => (window as unknown as { __motregenCamera: () => { zoom: number } }).__motregenCamera().zoom))
    for (const step of steps) {
      if (step) await jump(page, UTRECHT.lng, UTRECHT.lat, overview + step)
      const name = `${mode}-${profileName}-z${step}`
      await page.locator('.map-shell').screenshot({ path: join(outDir, `${name}.png`) })
      counts[name] = await retry(() => page.evaluate(() => ({
        ...(window as unknown as { __motregenRenderedLabels: () => object }).__motregenRenderedLabels(),
        numbers: document.querySelectorAll('.temperature-number').length,
        socks: Number(document.querySelector<HTMLElement>('.map-overlay-windsocks')?.dataset.socks?.split('|')[0] ?? 0),
      })))
      console.log('shot', name, JSON.stringify(counts[name]))
    }
    await page.close()
  }
  await context.close()
}
await browser.close()
writeFileSync(join(outDir, 'counts.json'), `${JSON.stringify({ query: extra, time, counts }, null, 1)}\n`)

// queryRenderedFeatures gooit soms tijdens een lopende bronupdate (MapLibre, "Out of bounds"): even later opnieuw.
async function retry<T>(read: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await read()
    } catch (error) {
      if (attempt >= 4) throw error
      await new Promise((resolve) => setTimeout(resolve, 500))
    }
  }
}

async function jump(page: Page, lng: number, lat: number, zoom: number): Promise<void> {
  await page.evaluate(([lng, lat, zoom]) => (window as unknown as { __motregenJumpTo: (lng: number, lat: number, zoom: number) => void }).__motregenJumpTo(lng!, lat!, zoom!), [lng, lat, zoom])
  // Getallen en zakken delen opnieuw in als de kaart stilvalt; namen en temperaturen na zoomend.
  await page.waitForTimeout(3_000)
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
