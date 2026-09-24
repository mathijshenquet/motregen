import { chromium, devices, type BrowserContextOptions, type Page } from '@playwright/test'
import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// Windkoppen rond een zoom-, pan-, pinch- en resizestap (track U12). Per scenario: zichtbare
// koppen (alpha > 0) en hun alpha-som tegen de stand vlak vóór de stap, tijd tot 90 % daarvan
// terug is, en de windframe-intervallen tijdens de gesture. Het adaptieve budget staat uit,
// anders meet swiftshader zijn eigen terugschaling mee.
const [origin, outDir, label = 'run'] = process.argv.slice(2)
if (!origin || !outDir) throw new Error('usage: pnpm exec tsx scripts/wind-zoom.ts ORIGIN OUT_DIR [LABEL]  (VIDEO=1 voor video, PROFILES=desktop,mobile)')
mkdirSync(outDir, { recursive: true })
const video = process.env.VIDEO === '1'
const wanted = (process.env.PROFILES ?? 'desktop,mobile').split(',')

interface Sample { t: number; visible: number; alpha: number; active: number }
interface Profile { id: string; context: BrowserContextOptions; cpu: number }
const profiles: Profile[] = [
  { id: 'desktop', context: { viewport: { width: 1280, height: 720 } }, cpu: 1 },
  { id: 'mobile', context: { ...devices['Pixel 5'] }, cpu: 4 },
]

const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const results: Record<string, unknown> = {}
for (const profile of profiles.filter((candidate) => wanted.includes(candidate.id))) {
  const size = profile.context.viewport!
  const context = await browser.newContext({ ...profile.context, ...(video ? { recordVideo: { dir: outDir, size } } : {}) })
  await context.addInitScript(() => {
    localStorage.setItem('motregen-theme', 'dark')
    localStorage.setItem('motregen-map-view', JSON.stringify({ lng: 4.6, lat: 52.3, zoom: 8 }))
  })
  const page = await context.newPage()
  page.setDefaultTimeout(120_000)
  const cdp = await context.newCDPSession(page)
  await page.goto(new URL('/', origin).href)
  await page.waitForFunction(() => (globalThis as unknown as { __motregenPerf?: { snapshot: () => { ttfrMs: number | null } } }).__motregenPerf?.snapshot().ttfrMs != null)
  await page.waitForFunction(() => (globalThis as { __motregenWind?: unknown }).__motregenWind !== undefined)
  await installProbe(page)
  if (profile.cpu > 1) await cdp.send('Emulation.setCPUThrottlingRate', { rate: profile.cpu })
  await page.waitForTimeout(8_000)
  const box = (await page.locator('.map').boundingBox())!
  const center = { x: box.x + box.width * 0.35, y: box.y + box.height * 0.4 }

  const scenarios: Array<[string, () => Promise<void>]> = [
    ['zoom-in', () => ease(page, { zoom: 1 })],
    ['zoom-out', () => ease(page, { zoom: -1 })],
    ['pan', () => ease(page, { panX: box.width / 2 })],
    ['wheel-in', async () => {
      await page.mouse.move(center.x, center.y)
      for (let step = 0; step < 6; step++) { await page.mouse.wheel(0, -120); await page.waitForTimeout(40) }
    }],
    ['wheel-out', async () => {
      await page.mouse.move(center.x, center.y)
      for (let step = 0; step < 6; step++) { await page.mouse.wheel(0, 120); await page.waitForTimeout(40) }
    }],
    ['drag', async () => {
      await page.mouse.move(center.x, center.y)
      await page.mouse.down()
      await page.mouse.move(center.x + box.width * 0.4, center.y + box.height * 0.2, { steps: 30 })
      await page.mouse.up()
    }],
    ['resize', async () => {
      await page.setViewportSize({ width: Math.round(size.width * 0.8), height: size.height })
      await page.waitForTimeout(300)
      await page.setViewportSize(size)
    }],
  ]
  if (profile.context.hasTouch) {
    scenarios.push(['pinch-out', () => pinch(cdp, center, 40, 200, 1_500)])
    scenarios.push(['pinch-in', () => pinch(cdp, center, 200, 40, 1_500)])
  }
  const profileResults: Record<string, unknown> = {}
  for (const [name, gesture] of scenarios) {
    await page.waitForTimeout(4_000)
    const before = await sample(page, 2_000)
    await page.evaluate(() => { (globalThis as unknown as { __u12: { frames: number[] } }).__u12.frames = [] })
    const started = Date.now()
    await gesture()
    const gestureMs = Date.now() - started
    const frames = await page.evaluate(() => (globalThis as unknown as { __u12: { frames: number[] } }).__u12.frames.slice())
    const after = await sample(page, 6_000)
    const baseline = mean(before.map((entry) => entry.alpha))
    const baselineVisible = mean(before.map((entry) => entry.visible))
    const series = after.map((entry) => ({ ...entry, t: entry.t + gestureMs }))
    const intervals = frames.slice(1).map((time, index) => time - frames[index]!)
    const summary = {
      gestureMs,
      baselineAlpha: round(baseline),
      baselineVisible: round(baselineVisible),
      minAlphaRatio: round(Math.min(...series.map((entry) => entry.alpha)) / baseline),
      minVisibleRatio: round(Math.min(...series.map((entry) => entry.visible)) / baselineVisible),
      t90AlphaMs: recovery(series, baseline, (entry) => entry.alpha),
      t90VisibleMs: recovery(series, baselineVisible, (entry) => entry.visible),
      windFramesDuringGesture: frames.length,
      meanFrameMs: intervals.length ? round(mean(intervals)) : null,
      p95FrameMs: intervals.length ? round(percentile(intervals, 0.95)) : null,
    }
    console.log(`${label} ${profile.id} ${name} ${JSON.stringify(summary)}`)
    profileResults[name] = { summary, before, series }
  }
  results[profile.id] = profileResults
  const recorded = page.video()
  await context.close()
  const path = await recorded?.path()
  if (path) renameSync(path, join(outDir, `${label}-${profile.id}.webm`))
}
await browser.close()
writeFileSync(join(outDir, `${label}.json`), JSON.stringify(results))

