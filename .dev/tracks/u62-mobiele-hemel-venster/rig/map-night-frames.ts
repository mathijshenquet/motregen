// U62-experiment, meetrig: wat kost de kaart die met de kaarttijd meetweent? Speelt 20 s af vanaf vlak vóór
// zonsondergang op het po-android-profiel (renderer-cgroup 40 %) en meet frametijden, lange frames en de
// JS-heap, met de dev-knop aan of uit.
// Gebruik (onder de perf-lock): pnpm exec tsx tmp/u62/map-night-frames.ts <baseURL> <label> <aan|uit> <HH:MM start>
import { chromium, devices } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { loadavg } from 'node:os'
import { performanceProfile } from '../../e2e/profiles'

const [baseURL = 'http://127.0.0.1:4320', label = 'run', knob = 'uit', startTime = '18:40'] = process.argv.slice(2)
const outputDir = new URL('./out/', import.meta.url).pathname
mkdirSync(outputDir, { recursive: true })
const poAndroid = performanceProfile('po-android')
const loadAtStart = Math.round(loadavg()[0]! * 100) / 100
// Grens instelbaar: de orkestrator stond voor deze gepaarde meting load ≤ 16 toe (2026-10-08).
const maxLoad = Number(process.env.U62_MAX_LOAD ?? 8)
if (loadAtStart > maxLoad) throw new Error(`loadavg ${loadAtStart} > ${maxLoad}: geen meting`)

const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader', '--enable-precise-memory-info',
  `--renderer-cmd-prefix=systemd-run --user --scope --quiet -p CPUQuota=${poAndroid.rendererCpuQuotaPercent}% -p CPUQuotaPeriodSec=5ms --`] })
const context = await browser.newContext({ ...devices['Pixel 5'], ...poAndroid.device })
await context.addInitScript((choice) => localStorage.setItem('motregen-dev-kaart-automatisch', choice), knob)
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam' }).format(new Date())
await page.goto(`${baseURL}/weer?dev#t=${today}T${startTime.replace(':', '')}`)
await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
await page.waitForTimeout(3_000)
if (await page.locator('.freshness-dialog[open]').count()) {
  await page.keyboard.press('Escape')
  await page.locator('.freshness-dialog[open]').waitFor({ state: 'detached', timeout: 5_000 }).catch(() => undefined)
}
await page.evaluate(() => document.querySelector('.dev-panel')?.removeAttribute('open'))
// Laden laten uitrazen: gemeten wordt het afspelen, niet de koude start.
await page.waitForTimeout(22_000)
const heapOf = async () => {
  await cdp.send('HeapProfiler.collectGarbage')
  const metrics = await cdp.send('Performance.getMetrics')
  return Math.round((metrics.metrics.find((metric) => metric.name === 'JSHeapUsedSize')?.value ?? 0) / 1024)
}
await cdp.send('Performance.enable')
const heapBeforeKb = await heapOf()
const clockOf = () => page.locator('.clock-map-time').first().textContent()
const clockStart = await clockOf()
const scrubber = page.locator('.scrub-surface')
if (await scrubber.getAttribute('data-playing') === null) await scrubber.press(' ')

await page.evaluate('globalThis.__name = (target) => target')
const record = await page.evaluate(async (durationMs) => {
  const longFrames: number[] = []
  const frameDeltas: number[] = []
  const nightSteps = new Set<string>()
  const observer = new PerformanceObserver((list) => { for (const entry of list.getEntries()) longFrames.push(entry.duration) })
  observer.observe({ type: 'long-animation-frame', buffered: false })
  const mapElement = document.querySelector<HTMLElement>('.map')!
  const startedAt = performance.now()
  let last = startedAt
  await new Promise<void>((resolve) => {
    const tick = (time: number) => {
      frameDeltas.push(time - last)
      last = time
      nightSteps.add(mapElement.dataset.mapNight ?? 'geen')
      if (time - startedAt < durationMs) requestAnimationFrame(tick)
      else resolve()
    }
    requestAnimationFrame(tick)
  })
  observer.disconnect()
  return { longFrames, frameDeltas, nightSteps: [...nightSteps] }
}, 20_000)
const clockEnd = await clockOf()
const heapAfterKb = await heapOf()
await browser.close()

const sorted = [...record.frameDeltas].sort((left, right) => left - right)
const at = (share: number) => Math.round((sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0) * 10) / 10
const summary = {
  label, knob, clock: `${clockStart} → ${clockEnd}`, nightSteps: record.nightSteps.length, nightRange: [record.nightSteps[0], record.nightSteps.at(-1)],
  load: [loadAtStart, Math.round(loadavg()[0]! * 100) / 100],
  frames: sorted.length,
  meanMs: Math.round(sorted.reduce((sum, delta) => sum + delta, 0) / sorted.length * 10) / 10,
  p50Ms: at(0.5), p95Ms: at(0.95), maxMs: at(1),
  over34Ms: sorted.filter((delta) => delta > 34).length,
  longFrames: record.longFrames.length,
  longFrameTotalMs: Math.round(record.longFrames.reduce((sum, duration) => sum + duration, 0)),
  heapBeforeKb, heapAfterKb, heapGrowthKb: heapAfterKb - heapBeforeKb,
}
writeFileSync(`${outputDir}map-night-frames-${label}.json`, JSON.stringify(summary, null, 1))
console.log(JSON.stringify(summary))
