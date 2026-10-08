// U62-meetrig: sleept de mobiele scrubber en legt de hemelstops per uur vast, vóór en ná de sleep.
// Gebruik: pnpm exec tsx tmp/u62/repro.ts <baseURL> <label> [sleepPx]
import { chromium, devices } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

const [baseURL = 'http://127.0.0.1:4320', label = 'run', dragArgument = '-150'] = process.argv.slice(2)
const dragPx = Number(dragArgument)
const outputDir = new URL('./out/', import.meta.url).pathname
mkdirSync(outputDir, { recursive: true })

interface SkyReading {
  cursorLabel: string
  trackOffsetPx: number
  hourTickXs: number[]
  stops: Array<{ x: number; dark: number; day: number }>
  dusks: number[]
}

const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const context = await browser.newContext({ ...devices['Pixel 5'], viewport: { width: 390, height: 844 } })
const page = await context.newPage()
await page.goto(baseURL)
await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
await page.getByTestId('sky').waitFor({ state: 'attached', timeout: 60_000 })
const slider = page.getByRole('slider', { name: 'Tijd' })
if (await slider.getAttribute('data-playing') !== null) await slider.press(' ')

async function readSky(): Promise<SkyReading> {
  return page.evaluate(() => {
    const track = document.querySelector<HTMLElement>('.chart-track')!
    const gradient = document.querySelector<SVGLinearGradientElement>('.sky-gradient')!
    const width = Number(gradient.getAttribute('x2'))
    return {
      cursorLabel: document.querySelector('[role=slider]')?.getAttribute('aria-valuetext') ?? '',
      trackOffsetPx: new DOMMatrix(getComputedStyle(track).transform).m41,
      hourTickXs: [...track.querySelectorAll<HTMLElement>('.hour-grid i')].map((tick) => parseFloat(tick.style.left)),
      stops: [...gradient.querySelectorAll('stop')].map((stop) => ({
        x: Number(stop.getAttribute('offset')) * width,
        dark: Number((stop as SVGStopElement).style.getPropertyValue('--dark')),
        day: Number((stop as SVGStopElement).style.getPropertyValue('--day')),
      })),
      dusks: [...track.querySelectorAll<SVGGElement>('.dusk')].map((dusk) => dusk.getBoundingClientRect().left + dusk.getBoundingClientRect().width / 2 - track.getBoundingClientRect().left),
    }
  })
}

async function touchDrag(deltaX: number): Promise<void> {
  const box = (await page.locator('.scrub-surface').boundingBox())!
  const cdp = await context.newCDPSession(page)
  const y = box.y + box.height / 2
  const startX = box.x + box.width / 2
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: startX, y }] })
  const steps = 15
  for (let step = 1; step <= steps; step++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: startX + deltaX * step / steps, y }] })
    await page.waitForTimeout(30)
  }
  // Even stilhouden: zonder snelheid volgt er geen fling na het loslaten.
  await page.waitForTimeout(200)
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
}

const settleMs = 6_000
await page.waitForTimeout(settleMs)
const before = await readSky()
await page.screenshot({ path: `${outputDir}${label}-voor.png` })
await touchDrag(dragPx)
await page.waitForTimeout(settleMs)
if (await slider.getAttribute('data-playing') !== null) await slider.press(' ')
const after = await readSky()
await page.screenshot({ path: `${outputDir}${label}-na.png` })
await browser.close()

const afterByX = new Map(after.stops.map((stop) => [stop.x.toFixed(1), stop]))
const changed = before.stops.flatMap((stop) => {
  const later = afterByX.get(stop.x.toFixed(1))
  return later && (later.dark !== stop.dark || later.day !== stop.day) ? [{ x: stop.x, before: stop, after: later }] : []
})
writeFileSync(`${outputDir}${label}.json`, JSON.stringify({ before, after, changed }, null, 1))
console.log(`cursor ${before.cursorLabel} -> ${after.cursorLabel}; baan ${before.trackOffsetPx.toFixed(1)} -> ${after.trackOffsetPx.toFixed(1)} px`)
console.log(`uurstreep-x gelijk: ${JSON.stringify(before.hourTickXs) === JSON.stringify(after.hourTickXs)}; stops ${before.stops.length} -> ${after.stops.length}`)
console.log(`schemergloed-x voor ${before.dusks.map((x) => x.toFixed(1))} na ${after.dusks.map((x) => x.toFixed(1))}`)
console.log(`stops met andere hemel op dezelfde as-x: ${changed.length}`)
for (const change of changed) console.log(`  x=${change.x.toFixed(1)} donkerte ${change.before.dark} -> ${change.after.dark}, dag ${change.before.day} -> ${change.after.day}`)
