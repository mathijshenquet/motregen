import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// Beelden van een moduswissel direct na een koude start en van een sprong buiten het geladen
// venster (track U54): staat de kaartlaag van de nieuwe modus er, of is hij leeg/grijs? Trage
// lijn en hoofddraad zodat de tussenstanden blijven staan. De worker bekijkt deze zelf.
const [origin, outDir, label = 'modus', modeName = 'Gevoel'] = process.argv.slice(2)
if (!origin || !outDir) throw new Error('usage: pnpm exec tsx scripts/mode-shot.ts ORIGIN OUT_DIR [LABEL] [MODUSKNOP]')
mkdirSync(outDir, { recursive: true })
// SHOT_RENDERER_QUOTA remt hoofddraad én workers (zie PerformanceProfile.rendererCpuQuotaPercent): zonder trage
// decodes is de wachtrij leeg en valt er niets te zien.
const quota = Number(process.env.SHOT_RENDERER_QUOTA ?? 0)
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader', ...(quota > 0 ? [`--renderer-cmd-prefix=systemd-run --user --scope --quiet -p CPUQuota=${quota}% -p CPUQuotaPeriodSec=5ms --`] : [])] })
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
const page = await context.newPage()
page.setDefaultTimeout(120_000)
const cdp = await context.newCDPSession(page)
await cdp.send('Network.enable')
await cdp.send('Network.setCacheDisabled', { cacheDisabled: true })
await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 60, downloadThroughput: 9 * 125_000, uploadThroughput: 1.5 * 125_000 })
if (quota === 0) await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })
await page.goto(new URL('/?t=%2B0u', origin).href, { waitUntil: 'commit' })
// Zodra de splash weg is meteen wisselen: de uurvelden van de nieuwe modus zijn dan nog niet binnen.
await page.locator('.map-splash.ready').waitFor({ state: 'attached' })
const shoot = async (name: string) => { await page.locator('.map-shell').screenshot({ path: join(outDir, `${label}-${name}.png`) }) }
await page.getByRole('button', { name: modeName, exact: true }).click()
const clickedAt = Date.now()
for (const moment of [300, 1000, 2500, 6000, 15000]) {
  const wait = moment - (Date.now() - clickedAt)
  if (wait > 0) await page.waitForTimeout(wait)
  await shoot(`wissel-${String(moment).padStart(5, '0')}`)
}
// Ver vooruit springen: 20 uur, buiten het venster dat rond nu geladen is.
const slider = page.getByRole('slider', { name: 'Tijd' })
for (let step = 0; step < 40; step++) await slider.press('PageUp')
const jumpedAt = Date.now()
for (const moment of [300, 1000, 2500, 6000]) {
  const wait = moment - (Date.now() - jumpedAt)
  if (wait > 0) await page.waitForTimeout(wait)
  await shoot(`sprong-${String(moment).padStart(5, '0')}`)
}
await browser.close()
console.log(`Modusbeelden: ${outDir}/${label}-*.png`)
