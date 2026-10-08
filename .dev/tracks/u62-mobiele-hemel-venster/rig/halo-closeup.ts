// U62 punt 2: temperatuurcijfers van dichtbij (2× dpr, ingezoomd), dag en nacht, licht en donker app-thema.
// Gebruik: pnpm exec tsx tmp/u62/halo-closeup.ts <baseURL> <label>
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import sharp from 'sharp'
const [baseURL = 'http://127.0.0.1:4320', label = 'halo'] = process.argv.slice(2)
const outputDir = new URL('./out/', import.meta.url).pathname
mkdirSync(outputDir, { recursive: true })
const dayOf = (offsetDays: number) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date(Date.now() + offsetDays * 86_400_000))
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const cells: Buffer[] = []
for (const theme of ['dark', 'light'] as const) for (const time of ['1300', '0200']) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 })
  await context.addInitScript((choice) => localStorage.setItem('motregen-theme', choice), theme)
  const page = await context.newPage()
  await page.goto(`${baseURL}/#t=${dayOf(1)}T${time}`)
  await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
  await page.waitForTimeout(2_500)
  if (await page.locator('.freshness-dialog[open]').count()) await page.keyboard.press('Escape')
  await page.waitForTimeout(9_000)
  const paint = await page.evaluate(() => document.querySelector<HTMLElement>('.map')?.dataset.mapNight)
  console.log(`${theme} ${time}: kaart-nacht ${paint}`)
  const shot = await page.locator('.map-shell').screenshot()
  cells.push(await sharp(shot).extract({ left: 380, top: 380, width: 520, height: 420 }).png().toBuffer())
  await context.close()
}
await sharp({ create: { width: 528 * 4 - 8, height: 420, channels: 3, background: '#ff00ff' } }).composite(cells.map((input, index) => ({ input, left: index * 528, top: 0 }))).png().toFile(`${outputDir}${label}-dichtbij.png`)
await browser.close()
