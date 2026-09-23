import { chromium } from '@playwright/test'
import { mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'

// Korte video van de windlaag ingezoomd (track U3b): spawn, kop-fade-in,
// kop-fade-out en uitsterven van de bufferstaart zijn frame voor frame te volgen.
const [origin, outDir, label = 'wind', theme = 'dark'] = process.argv.slice(2)
if (!origin || !outDir) throw new Error('usage: pnpm exec tsx scripts/wind-video.ts ORIGIN OUT_DIR [LABEL] [light|dark]')
mkdirSync(outDir, { recursive: true })
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const size = { width: 640, height: 400 }
const context = await browser.newContext({ viewport: size, recordVideo: { dir: outDir, size } })
await context.addInitScript((value) => {
  localStorage.setItem('motregen-theme', value)
  localStorage.setItem('motregen-map-view', JSON.stringify({ lng: 4.1, lat: 52.3, zoom: 8.2 }))
}, theme)
const page = await context.newPage()
page.setDefaultTimeout(120_000)
await page.goto(new URL('/', origin).href)
await page.waitForFunction(() => (globalThis as unknown as { __motregenPerf?: { snapshot: () => { ttfrMs: number | null } } }).__motregenPerf?.snapshot().ttfrMs != null)
await page.waitForTimeout(Number(process.env.VIDEO_MS ?? 8_000))
const video = page.video()
await context.close()
await browser.close()
const path = await video?.path()
if (path) renameSync(path, join(outDir, `${label}-${theme}.webm`))
console.log('video', join(outDir, `${label}-${theme}.webm`))