async function installProbe(page: Page): Promise<void> {
  await page.evaluate(() => {
    const wind = (globalThis as unknown as { __motregenWind: Record<string, unknown> & { render: (...args: unknown[]) => void } }).__motregenWind
    const probe = { frames: [] as number[] }
    ;(globalThis as unknown as { __u12: typeof probe }).__u12 = probe
    // Adaptief budget uit en volle dichtheid, voor beide builds gelijk.
    wind.frameCount = -1e12
    wind.active = wind.target
    const render = wind.render.bind(wind)
    wind.render = (...args: unknown[]) => { probe.frames.push(performance.now()); render(...args) }
  })
}

async function sample(page: Page, durationMs: number): Promise<Sample[]> {
  return page.evaluate(async (duration) => {
    const wind = (globalThis as unknown as { __motregenWind: { active: number; ages: Float32Array; instanceBytes: Uint8Array } }).__motregenWind
    const samples: Array<{ t: number; visible: number; alpha: number; active: number }> = []
    const start = performance.now()
    while (performance.now() - start < duration) {
      let visible = 0
      let alpha = 0
      for (let index = 0; index < wind.active; index++) {
        const value = wind.instanceBytes[index * 20 + 19]!
        if (wind.ages[index]! <= 0 || value === 0) continue
        visible++
        alpha += value / 255
      }
      samples.push({ t: Math.round(performance.now() - start), visible, alpha, active: wind.active })
      await new Promise((resolve) => setTimeout(resolve, 100))
    }
    return samples
  }, durationMs)
}

async function ease(page: Page, step: { zoom?: number; panX?: number }): Promise<void> {
  await page.evaluate(async ({ zoom, panX }) => {
    const map = (globalThis as unknown as { __motregenWind: { map: { getZoom(): number; zoomTo(z: number, o: object): void; panBy(o: [number, number], p: object): void; once(e: string, f: () => void): void } } }).__motregenWind.map
    const done = new Promise<void>((resolve) => map.once('moveend', resolve))
    if (zoom) map.zoomTo(map.getZoom() + zoom, { duration: 300 })
    else map.panBy([panX ?? 0, 0], { duration: 300 })
    await done
  }, step)
}

async function pinch(cdp: { send: (method: 'Input.dispatchTouchEvent', params: object) => Promise<unknown> }, center: { x: number; y: number }, from: number, to: number, durationMs: number): Promise<void> {
  const points = (spread: number) => [
    { x: center.x - spread / 2, y: center.y, id: 1 },
    { x: center.x + spread / 2, y: center.y, id: 2 },
  ]
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: points(from) })
  const steps = Math.round(durationMs / 16)
  const started = Date.now()
  for (let step = 1; step <= steps; step++) {
    const progress = Math.min(1, (Date.now() - started) / durationMs)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: points(from + (to - from) * progress) })
    if (progress >= 1) break
    await new Promise((resolve) => setTimeout(resolve, 16))
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

/** Eerste moment waarop de reeks ≥ 90 % van `baseline` komt en dat 500 ms volhoudt. */
function recovery(series: Sample[], baseline: number, value: (sample: Sample) => number): number | null {
  for (let index = 0; index < series.length; index++) {
    const hold = series.filter((entry) => entry.t >= series[index]!.t && entry.t <= series[index]!.t + 500)
    if (hold.every((entry) => value(entry) >= 0.9 * baseline)) return series[index]!.t
  }
  return null
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
}

function percentile(values: number[], fraction: number): number {
  const sorted = [...values].sort((left, right) => left - right)
  return sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))]!
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
