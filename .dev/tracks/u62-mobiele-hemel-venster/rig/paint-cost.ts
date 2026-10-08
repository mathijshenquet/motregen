// U62-meetrig: waar gaat de frametijd heen tijdens het slepen van de mobiele scrubber? Neemt een Chrome-trace
// op tijdens een touch-sleep over ~7 uur (CPU 4×) en telt per soort renderwerk de duur op de hoofddraad van
// de renderer en de rastertaken. Een variant is CSS die vóór de meting wordt ingespoten.
// Gebruik (altijd onder de perf-lock, zie run-layer-variants.sh):
//   pnpm exec tsx tmp/u62/paint-cost.ts <baseURL> <label> [css]
// U62_PROFILE=po-android (standaard): renderer in een cgroup met 40 % CPU-quota (hoofddraad en workers), zoals
// het po-android-profiel van de laadrig; U62_PROFILE=cpu4 gebruikt de CDP-throttle 4× op de hoofddraad.
import { chromium, devices } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import { loadavg } from 'node:os'
import { performanceProfile } from '../../e2e/profiles'

const [baseURL = 'http://127.0.0.1:4320', label = 'run', variantCss = ''] = process.argv.slice(2)
const outputDir = new URL('./out/', import.meta.url).pathname
mkdirSync(outputDir, { recursive: true })

const profileName = process.env.U62_PROFILE ?? 'po-android'
const poAndroid = performanceProfile('po-android')
const MAX_LOAD_AVERAGE = 8
// Boven deze load is een meting ruis; wacht tot de host rustig is (hooguit een uur).
const waitDeadline = Date.now() + 120_000
while (loadavg()[0]! >= MAX_LOAD_AVERAGE) {
  if (Date.now() > waitDeadline) throw new Error(`loadavg blijft ≥ ${MAX_LOAD_AVERAGE}`)
  await new Promise((resolve) => setTimeout(resolve, 20_000))
}
const loadAtStart = Math.round(loadavg()[0]! * 100) / 100

const RENDER_EVENTS = ['UpdateLayoutTree', 'Layout', 'PrePaint', 'Paint', 'Layerize', 'Commit', 'RasterTask', 'FunctionCall', 'RunTask'] as const

const quotaPrefix = profileName === 'po-android'
  ? [`--renderer-cmd-prefix=systemd-run --user --scope --quiet -p CPUQuota=${poAndroid.rendererCpuQuotaPercent}% -p CPUQuotaPeriodSec=5ms --`]
  : []
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader', ...quotaPrefix] })
const context = await browser.newContext({ ...devices['Pixel 5'], ...(profileName === 'po-android' ? poAndroid.device : { viewport: { width: 390, height: 844 } }) })
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
await page.goto(baseURL)
await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
await page.getByTestId('sky').waitFor({ state: 'attached', timeout: 60_000 })
const slider = page.getByRole('slider', { name: 'Tijd' })
if (await slider.getAttribute('data-playing') !== null) await slider.press(' ')
if (variantCss) await page.addStyleTag({ content: variantCss })
await page.waitForTimeout(profileName === 'po-android' ? 20_000 : 8_000)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: profileName === 'po-android' ? poAndroid.cpuThrottleRate : 4 })

await page.evaluate('globalThis.__name = (target) => target')
await page.evaluate(() => {
  const record = { longFrames: [] as number[], frameDeltas: [] as number[], running: true }
  ;(window as unknown as { u62: typeof record }).u62 = record
  new PerformanceObserver((list) => { for (const entry of list.getEntries()) record.longFrames.push(entry.duration) }).observe({ type: 'long-animation-frame', buffered: false })
  let last = performance.now()
  const tick = (time: number) => { record.frameDeltas.push(time - last); last = time; if (record.running) requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
})

await browser.startTracing(page, { categories: ['devtools.timeline', 'disabled-by-default-devtools.timeline', 'cc', 'blink'] })
const box = (await page.locator('.scrub-surface').boundingBox())!
const y = box.y + box.height / 2
const startX = box.x + box.width - 20
const dragPx = -(box.width - 40)
const steps = 175
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: startX, y }] })
for (let step = 1; step <= steps; step++) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: startX + dragPx * step / steps, y }] })
  await page.waitForTimeout(40)
}
await page.waitForTimeout(300)
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
const trace = JSON.parse((await browser.stopTracing()).toString()) as { traceEvents: Array<{ name: string; ph: string; dur?: number; cat: string }> }
const record = await page.evaluate(() => {
  const data = (window as unknown as { u62: { longFrames: number[]; frameDeltas: number[]; running: boolean } }).u62
  data.running = false
  return data
})
await browser.close()

const totals: Record<string, { count: number; totalMs: number; maxMs: number }> = {}
for (const event of trace.traceEvents) {
  if (event.ph !== 'X' || event.dur === undefined || !(RENDER_EVENTS as readonly string[]).includes(event.name)) continue
  const entry = totals[event.name] ?? { count: 0, totalMs: 0, maxMs: 0 }
  entry.count++
  entry.totalMs += event.dur / 1000
  entry.maxMs = Math.max(entry.maxMs, event.dur / 1000)
  totals[event.name] = entry
}
const frames = record.frameDeltas.length
const sorted = [...record.frameDeltas].sort((left, right) => left - right)
const summary = {
  label,
  profile: profileName,
  loadAtStart,
  loadAtEnd: Math.round(loadavg()[0]! * 100) / 100,
  variantCss,
  frames,
  frameP95Ms: Math.round(sorted[Math.floor(sorted.length * 0.95)] ?? 0),
  frameMaxMs: Math.round(sorted.at(-1) ?? 0),
  longFrames: record.longFrames.length,
  longFrameTotalMs: Math.round(record.longFrames.reduce((sum, duration) => sum + duration, 0)),
  perFrameMs: Object.fromEntries(Object.entries(totals).map(([name, entry]) => [name, Math.round(entry.totalMs / frames * 100) / 100])),
  totals: Object.fromEntries(Object.entries(totals).map(([name, entry]) => [name, { count: entry.count, totalMs: Math.round(entry.totalMs), maxMs: Math.round(entry.maxMs * 10) / 10 }])),
}
writeFileSync(`${outputDir}paint-cost-${label}.json`, JSON.stringify(summary, null, 1))
console.log(JSON.stringify({ label, load: [summary.loadAtStart, summary.loadAtEnd], frames, frameP95Ms: summary.frameP95Ms, frameMaxMs: summary.frameMaxMs, longFrames: summary.longFrames, perFrameMs: summary.perFrameMs, maxMs: Object.fromEntries(Object.entries(summary.totals).map(([name, entry]) => [name, entry.maxMs])) }))
