import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// Beelden van de koude start op vaste momenten (track U54): wat staat er op het scherm terwijl
// de data nog komt? Desktop en 390 px, met een trage lijn en hoofddraad zodat de tussenstanden
// lang genoeg blijven staan om te fotograferen. De worker bekijkt deze zelf vóór elk "klaar".
const [origin, outDir, label = 'laden', moments = '350,800,1400,2200,3500,6000'] = process.argv.slice(2)
if (!origin || !outDir) throw new Error('usage: pnpm exec tsx scripts/load-shot.ts ORIGIN OUT_DIR [LABEL] [MOMENTEN_MS]')
mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const viewports = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } }
for (const [name, viewport] of Object.entries(viewports)) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: name === 'mobile', isMobile: name === 'mobile' })
  const page = await context.newPage()
  const cdp = await context.newCDPSession(page)
  await cdp.send('Network.enable')
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
  await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 125_000, uploadThroughput: 750_000 / 8 })
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
  // MANIFEST_DELAY_MS houdt het manifest vast: zo is de fase "nog geen tijdlijn" te fotograferen.
  const manifestDelay = Number(process.env.MANIFEST_DELAY_MS ?? 0)
  if (manifestDelay > 0) await page.route('**/data/manifest.json*', async (route) => { await new Promise((resolve) => setTimeout(resolve, manifestDelay)); await route.continue() })
  const startedAt = Date.now()
  await page.goto(new URL('/', origin).href, { waitUntil: 'commit' })
  for (const moment of moments.split(',').map(Number)) {
    const wait = moment - (Date.now() - startedAt)
    if (wait > 0) await page.waitForTimeout(wait)
    await page.screenshot({ path: join(outDir, `${label}-${name}-${String(moment).padStart(5, '0')}.png`) })
  }
  await context.close()
}
await browser.close()
console.log(`Laadbeelden: ${outDir}/${label}-*.png`)
