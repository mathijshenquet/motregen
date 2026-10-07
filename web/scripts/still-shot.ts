import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// Het still-beeld dat de Telegram-bot rendert, in beide beeldmaten (track U58): de worker bekijkt dit zelf
// vóór "bot klaar voor herstart". Zelfde viewport en schaal als FRAMES in bot/config.ts.
const [origin, outDir] = process.argv.slice(2)
if (!origin || !outDir) throw new Error('usage: pnpm exec tsx scripts/still-shot.ts ORIGIN OUT_DIR')
mkdirSync(outDir, { recursive: true })
const frames = { portrait: { width: 640, height: 848, scale: 1.5 }, landscape: { width: 800, height: 500, scale: 1.6 } }
const manifest = await (await fetch(new URL('/data/manifest.json', origin))).json() as { now: string }
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
for (const [name, frame] of Object.entries(frames)) {
  const context = await browser.newContext({ viewport: { width: frame.width, height: frame.height }, deviceScaleFactor: frame.scale, locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', reducedMotion: 'reduce', serviceWorkers: 'block' })
  for (const mode of ['weer', 'gevoel', 'wind']) {
    const page = await context.newPage()
    const url = new URL('/', origin)
    url.searchParams.set('modus', mode)
    url.searchParams.set('t', new Date(Date.parse(manifest.now) + 3_600_000).toISOString())
    url.searchParams.set('still', '1')
    await page.goto(url.href)
    await page.waitForFunction(() => {
      const map = document.querySelector<HTMLElement>('.map')
      return map?.dataset.stillReady === 'true' || Boolean(map?.dataset.stillError)
    }, undefined, { timeout: 150_000 })
    const error = await page.locator('.map').getAttribute('data-still-error')
    if (error) throw new Error(`${name}/${mode}: ${error}`)
    await page.waitForTimeout(1_000)
    const path = join(outDir, `still-${name}-${mode}.png`)
    await page.screenshot({ path })
    console.log('still', path)
    await page.close()
  }
  await context.close()
}
await browser.close()
