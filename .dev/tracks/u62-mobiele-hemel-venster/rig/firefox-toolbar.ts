// U62: de adresbalkbug in Firefox (Gecko) zelf. Tabel openscrollen, dan de schermhoogte wijzigen zoals een
// adresbalk die verschijnt of verdwijnt, en meten waar het tabelpaneel staat en wat de viewport-eenheden doen.
// Gebruik: pnpm exec tsx tmp/u62/firefox-toolbar.ts <baseURL> <label>
import { firefox } from '@playwright/test'
import { mkdirSync } from 'node:fs'
const [baseURL = 'http://127.0.0.1:4320', label = 'firefox'] = process.argv.slice(2)
const outputDir = new URL('./out/', import.meta.url).pathname
mkdirSync(outputDir, { recursive: true })
// Zonder GPU: WebGL via de softwarerenderer, anders komt de kaart (en dus de splash) nooit klaar.
const browser = await firefox.launch({ firefoxUserPrefs: { 'webgl.force-enabled': true, 'webgl.disabled': false, 'gfx.webrender.software': true, 'layers.acceleration.force-enabled': true } })
const TOOLBAR_PX = 56
const read = `(() => {
  const panel = document.querySelector('.forecast-panel').getBoundingClientRect()
  const probe = (unit) => { const element = document.createElement('div'); element.style.cssText = 'position:fixed;top:0;height:100' + unit + ';width:0;visibility:hidden'; document.body.append(element); const height = element.getBoundingClientRect().height; element.remove(); return Math.round(height) }
  return { panelTop: Math.round(panel.top), panelHeight: Math.round(panel.height), innerHeight, visual: Math.round(visualViewport.height), scrollY: Math.round(scrollY), maxScroll: Math.round(document.documentElement.scrollHeight - innerHeight), dvh: probe('dvh'), svh: probe('svh'), lvh: probe('lvh'), open: document.querySelector('.app-shell').classList.contains('table-view-open'), snap: getComputedStyle(document.documentElement).scrollSnapType }
})()`
for (const [name, startHeight, endHeight] of [['balk-verschijnt', 844, 844 - TOOLBAR_PX], ['balk-verdwijnt', 844 - TOOLBAR_PX, 844]] as const) {
  const context = await browser.newContext({ viewport: { width: 390, height: startHeight }, hasTouch: true, userAgent: 'Mozilla/5.0 (Android 14; Mobile; rv:131.0) Gecko/131.0 Firefox/131.0' })
  const page = await context.newPage()
  await page.goto(`${baseURL}/weer`)
  const mapReady = await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 25_000 }).then(() => true, () => false)
  await page.locator('tr.current-hour').waitFor({ state: 'attached', timeout: 60_000 })
  await page.getByRole('button', { name: 'Tabel' }).click()
  await page.waitForTimeout(2_000)
  const before = await page.evaluate(read)
  await page.setViewportSize({ width: 390, height: endHeight })
  await page.waitForTimeout(1_500)
  const after = await page.evaluate(read)
  await page.screenshot({ path: `${outputDir}${label}-${name}.png` })
  console.log(`${name} (kaart klaar: ${mapReady}): vóór ${JSON.stringify(before)}\n   ná ${JSON.stringify(after)}`)
  await context.close()
}
await browser.close()
