// U62 stap 4-meetrig: kost een hoger windniveau frametijd? Speelt 20 s af in Weer op het po-android-profiel
// (renderer in een cgroup met 40 % CPU-quota) en meet frametijden en lange frames per windniveau.
// Gebruik (onder de perf-lock, zie run-perf.sh): pnpm exec tsx tmp/u62/wind-frames.ts <baseURL> <label> <uit|iets|meer>
import { chromium, devices } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { loadavg } from 'node:os'
import { performanceProfile } from '../../e2e/profiles'

const [baseURL = 'http://127.0.0.1:4320', label = 'run', level = 'uit'] = process.argv.slice(2)
const outputDir = new URL('./out/', import.meta.url).pathname
mkdirSync(outputDir, { recursive: true })
const poAndroid = performanceProfile('po-android')
const loadAtStart = Math.round(loadavg()[0]! * 100) / 100
if (loadAtStart >= 8) throw new Error(`loadavg ${loadAtStart} ≥ 8: geen meting`)

const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader',
  `--renderer-cmd-prefix=systemd-run --user --scope --quiet -p CPUQuota=${poAndroid.rendererCpuQuotaPercent}% -p CPUQuotaPeriodSec=5ms --`] })
const context = await browser.newContext({ ...devices['Pixel 5'], ...poAndroid.device })
await context.addInitScript((choice) => localStorage.setItem('motregen-dev-wind-mobiel', choice), level)
const page = await context.newPage()
await page.goto(`${baseURL}/weer?dev`)
await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
await page.evaluate(() => document.querySelector('.dev-panel')?.removeAttribute('open'))
// Laden laten uitrazen: gemeten wordt het afspelen daarna, niet de koude start.
await page.waitForTimeout(25_000)
const scrubber = page.locator('.scrub-surface')
if (await scrubber.getAttribute('data-playing') === null) await scrubber.press(' ')
const intensity = await page.locator('.map-shell').getAttribute('data-wind-intensity')

await page.evaluate('globalThis.__name = (target) => target')
const record = await page.evaluate(async (durationMs) => {
  const longFrames: number[] = []
  const frameDeltas: number[] = []
  const observer = new PerformanceObserver((list) => { for (const entry of list.getEntries()) longFrames.push(entry.duration) })
  observer.observe({ type: 'long-animation-frame', buffered: false })
  const startedAt = performance.now()
  let last = startedAt
  await new Promise<void>((resolve) => {
    const tick = (time: number) => {
      frameDeltas.push(time - last)
      last = time
      if (time - startedAt < durationMs) requestAnimationFrame(tick)
      else resolve()
    }
    requestAnimationFrame(tick)
  })
  observer.disconnect()
  return { longFrames, frameDeltas }
}, 20_000)
await browser.close()

const sorted = [...record.frameDeltas].sort((left, right) => left - right)
const at = (share: number) => Math.round((sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0) * 10) / 10
const summary = {
  label, level, intensity, load: [loadAtStart, Math.round(loadavg()[0]! * 100) / 100],
  frames: sorted.length,
  meanMs: Math.round(sorted.reduce((sum, delta) => sum + delta, 0) / sorted.length * 10) / 10,
  p50Ms: at(0.5), p95Ms: at(0.95), maxMs: at(1),
  over34Ms: sorted.filter((delta) => delta > 34).length,
  longFrames: record.longFrames.length,
  longFrameTotalMs: Math.round(record.longFrames.reduce((sum, duration) => sum + duration, 0)),
}
writeFileSync(`${outputDir}wind-frames-${label}.json`, JSON.stringify(summary, null, 1))
console.log(JSON.stringify(summary))
