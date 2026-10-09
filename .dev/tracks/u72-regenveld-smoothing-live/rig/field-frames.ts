// U72 meetrig: kost een stand van Kaart › Regenveld frametijd? Speelt 20 s af in Weer op het po-android-profiel
// (renderer-cgroup, zoals rig/blend-frames.ts van U62) vanaf een kaarttijd <uren vooruit>.
// Gebruik (onder de perf-lock, vanuit web/): pnpm exec tsx tmp/u72/field-frames.ts <baseURL> <label> <uren vooruit> <radar-stand> <harmonie-stand> <tijdmenging>
// Let op: de rig tekent met SwiftShader, dus elke texel van de shader kost hier CPU. Op een telefoon-GPU is
// dat werk parallel; deze meting is voor de shader dus een bovengrens, geen voorspelling.
import { chromium, devices } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { loadavg } from 'node:os'
import { performanceProfile } from '../../e2e/profiles'

const [baseURL = 'http://127.0.0.1:4320', label = 'run', hoursAhead = '9', radar = 'bilineair', harmonie = 'bilineair', timeBlend = 'kruisfade'] = process.argv.slice(2)
const outputDir = new URL('./out/', import.meta.url).pathname
mkdirSync(outputDir, { recursive: true })
const poAndroid = performanceProfile('po-android')
const maxLoad = Number(process.env.U72_MAX_LOAD ?? 16)
const loadAtStart = Math.round(loadavg()[0]! * 100) / 100
if (loadAtStart > maxLoad) throw new Error(`loadavg ${loadAtStart} > ${maxLoad}: geen meting`)

const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader',
  `--renderer-cmd-prefix=systemd-run --user --scope --quiet -p CPUQuota=${poAndroid.rendererCpuQuotaPercent}% -p CPUQuotaPeriodSec=5ms --`] })
const context = await browser.newContext({ ...devices['Pixel 5'], ...poAndroid.device })
await context.addInitScript('globalThis.__name = (target) => target')
await context.addInitScript(([radarChoice, harmonieChoice, timeChoice]) => {
  localStorage.setItem('motregen-dev-regenveld-radar', radarChoice!)
  localStorage.setItem('motregen-dev-regenveld-harmonie', harmonieChoice!)
  localStorage.setItem('motregen-dev-regenveld-tijd', timeChoice!)
}, [radar, harmonie, timeBlend])
const page = await context.newPage()
const start = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam', dateStyle: 'short', timeStyle: 'short' }).format(new Date(Date.now() + Number(hoursAhead) * 3_600_000))
await page.goto(`${baseURL}/?dev#t=${start.replace(' ', 'T').replace(':', '')}`)
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
const rainSources = () => page.locator('[data-rain-sources]').getAttribute('data-rain-sources')
const sourcesAtStart = await rainSources()
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
const sourcesAtEnd = await rainSources()
const playing = await scrubber.getAttribute('data-playing') !== null
await browser.close()
const sorted = [...record.frameDeltas].sort((left, right) => left - right)
const at = (share: number) => Math.round((sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0) * 10) / 10
const summary = { label, radar, harmonie, timeBlend, start, sources: `${sourcesAtStart} → ${sourcesAtEnd}`, playing, load: [loadAtStart, Math.round(loadavg()[0]! * 100) / 100], frames: sorted.length, p50Ms: at(0.5), p95Ms: at(0.95), maxMs: at(1), over34Ms: sorted.filter((delta) => delta > 34).length, longFrames: record.longFrames.length, longFrameTotalMs: Math.round(record.longFrames.reduce((sum, duration) => sum + duration, 0)) }
writeFileSync(`${outputDir}field-frames-${label}.json`, JSON.stringify(summary, null, 1))
console.log(JSON.stringify(summary))
