// U62-experiment: de basiskaart die met de kaarttijd van dag naar nacht tweent (?dev → Chrome → Kaart →
// automatisch). Schermbeelden op een reeks tijdstippen, 390 px en desktop, plus de stand van de menging.
// Gebruik: pnpm exec tsx tmp/u62/map-night-shots.ts <baseURL> <label> <HH:MM,...>
import { chromium, devices } from '@playwright/test'
import { mkdirSync } from 'node:fs'

const [baseURL = 'http://127.0.0.1:4320', label = 'kaart', timesArgument = '18:00,19:00,19:20,20:00,23:00,06:00,07:40'] = process.argv.slice(2)
const outputDir = new URL('./out/', import.meta.url).pathname
mkdirSync(outputDir, { recursive: true })
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
// Vandaag in Nederland; uren vóór nu vallen op morgen (de tijdlijn loopt vooruit).
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date())
const nowClock = new Intl.DateTimeFormat('nl-NL', { timeZone: 'Europe/Amsterdam', hour: '2-digit', minute: '2-digit' }).format(new Date())
const tomorrow = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date(Date.now() + 86_400_000))
for (const device of ['390', 'desktop'] as const) {
  const context = await browser.newContext(device === '390' ? { ...devices['Pixel 5'], viewport: { width: 390, height: 844 } } : { viewport: { width: 1280, height: 800 } })
  await context.addInitScript(() => localStorage.setItem('motregen-dev-kaart-automatisch', 'aan'))
  const page = await context.newPage()
  for (const time of timesArgument.split(',')) {
    const day = time < nowClock ? tomorrow : today
    await page.goto(`${baseURL}/weer?dev#t=${day}T${time.replace(':', '')}`)
    await page.reload()
    await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
    // Sinds U57 opent een adres met een tijd de dataversheid; sluiten laat de tijd staan.
    await page.waitForTimeout(2_500)
    if (await page.locator('.freshness-dialog[open]').count()) {
      await page.keyboard.press('Escape')
      await page.locator('.freshness-dialog[open]').waitFor({ state: 'detached', timeout: 5_000 }).catch(() => undefined)
    }
    await page.evaluate(() => { document.querySelector('.dev-panel')?.removeAttribute('open'); (document.activeElement as HTMLElement | null)?.blur() })
    await page.waitForTimeout(7_000)
    const state = await page.evaluate(() => ({ night: document.querySelector<HTMLElement>('.map')?.dataset.mapNight ?? 'geen', clock: document.querySelector('.clock-map-time')?.textContent ?? '' }))
    await page.screenshot({ path: `${outputDir}${label}-${device}-${time.replace(':', '')}.png` })
    console.log(`${device} ${time}: klok ${state.clock}, nacht ${state.night}`)
  }
  await context.close()
}
await browser.close()
