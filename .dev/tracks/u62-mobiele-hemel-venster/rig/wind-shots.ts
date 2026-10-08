// U62 stap 4-rig: de windstreepjes op een telefoon in de drie niveaus (uit/iets/meer), in Weer (wind op de
// achtergrond), op de kaart van heel Nederland met zee in beeld.
// Gebruik: pnpm exec tsx tmp/u62/wind-shots.ts <baseURL> <label>
import { chromium, devices } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const [baseURL = 'http://127.0.0.1:4320', label = 'wind'] = process.argv.slice(2)
const outputDir = new URL('./out/', import.meta.url).pathname
mkdirSync(outputDir, { recursive: true })
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
for (const device of ['390', 'desktop'] as const) {
  for (const level of ['uit', 'iets', 'meer'] as const) {
    const context = await browser.newContext(device === '390' ? { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } } : { viewport: { width: 1280, height: 800 } })
    await context.addInitScript((choice) => localStorage.setItem('motregen-dev-wind-mobiel', choice), level)
    const page = await context.newPage()
    await page.goto(`${baseURL}/weer?dev#t=+14u`)
    await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
    // De scrubber zelf: de klokpil is ook een slider en opent op een toets de dataversheid.
    const slider = page.locator('.scrub-surface')
    await page.waitForTimeout(3_000)
    if (await slider.getAttribute('data-playing') !== null) await slider.press(' ')
    // Sinds U57 opent een adres met een tijd (#t=) de dataversheid; sluiten laat de tijd staan.
    if (await page.locator('.freshness-dialog[open]').count()) {
      await page.keyboard.press('Escape')
      await page.locator('.freshness-dialog[open]').waitFor({ state: 'detached', timeout: 5_000 }).catch(() => undefined)
    }
    await page.evaluate(() => document.querySelector('.dev-panel')?.removeAttribute('open'))
    // De streepjes bouwen hun sporen over een paar seconden op.
    await page.waitForTimeout(9_000)
    const intensity = await page.locator('.map-shell').getAttribute('data-wind-intensity')
    const address = page.url().replace(baseURL, '')
    await page.locator('.map-shell').screenshot({ path: `${outputDir}${label}-${device}-${level}.png` })
    console.log(`${device} ${level}: data-wind-intensity ${intensity}, adres ${address}`)
    await context.close()
  }
}
await browser.close()
