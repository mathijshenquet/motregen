import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// Beelden van de zonneschijnduur in Lucht (track U96, MIP-38) op telefoon (402×844) en desktop. QUERY kiest plaats en
// tijd, bijvoorbeeld "lat=52.1&lon=5.18&t=2026-10-19T1300"; de modus staat altijd op Lucht. De worker bekijkt ze zelf.
const [origin, outDir, label = 'zon', query = ''] = process.argv.slice(2)
if (!origin || !outDir) throw new Error('usage: pnpm exec tsx scripts/sun-shot.ts ORIGIN OUT_DIR [LABEL] [QUERY]')
mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const viewports = { telefoon: { width: 402, height: 844 }, desktop: { width: 1280, height: 800 } }
for (const [name, viewport] of Object.entries(viewports)) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, reducedMotion: 'reduce', hasTouch: name === 'telefoon', isMobile: name === 'telefoon' })
  const page = await context.newPage()
  page.setDefaultTimeout(150_000)
  await page.goto(new URL(`/?modus=lucht&${query}`, origin).href)
  await page.locator('.map-splash.ready').waitFor({ state: 'attached' })
  const surface = page.locator('.scrub-surface')
  await page.locator('.scrub-surface[data-scrubber-view=air]').waitFor()
  await page.locator('[data-testid=cloud-section] .cloud-band path').first().waitFor({ state: 'attached' })
  await page.locator('.scrubber-placeholder').waitFor({ state: 'detached' })
  // Een toetsstap telt als interactie: pas dan leest de desktop de straling voor alle uren in (completeOnIntent).
  await surface.focus()
  if (await surface.getAttribute('data-playing') !== null) await surface.press(' ')
  await surface.press('ArrowRight')
  await surface.press('ArrowLeft')
  await surface.blur()
  if (await page.getByRole('dialog').count()) await page.keyboard.press('Escape')
  // De straling komt na de wolken binnen; geef de staven tijd (een nacht heeft er geen).
  await page.locator('.sun-bar').first().waitFor({ state: 'attached', timeout: 30_000 }).catch(() => console.log('geen zonstaven', name))
  await page.waitForTimeout(1_500)
  const scrubberPath = join(outDir, `${label}-${name}.png`)
  await page.locator('.scrubber').screenshot({ path: scrubberPath })
  console.log('still', scrubberPath, await surface.getAttribute('aria-valuetext'))
  if (name === 'telefoon') {
    const pagePath = join(outDir, `${label}-${name}-pagina.png`)
    await page.screenshot({ path: pagePath })
    console.log('still', pagePath)
  }
  await context.close()
}
await browser.close()
