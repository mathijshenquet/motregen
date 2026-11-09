import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// Windmodus (track U101) op één tijdstip: per variant een telefoon- en desktopbeeld plus een tabeluitsnede, zodat de
// PO kan kiezen. De worker bekijkt deze zelf.
// usage: pnpm exec tsx scripts/wind-variant-shot.ts ORIGIN OUT_DIR TIJD [NAAM[:DEV-QUERY]...]
//   TIJD in de lokale vorm van ?t= (bv. 2026-11-09T1500); een variant is een naam met eventueel dev-knoppen,
//   bv. `stroom:kromming=stroom` of `storm:windfactor=2.5`. Zonder varianten alleen de default.
const [origin, outDir, time, ...requested] = process.argv.slice(2)
if (!origin || !outDir || !time) throw new Error('usage: pnpm exec tsx scripts/wind-variant-shot.ts ORIGIN OUT_DIR TIJD [NAAM[:DEV-QUERY]...]')
const variants = (requested.length ? requested : ['windzak']).map((entry) => {
  const [name, query] = entry.split(':')
  return { name: name!, query: query ? `&${query}` : '' }
})
mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const allViewports = {
  telefoon: { viewport: { width: 402, height: 844 }, deviceScaleFactor: 3, hasTouch: true, isMobile: true },
  desktop: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
}
// SHOT_DEVICES=desktop beperkt de beelden; SHOT_THEME=dark kiest het donkere thema.
const wanted = process.env.SHOT_DEVICES?.split(',')
const viewports = Object.fromEntries(Object.entries(allViewports).filter(([name]) => !wanted || wanted.includes(name)))
for (const variant of variants) {
  for (const [name, device] of Object.entries(viewports)) {
    const context = await browser.newContext({ ...device, timezoneId: 'Europe/Amsterdam', reducedMotion: 'reduce', colorScheme: process.env.SHOT_THEME === 'dark' ? 'dark' : 'light' })
    const page = await context.newPage()
    page.setDefaultTimeout(120_000)
    await page.goto(new URL(`/wind?dev${variant.query}&t=${time}`, origin).href)
    await page.locator('.map-splash.ready').waitFor({ state: 'attached' })
    await page.locator('.scrubber-placeholder').waitFor({ state: 'detached' })
    // ?t= opent het actualiteitspaneel; dicht, en het dev-paneel ingeklapt, zodat de kaart vrij is.
    await page.locator('.freshness-close').click()
    await page.locator('details:has(> summary:text-is("Dev-opties"))').evaluate((element) => { (element as HTMLDetailsElement).open = false })
    await page.locator('.map-overlay-windsocks[data-socks]').waitFor({ state: 'attached' })
    // Deeltjes en vulsnede hebben een paar seconden nodig om op te bouwen.
    await page.waitForTimeout(6_000)
    const socks = await page.locator('.map-overlay-windsocks').getAttribute('data-socks')
    const path = join(outDir, `${variant.name}-${name}.png`)
    await page.screenshot({ path })
    console.log(`${path} zakken|max-Bft=${socks}`)
    if (name === 'desktop') {
      // Tien rijen windcellen met hun tijden: dagrijen en de donkere avondrijen.
      const table = await page.locator('.forecast-table').boundingBox()
      const readings = page.locator('.forecast-table .wind-reading')
      const first = await readings.nth(0).boundingBox(), last = await readings.nth(9).boundingBox()
      if (table && first && last) {
        const tablePath = join(outDir, `${variant.name}-tabel.png`)
        const top = first.y - 18, bottom = last.y + last.height + 18
        await page.screenshot({ path: tablePath, clip: { x: table.x, y: top, width: table.width, height: bottom - top } })
        console.log(tablePath)
      }
    }
    await context.close()
  }
}
await browser.close()
