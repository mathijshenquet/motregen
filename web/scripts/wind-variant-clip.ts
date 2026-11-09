import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// Korte clip (≤ 8 s) van de windmodus, telefoonformaat (track U101): drie seconden afspelen, dan heen en terug
// scrubben.
// usage: pnpm exec tsx scripts/wind-variant-clip.ts ORIGIN OUT_DIR TIJD NAAM [DEV-QUERY]   (CLIP_STILL=1: vaste kaarttijd)
//   bv. `storm windfactor=2.2` voor harde wind als de data hem niet heeft.
const [origin, outDir, time, name, query] = process.argv.slice(2)
if (!origin || !outDir || !time || !name) throw new Error('usage: pnpm exec tsx scripts/wind-variant-clip.ts ORIGIN OUT_DIR TIJD NAAM [DEV-QUERY]')
const rawDir = join(outDir, `.clip-${name}`)
rmSync(rawDir, { recursive: true, force: true })
mkdirSync(rawDir, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const viewport = { width: 402, height: 844 }
const context = await browser.newContext({ viewport, deviceScaleFactor: 2, timezoneId: 'Europe/Amsterdam', recordVideo: { dir: rawDir, size: viewport } })
const page = await context.newPage()
page.setDefaultTimeout(120_000)
await page.goto(new URL(`/wind?dev${query ? `&${query}` : ''}&t=${time}`, origin).href)
await page.locator('.scrubber-placeholder').waitFor({ state: 'detached' })
await page.locator('.freshness-close').click()
await page.locator('details:has(> summary:text-is("Dev-opties"))').evaluate((element) => { (element as HTMLDetailsElement).open = false })
await page.locator('.map-overlay-windsocks[data-socks]').waitFor({ state: 'attached' })
await page.waitForTimeout(5_000)
// CLIP_STILL=1: alleen de beweging van de zakken op een vaste kaarttijd (8 s), zonder afspelen of scrubben.
if (process.env.CLIP_STILL) await page.waitForTimeout(9_000)
else {
  await page.getByRole('button', { name: 'Afspelen' }).first().click()
  await page.waitForTimeout(3_000)
  const surface = await page.locator('.scrub-surface').boundingBox()
  if (!surface) throw new Error('Geen scrubber')
  const y = surface.y + surface.height / 2, middle = surface.x + surface.width / 2
  await page.mouse.move(middle, y)
  await page.mouse.down()
  // Een paar uur terug en weer vooruit, in ~5 s.
  let pointerX = middle
  for (const target of [middle + 160, middle - 120, middle + 40]) {
    const steps = 30
    for (let step = 1; step <= steps; step++) {
      await page.mouse.move(pointerX + (target - pointerX) * step / steps, y)
      await page.waitForTimeout(25)
    }
    pointerX = target
  }
  await page.mouse.up()
  await page.waitForTimeout(1_000)
}
await context.close()
await browser.close()
const raw = readdirSync(rawDir).find((file) => file.endsWith('.webm'))
if (!raw) throw new Error('Geen video opgenomen')
const output = join(outDir, `${name}${process.env.CLIP_STILL ? "" : "-afspelen-scrubben"}.mp4`)
// De laatste 8 s: afspelen en scrubben samen duren zo lang, en de webm-tijd loopt niet gelijk met de paginaklok.
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-sseof', '-8', '-i', join(rawDir, raw), '-t', '8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', '-movflags', '+faststart', output])
rmSync(rawDir, { recursive: true, force: true })
console.log(output)
