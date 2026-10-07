import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// Stilstaand beeld van de scrubber in een modus naar keuze (SHOT_MODE, track U47): de worker bekijkt dit zelf vóór elk
// "klaar, herlaad" in een live-pane. Desktop en 390 px, licht en donker.
// KEYS: door komma's gescheiden toetsen op de tijdslider (bijv. "PageUp,PageUp") om een ander moment te kiezen.
const [origin, outDir, label = 'scrubber', keys = ''] = process.argv.slice(2)
if (!origin || !outDir) throw new Error('usage: pnpm exec tsx scripts/scrubber-shot.ts ORIGIN OUT_DIR [LABEL] [KEYS]')
mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const viewports = { desktop: { width: 1280, height: 800 }, mobile: { width: 390, height: 844 } }
for (const [name, viewport] of Object.entries(viewports)) {
  const context = await browser.newContext({ viewport, deviceScaleFactor: 2, reducedMotion: 'reduce' })
  const page = await context.newPage()
  page.setDefaultTimeout(60_000)
  await page.goto(new URL('/', origin).href)
  await page.locator('.map-splash.ready').waitFor({ state: 'attached' })
  const surface = page.locator('.scrub-surface')
  await page.locator('[data-testid=cloud-section] .cloud-band path').first().waitFor({ state: 'attached' })
  // SHOT_MODE: lucht (standaard), weer (niets gepind), wind of gevoel.
  const mode = process.env.SHOT_MODE ?? 'lucht'
  const pin = { lucht: ['air', page.getByRole('button', { name: 'Lucht' })], wind: ['wind', page.locator('.wind-focus')], gevoel: ['temperature', page.locator('.temperature-focus')] } as const
  if (mode in pin) {
    const [view, heading] = pin[mode as keyof typeof pin]
    await heading.first().click()
    await page.mouse.move(5, 5)
    await page.locator(`.scrub-surface[data-scrubber-view=${view}]`).waitFor()
  }
  await surface.focus()
  if (await surface.getAttribute('data-playing') !== null) await surface.press(' ')
  for (const key of keys.split(',').filter(Boolean)) await surface.press(key)
  await surface.blur()
  for (const theme of ['light', 'dark']) {
    await page.evaluate((choice) => document.documentElement.setAttribute('data-theme', choice), theme)
    await page.waitForTimeout(300)
    const path = join(outDir, `${label}-${name}-${theme}.png`)
    await page.locator('.scrubber').screenshot({ path })
    console.log('still', path)
  }
  await context.close()
}
await browser.close()
