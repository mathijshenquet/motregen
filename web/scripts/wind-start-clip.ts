import { chromium } from '@playwright/test'
import { execFileSync } from 'node:child_process'
import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

// U110: de eerste seconden van een koude /wind-lading, voor en na naast elkaar (telefoonformaat), met een klok
// sinds navigatie. Swiftshader haalt geen 60 fps: de opbouw is trager dan op een echte GPU, de volgorde klopt.
// usage: pnpm exec tsx scripts/wind-start-clip.ts UIT.mp4 LABEL=ORIGIN LABEL=ORIGIN [SECONDEN]
const [output, ...rest] = process.argv.slice(2)
const seconds = Number(rest.find((arg) => /^\d+(\.\d+)?$/.test(arg)) ?? 9)
const sides = rest.filter((arg) => arg.includes('=')).map((arg) => ({ label: arg.slice(0, arg.indexOf('=')), origin: arg.slice(arg.indexOf('=') + 1) }))
if (!output || sides.length === 0) throw new Error('usage: pnpm exec tsx scripts/wind-start-clip.ts UIT.mp4 LABEL=ORIGIN [LABEL=ORIGIN] [SECONDEN]')
const viewport = { width: 402, height: 844 }
const rawDir = `${output}.raw`
rmSync(rawDir, { recursive: true, force: true })
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const clips: string[] = []
for (const [index, side] of sides.entries()) {
  const dir = join(rawDir, String(index))
  mkdirSync(dir, { recursive: true })
  const context = await browser.newContext({ viewport, hasTouch: true, isMobile: true, timezoneId: 'Europe/Amsterdam', recordVideo: { dir, size: viewport } })
  // De video begint bij het openen van de pagina, vlak vóór de navigatie: de klok telt vanaf timeOrigin.
  await context.addInitScript({ content: `(() => {
    const clock = document.createElement('div')
    clock.style.cssText = 'position:fixed;left:8px;bottom:8px;z-index:99999;font:600 16px/1.2 system-ui;color:#fff;background:#000a;padding:4px 8px;border-radius:6px;pointer-events:none'
    const tick = () => { clock.textContent = ${JSON.stringify(side.label)} + ' ' + (performance.now() / 1000).toFixed(1) + ' s'; requestAnimationFrame(tick) }
    addEventListener('DOMContentLoaded', () => { document.body.append(clock); tick() })
  })()` })
  const page = await context.newPage()
  await page.goto(new URL('/wind', side.origin).href)
  await page.waitForTimeout(seconds * 1_000)
  await context.close()
  const raw = readdirSync(dir).find((file) => file.endsWith('.webm'))
  if (!raw) throw new Error('Geen video opgenomen')
  clips.push(join(dir, raw))
}
await browser.close()
const inputs = clips.flatMap((clip) => ['-i', clip])
const filter = clips.length > 1
  ? `${clips.map((_, index) => `[${index}:v]trim=0:${seconds},setpts=PTS-STARTPTS,scale=${viewport.width}:-2[v${index}]`).join(';')};${clips.map((_, index) => `[v${index}]`).join('')}hstack=inputs=${clips.length}[out]`
  : `[0:v]trim=0:${seconds},setpts=PTS-STARTPTS[out]`
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', ...inputs, '-filter_complex', filter, '-map', '[out]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '30', '-preset', 'slow', '-movflags', '+faststart', output])
rmSync(rawDir, { recursive: true, force: true })
console.log(output)
