// U62 stap 2-meetrig: volgt de tabelpiep onder de kaart de cursor vloeiend? Legt per animatieframe de
// scrollTop van de tabel vast en elke scrollTo-aanroep (met gedrag), bij afspelen en bij een touch-sleep.
// Gebruik: pnpm exec tsx tmp/u62/table-follow.ts <baseURL> <label>
import { chromium, devices } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

const [baseURL = 'http://127.0.0.1:4320', label = 'run', stepsArgument = '120', cpuRateArgument = '1'] = process.argv.slice(2)
const outputDir = new URL('./out/', import.meta.url).pathname
mkdirSync(outputDir, { recursive: true })

interface Trace { calls: Array<{ at: number; top: number; behavior: string; from: number }>; samples: Array<{ at: number; top: number }> }

const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const context = await browser.newContext({ ...devices['Pixel 5'], viewport: { width: 390, height: 844 } })
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
await page.goto(baseURL)
await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
await page.locator('tr[data-epoch]').first().waitFor({ state: 'attached', timeout: 60_000 })
const slider = page.getByRole('slider', { name: 'Tijd' })
const playing = async () => await slider.getAttribute('data-playing') !== null
if (await playing()) await slider.press(' ')
await page.waitForTimeout(6_000)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: Number(cpuRateArgument) })
// tsx (esbuild) wikkelt benoemde functies in __name; die bestaat niet in de pagina.
await page.evaluate('globalThis.__name = (target) => target')

async function startTrace(): Promise<void> {
  await page.evaluate(() => {
    const scroller = document.querySelector<HTMLElement>('.table-scroll')!
    const trace = { calls: [] as Array<{ at: number; top: number; behavior: string; from: number }>, samples: [] as Array<{ at: number; top: number }>, running: true }
    ;(window as unknown as { u62Table: typeof trace }).u62Table = trace
    const original = Element.prototype.scrollTo
    scroller.scrollTo = function (this: Element, ...parameters: unknown[]) {
      const options = parameters[0] as ScrollToOptions
      trace.calls.push({ at: performance.now(), top: Math.round(options.top ?? 0), behavior: options.behavior ?? 'auto', from: Math.round(scroller.scrollTop) })
      return (original as (...values: unknown[]) => void).apply(this, parameters)
    } as typeof scroller.scrollTo
    const tick = () => { trace.samples.push({ at: performance.now(), top: scroller.scrollTop }); if (trace.running) requestAnimationFrame(tick) }
    requestAnimationFrame(tick)
  })
}

async function stopTrace(): Promise<Trace> {
  return page.evaluate(() => {
    const trace = (window as unknown as { u62Table: Trace & { running: boolean } }).u62Table
    trace.running = false
    return { calls: trace.calls, samples: trace.samples }
  })
}

/** Per scrollTo-aanroep: over hoeveel frames bewoog de tabel daarna (1 = sprong, meer = tween). */
function summarise(trace: Trace) {
  const moves = trace.calls.filter((call) => call.top !== call.from)
  const framesPerMove = moves.map((call, index) => {
    const until = moves[index + 1]?.at ?? Infinity
    const tops = trace.samples.filter((sample) => sample.at >= call.at && sample.at < until).map((sample) => sample.top)
    return new Set(tops.map((top) => Math.round(top))).size
  })
  return {
    calls: trace.calls.length,
    behaviors: trace.calls.reduce<Record<string, number>>((count, call) => ({ ...count, [call.behavior]: (count[call.behavior] ?? 0) + 1 }), {}),
    moves: moves.map((call, index) => ({ from: call.from, to: call.top, behavior: call.behavior, distinctPositions: framesPerMove[index] })),
  }
}

// 1. Afspelen: laat de cursor een paar uurgrenzen passeren.
await startTrace()
await slider.press(' ')
await page.waitForTimeout(9_000)
if (await playing()) await slider.press(' ')
await page.waitForTimeout(1_000)
const playback = await stopTrace()

// 2. Handmatig: langzame touch-sleep over ruim drie uur.
await startTrace()
const box = (await page.locator('.scrub-surface').boundingBox())!
const y = box.y + box.height / 2
const startX = box.x + box.width - 30
const dragPx = -170
const steps = Number(stepsArgument)
await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: startX, y }] })
for (let step = 1; step <= steps; step++) {
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: startX + dragPx * step / steps, y }] })
  await page.waitForTimeout(40)
}
await page.waitForTimeout(300)
await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
await page.waitForTimeout(1_500)
if (await playing()) await slider.press(' ')
const seek = await stopTrace()
await browser.close()

const result = { label, playback: summarise(playback), seek: summarise(seek) }
writeFileSync(`${outputDir}table-follow-${label}.json`, JSON.stringify({ result, playback, seek }))
console.log(JSON.stringify(result, null, 1))
