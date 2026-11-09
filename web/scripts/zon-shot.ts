import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// Lucht-grafiek rond zon onder, per ?dev&zonmerk-variant op hetzelfde moment, telefoon en desktop (U103).
// TIME is een ISO-tijd of een preset zoals +2u; de worker bekijkt de beelden zelf.
const [origin, outDir, time = '+2u', ...variants] = process.argv.slice(2)
if (!origin || !outDir) throw new Error('usage: pnpm exec tsx scripts/zon-shot.ts ORIGIN OUT_DIR [TIME] [VARIANT…]')
mkdirSync(outDir, { recursive: true })
const devices = {
  telefoon: { viewport: { width: 402, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
}
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
for (const [device, options] of Object.entries(devices)) {
  const context = await browser.newContext({ ...options, locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', reducedMotion: 'reduce', serviceWorkers: 'block' })
  for (const variant of variants.length ? variants : ['huidig', 'tijd', 'weg']) {
    const page = await context.newPage()
    page.setDefaultTimeout(90_000)
    const url = new URL('/', origin)
    url.searchParams.set('dev', '')
    url.searchParams.set('modus', 'lucht')
    url.searchParams.set('t', time)
    url.searchParams.set('zonmerk', variant)
    // Vaste plek: zonder plek kiest de app er per laad een, en dan verschilt de tijd van zon onder per beeld.
    url.searchParams.set('plaats', 'De Bilt')
    url.searchParams.set('lat', '52.1')
    url.searchParams.set('lon', '5.18')
    await page.goto(url.href)
    await page.locator('.sun-bars path').first().waitFor({ state: 'attached' })
    // De zonnecurve hangt aan de straling, die na de eerste frames binnenkomt.
    await page.waitForTimeout(6_000)
    // Een link met tijd opent het actualiteitsvenster; dat dekt op de telefoon de grafiek af.
    await page.keyboard.press('Escape')
    await page.waitForTimeout(500)
    const path = join(outDir, `zonmerk-${variant}-${device}.png`)
    await page.locator('.chart-plot').first().screenshot({ path })
    await page.screenshot({ path: join(outDir, `zonmerk-${variant}-${device}-heel.png`) })
    console.log('zon', path)
    await page.close()
  }
  await context.close()
}
await browser.close()
