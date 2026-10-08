// U62 blending-proef, meetrig: kost vermenigvuldigen (mix-blend-mode op de regencanvas) frametijd? Speelt 20 s af
// in Wind overdag op het po-android-profiel, met de dev-knop "Regen in Wind" op de gegeven stand.
// Gebruik (onder de perf-lock): pnpm exec tsx tmp/u62/blend-frames.ts <baseURL> <label> <alfa|vermenigvuldigen|gedempt>
import { chromium, devices } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { loadavg } from 'node:os'
import { performanceProfile } from '../../e2e/profiles'

const [baseURL = 'http://127.0.0.1:4320', label = 'run', blend = 'alfa'] = process.argv.slice(2)
const outputDir = new URL('./out/', import.meta.url).pathname
mkdirSync(outputDir, { recursive: true })
const poAndroid = performanceProfile('po-android')
const maxLoad = Number(process.env.U62_MAX_LOAD ?? 8)
const loadAtStart = Math.round(loadavg()[0]! * 100) / 100
if (loadAtStart > maxLoad) throw new Error(`loadavg ${loadAtStart} > ${maxLoad}: geen meting`)

const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader',
  `--renderer-cmd-prefix=systemd-run --user --scope --quiet -p CPUQuota=${poAndroid.rendererCpuQuotaPercent}% -p CPUQuotaPeriodSec=5ms --`] })
const context = await browser.newContext({ ...devices['Pixel 5'], ...poAndroid.device })
await context.addInitScript('globalThis.__name = (target) => target')
await context.addInitScript((choice) => localStorage.setItem('motregen-dev-regen-wind', choice), blend)
const page = await context.newPage()
// Morgen 11:00: overdag (alleen dan vermenigvuldigt de regen) en ver genoeg van de schemering voor 20 s afspelen.
const tomorrow = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date(Date.now() + 86_400_000))
await page.goto(`${baseURL}/wind?dev#t=${tomorrow}T1100`)
await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
await page.waitForTimeout(3_000)
if (await page.locator('.freshness-dialog[open]').count()) {
  await page.keyboard.press('Escape')
  await page.locator('.freshness-dialog[open]').waitFor({ state: 'detached', timeout: 5_000 }).catch(() => undefined)
}
await page.evaluate(() => document.querySelector('.dev-panel')?.removeAttribute('open'))
await page.waitForTimeout(22_000)
const scrubber = page.locator('.scrub-surface')
if (await scrubber.getAttribute('data-playing') === null) await scrubber.press(' ')
const shell = page.locator('.map-shell')
const state = `${await shell.getAttribute('data-rain-opacity')} ${await shell.getAttribute('data-rain-blend')}`
const record = await page.evaluate(async (durationMs) => {
  const longFrames: number[] = []
  const frameDeltas: number[] = []
  const observer = new PerformanceObserver((list) => { for (const entry of list.getEntries()) longFrames.push(entry.duration) })
  observer.observe({ type: 'long-animation-frame', buffered: false })
  const startedAt = performance.now()
  let last = startedAt
  await new Promise<void>((resolve) => {
    const tick = (time: number) => { frameDeltas.push(time - last); last = time; if (time - startedAt < durationMs) requestAnimationFrame(tick); else resolve() }
    requestAnimationFrame(tick)
  })
  observer.disconnect()
  return { longFrames, frameDeltas }
}, 20_000)
const endState = `${await shell.getAttribute('data-rain-opacity')} ${await shell.getAttribute('data-rain-blend')}`
await browser.close()
const sorted = [...record.frameDeltas].sort((left, right) => left - right)
const at = (share: number) => Math.round((sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0) * 10) / 10
const summary = { label, blend, rain: `${state} → ${endState}`, load: [loadAtStart, Math.round(loadavg()[0]! * 100) / 100], frames: sorted.length, p50Ms: at(0.5), p95Ms: at(0.95), maxMs: at(1), over34Ms: sorted.filter((delta) => delta > 34).length, longFrames: record.longFrames.length, longFrameTotalMs: Math.round(record.longFrames.reduce((sum, duration) => sum + duration, 0)) }
writeFileSync(`${outputDir}blend-frames-${label}.json`, JSON.stringify(summary, null, 1))
console.log(JSON.stringify(summary))
