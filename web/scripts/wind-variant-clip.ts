import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// Korte clip (≤ 8 s) van een windmodus-variant tijdens afspelen, telefoonformaat (track U101).
// usage: pnpm exec tsx scripts/wind-variant-clip.ts ORIGIN OUT_DIR TIJD VARIANT
const [origin, outDir, time, variant] = process.argv.slice(2)
if (!origin || !outDir || !time || !variant) throw new Error('usage: pnpm exec tsx scripts/wind-variant-clip.ts ORIGIN OUT_DIR TIJD VARIANT')
const rawDir = join(outDir, `.clip-${variant}`)
rmSync(rawDir, { recursive: true, force: true })
mkdirSync(rawDir, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const viewport = { width: 402, height: 844 }
const context = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: true, isMobile: true, timezoneId: 'Europe/Amsterdam', recordVideo: { dir: rawDir, size: viewport } })
const page = await context.newPage()
page.setDefaultTimeout(120_000)
await page.goto(new URL(`/wind?dev&wind=${variant}&t=${time}`, origin).href)
await page.locator('.scrubber-placeholder').waitFor({ state: 'detached' })
await page.locator('.freshness-close').click()
await page.locator('details:has(> summary:text-is("Dev-opties"))').evaluate((element) => { (element as HTMLDetailsElement).open = false })
await page.locator('.wind-vane').first().waitFor({ state: 'attached' })
await page.waitForTimeout(5_000)
const playStartedMs = Date.now()
await page.getByRole('button', { name: 'Afspelen' }).first().click()
await page.waitForTimeout(8_000)
const recordedMs = await page.evaluate(() => performance.now())
await context.close()
await browser.close()
const raw = readdirSync(rawDir).find((name) => name.endsWith('.webm'))
if (!raw) throw new Error('Geen video opgenomen')
// Alleen de 8 s na de klik op afspelen.
const skipSeconds = Math.max(0, recordedMs / 1000 - (Date.now() - playStartedMs) / 1000)
const output = join(outDir, `${variant}-afspelen.mp4`)
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-ss', skipSeconds.toFixed(2), '-i', join(rawDir, raw), '-t', '8', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '28', '-movflags', '+faststart', output])
rmSync(rawDir, { recursive: true, force: true })
console.log(output)
