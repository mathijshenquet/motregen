import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// Windmodus-varianten (track U101) naast elkaar: per `?dev&wind=<variant>` een telefoon- en desktopbeeld op
// hetzelfde tijdstip, zodat de PO kan kiezen. De worker bekijkt deze zelf.
// usage: pnpm exec tsx scripts/wind-variant-shot.ts ORIGIN OUT_DIR TIJD [VARIANT...]
//   TIJD in de lokale vorm van ?t= (bv. 2026-11-09T1500); zonder varianten alle vier plus de huidige windmodus.
const [origin, outDir, time, ...requested] = process.argv.slice(2)
if (!origin || !outDir || !time) throw new Error('usage: pnpm exec tsx scripts/wind-variant-shot.ts ORIGIN OUT_DIR TIJD [VARIANT...]')
const variants = requested.length ? requested : ['huidig', 'vlakken', 'vlakken-zonder-deeltjes', 'lijnen', 'pijlen']
mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const allViewports = {
  telefoon: { viewport: { width: 402, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
}
// SHOT_DEVICES=desktop beperkt de beelden (zoeken naar een winderig tijdstip).
const wanted = process.env.SHOT_DEVICES?.split(',')
const viewports = Object.fromEntries(Object.entries(allViewports).filter(([name]) => !wanted || wanted.includes(name)))
for (const variant of variants) {
  for (const [name, device] of Object.entries(viewports)) {
    const context = await browser.newContext({ ...device, timezoneId: 'Europe/Amsterdam', reducedMotion: 'reduce' })
    const page = await context.newPage()
    page.setDefaultTimeout(120_000)
    const query = variant === 'huidig' ? `?dev&t=${time}` : `?dev&wind=${variant}&t=${time}`
    await page.goto(new URL(`/wind${query}`, origin).href)
    await page.locator('.map-splash.ready').waitFor({ state: 'attached' })
    await page.locator('.scrubber-placeholder').waitFor({ state: 'detached' })
    // ?t= opent het actualiteitspaneel; dicht, en het dev-paneel ingeklapt, zodat de kaart vrij is.
    await page.locator('.freshness-close').click()
    await page.locator('details:has(> summary:text-is("Dev-opties"))').evaluate((element) => { (element as HTMLDetailsElement).open = false })
    if (variant !== 'huidig') await page.locator('.wind-vane').first().waitFor({ state: 'attached' })
    // Deeltjes en vulsnede hebben een paar seconden nodig om op te bouwen.
    await page.waitForTimeout(6_000)
    const forces = (await page.locator('.wind-vane-disc').allInnerTexts()).map(Number)
    const vanes = forces.length ? `${forces.length} (${Math.min(...forces)}–${Math.max(...forces)} Bft)` : '0'
    const path = join(outDir, `${variant}-${name}.png`)
    await page.screenshot({ path })
    console.log(`${path} vaantjes=${vanes}`)
    await context.close()
  }
}
await browser.close()
