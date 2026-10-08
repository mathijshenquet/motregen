// U62-meetrig: kosten van een venster-stap. Sleept de mobiele scrubber langzaam over meerdere uurgrenzen
// (CPU 4× geremd) en telt lange animatieframes, frametijden en wat er van de hemel opnieuw wordt opgebouwd.
// Gebruik: pnpm exec tsx tmp/u62/step-cost.ts <baseURL> <label>
import { chromium, devices } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'

const [baseURL = 'http://127.0.0.1:4320', label = 'run'] = process.argv.slice(2)
const outputDir = new URL('./out/', import.meta.url).pathname
mkdirSync(outputDir, { recursive: true })

const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const context = await browser.newContext({ ...devices['Pixel 5'], viewport: { width: 390, height: 844 } })
const page = await context.newPage()
const cdp = await context.newCDPSession(page)
await page.goto(baseURL)
await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
await page.getByTestId('sky').waitFor({ state: 'attached', timeout: 60_000 })
const slider = page.getByRole('slider', { name: 'Tijd' })
if (await slider.getAttribute('data-playing') !== null) await slider.press(' ')
await page.waitForTimeout(8_000)
await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 })

// tsx (esbuild) wikkelt benoemde functies in __name; die bestaat niet in de pagina.
await page.evaluate('globalThis.__name = (target) => target')
await page.evaluate(() => {
  const record = { longFrames: [] as number[], frameDeltas: [] as number[], rebuilt: {} as Record<string, number>, running: true }
  ;(window as unknown as { u62: typeof record }).u62 = record
  new PerformanceObserver((list) => { for (const entry of list.getEntries()) record.longFrames.push(entry.duration) }).observe({ type: 'long-animation-frame', buffered: false })
  let last = performance.now()
  const tick = (time: number) => { record.frameDeltas.push(time - last); last = time; if (record.running) requestAnimationFrame(tick) }
  requestAnimationFrame(tick)
  const kindOf = (node: Node): string | undefined => {
    const element = node instanceof Element ? node : node.parentElement
    if (!element) return undefined
    if (element.closest('.sky-gradient')) return 'hemelstop'
    if (element.closest('.sky-haze-gradient')) return 'nevelstop'
    if (element.closest('.cloud-tone')) return 'wolktintstop'
    if (element.matches('.sky-stroke')) return 'streek'
    if (element.matches('.sky-star')) return 'ster'
    if (element.closest('.dusk')) return 'schemergloed'
    if (element.closest('.cloud-section')) return 'wolkpad'
    return undefined
  }
  const count = (node: Node) => { const kind = kindOf(node); if (kind) record.rebuilt[kind] = (record.rebuilt[kind] ?? 0) + 1 }
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type === 'attributes') count(mutation.target)
      else for (const added of mutation.addedNodes) count(added)
    }
  }).observe(document.querySelector('.chart-track')!, { subtree: true, childList: true, attributes: true, attributeFilter: ['style', 'd', 'offset', 'stop-opacity', 'cx', 'opacity'] })
})

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
await page.waitForTimeout(3_000)

const record = await page.evaluate(() => {
  const data = (window as unknown as { u62: { longFrames: number[]; frameDeltas: number[]; rebuilt: Record<string, number>; running: boolean } }).u62
  data.running = false
  return data
})
await browser.close()

const sorted = [...record.frameDeltas].sort((left, right) => left - right)
const percentile = (share: number) => sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * share))] ?? 0
const summary = {
  label,
  dragHours: Math.abs(dragPx) / (box.width / 8),
  longFrames: record.longFrames.length,
  longFrameTotalMs: Math.round(record.longFrames.reduce((sum, duration) => sum + duration, 0)),
  longFrameMaxMs: Math.round(Math.max(0, ...record.longFrames)),
  frames: sorted.length,
  frameP50Ms: Math.round(percentile(0.5)),
  frameP95Ms: Math.round(percentile(0.95)),
  frameMaxMs: Math.round(sorted.at(-1) ?? 0),
  framesOver50Ms: sorted.filter((delta) => delta > 50).length,
  rebuilt: record.rebuilt,
}
writeFileSync(`${outputDir}step-cost-${label}.json`, JSON.stringify(summary, null, 1))
console.log(JSON.stringify(summary))
