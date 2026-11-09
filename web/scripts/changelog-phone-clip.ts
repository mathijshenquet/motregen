import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

// Telefoonclip of -still voor een changelognotitie (U107): de app op 402×844 (dpr 2), afspelen vanaf TIJD, opname van
// kaart + tijdbalk, H.264 ≤ 12 s. usage: pnpm exec tsx scripts/changelog-phone-clip.ts ORIGIN PAD TIJD UIT.mp4|UIT.webp [SECONDEN]
const [origin, path, time, output, secondsText = '9'] = process.argv.slice(2)
if (!origin || !path || !time || !output) throw new Error('usage: changelog-phone-clip.ts ORIGIN PAD TIJD UIT [SECONDEN]')
const seconds = Number(secondsText)
const still = output.endsWith('.webp')
const scratch = mkdtempSync(join(tmpdir(), 'motregen-clip-'))
const viewport = { width: 402, height: 844 }
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const context = await browser.newContext({
  viewport, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'nl-NL', timezoneId: 'Europe/Amsterdam', serviceWorkers: 'block',
  // Playwright neemt op op CSS-resolutie, ongeacht de dpr.
  ...(still ? {} : { recordVideo: { dir: scratch, size: viewport } }),
})
const page = await context.newPage()
page.setDefaultTimeout(120_000)
const opened = Date.now()
await page.goto(new URL(`${path}?t=${encodeURIComponent(time)}`, origin).href)
await page.locator('.map-splash.ready').waitFor({ state: 'attached' })
await page.locator('.scrubber-placeholder').waitFor({ state: 'detached' })
const close = page.locator('.freshness-close')
if (await close.isVisible().catch(() => false)) await close.click()
await page.mouse.move(5, 5)
await page.waitForTimeout(4_000)
const shell = (await page.locator('.map-shell').boundingBox())!
// Kaart, tijdbalk en de modusbalk (koppenrij van de tabel), niet de tabelrijen eronder.
const modes = await page.locator('.column-mode').evaluateAll((buttons) => buttons.map((button) => button.getBoundingClientRect()).filter((box) => box.height > 0 && box.top >= 0).map((box) => box.bottom))
const bottom = Math.min(viewport.height, Math.ceil(Math.max(...modes)) + 4)
if (still) {
  await page.screenshot({ path: join(scratch, 'still.png'), clip: { x: 0, y: shell.y, width: viewport.width, height: bottom - shell.y } })
  await browser.close()
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-i', join(scratch, 'still.png'), '-c:v', 'libwebp', '-quality', '88', output])
} else {
  const playAt = (Date.now() - opened) / 1000
  await page.locator('.scrub-surface').press(' ')
  await page.locator('.scrub-surface').blur()
  await page.mouse.move(5, 5)
  await page.waitForTimeout(seconds * 1000 + 600)
  await context.close()
  await browser.close()
  const video = join(scratch, readdirSync(scratch).find((name) => name.endsWith('.webm'))!)
  const crop = `crop=${viewport.width}:${Math.floor((bottom - shell.y) / 2) * 2}:0:${Math.round(shell.y)}`
  execFileSync('ffmpeg', ['-loglevel', 'error', '-y', '-ss', String(playAt), '-i', video, '-t', String(seconds), '-vf', `${crop},fps=24`,
    '-c:v', 'libx264', '-profile:v', 'high', '-pix_fmt', 'yuv420p', '-crf', '23', '-preset', 'slow', '-movflags', '+faststart', '-an', output])
}
rmSync(scratch, { recursive: true, force: true })
console.log('geschreven', output)
