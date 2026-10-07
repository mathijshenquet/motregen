import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// Hele pagina met Expressief aan en uit, plus het instellingenpaneel (track U58): de worker bekijkt dit
// zelf vóór "klaar, herlaad". Desktop en 390 px.
const [origin, outDir] = process.argv.slice(2)
if (!origin || !outDir) throw new Error('usage: pnpm exec tsx scripts/expressive-shot.ts ORIGIN OUT_DIR')
mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const viewports = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } }
for (const [name, viewport] of Object.entries(viewports)) {
  for (const state of ['on', 'off']) {
    const context = await browser.newContext({ viewport, deviceScaleFactor: 2, reducedMotion: 'reduce' })
    await context.addInitScript((value) => localStorage.setItem('motregen-expressive', value), state)
    const page = await context.newPage()
    page.setDefaultTimeout(150_000)
    await page.goto(new URL('/', origin).href)
    await page.locator('.map-splash.ready').waitFor({ state: 'attached' })
    await page.locator('.scrubber-placeholder').waitFor({ state: 'detached' })
    await page.locator('.forecast-table tr.day-hour, .forecast-table tr.night-hour').first().waitFor({ state: 'attached' })
    await page.waitForTimeout(1_500)
    const pagePath = join(outDir, `expressive-${state}-${name}.png`)
    await page.screenshot({ path: pagePath })
    console.log('still', pagePath)
    if (state === 'on') {
      await page.getByRole('button', { name: 'Over motregen en instellingen' }).click()
      await page.getByRole('button', { name: /Expressief/ }).waitFor()
      await page.waitForTimeout(400)
      const aboutPath = join(outDir, `about-${name}.png`)
      await page.screenshot({ path: aboutPath })
      console.log('still', aboutPath)
    }
    await context.close()
  }
}
await browser.close()
