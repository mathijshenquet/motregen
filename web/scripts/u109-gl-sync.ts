// U109: hoeveel hoofddraadtijd gaat op aan synchrone WebGL-queries (getParameter/isEnabled/getError/readPixels)?
// Zo'n query wacht tot de GPU-procesrij leeg is. Opent de app, scrubt 10 s met de pijltjestoetsen en telt de tijd per
// query-naam. Gebruik: pnpm exec tsx scripts/u109-gl-sync.ts <origin> [--mobile]
import { chromium, devices } from '@playwright/test'

const origin = process.argv[2]
if (!origin) throw new Error('Gebruik: u109-gl-sync.ts <origin> [--mobile]')
const mobile = process.argv.includes('--mobile')
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const context = await browser.newContext(mobile ? { ...devices['Pixel 5'] } : { viewport: { width: 1440, height: 900 } })
// Als string: tsx voegt anders __name-aanroepen toe die in de pagina niet bestaan.
await context.addInitScript(`{
  const totals = {}
  window.__u109GlSync = totals
  const names = new Map()
  for (const key in WebGL2RenderingContext) if (typeof WebGL2RenderingContext[key] === 'number' && !names.has(WebGL2RenderingContext[key])) names.set(WebGL2RenderingContext[key], key)
  for (const method of ['getParameter', 'isEnabled', 'getError', 'readPixels', 'getUniformLocation', 'getAttribLocation']) {
    const original = WebGL2RenderingContext.prototype[method]
    WebGL2RenderingContext.prototype[method] = function (...args) {
      const started = performance.now()
      try { return original.apply(this, args) } finally {
        const key = method === 'getParameter' || method === 'isEnabled' ? method + '(' + (names.get(args[0]) ?? args[0]) + ')' : method
        const entry = totals[key] ??= { calls: 0, ms: 0 }
        entry.calls++
        entry.ms += performance.now() - started
      }
    }
  }
}`)
const page = await context.newPage()
await page.goto(new URL('/?modus=weer', origin).href)
await page.waitForSelector('.map-splash.ready', { state: 'attached', timeout: 60_000 })
await page.waitForTimeout(4_000)
await page.evaluate(() => { for (const entry of Object.values((window as typeof window & { __u109GlSync: Record<string, { calls: number; ms: number }> }).__u109GlSync)) { entry.calls = 0; entry.ms = 0 } })
const slider = page.getByRole('slider', { name: 'Tijd' })
await slider.scrollIntoViewIfNeeded()
const box = await slider.boundingBox()
if (!box) throw new Error('Geen tijdschuif')
const y = box.y + box.height / 2
await page.mouse.move(box.x + box.width / 3, y)
await page.mouse.down()
const started = Date.now()
for (let step = 0; Date.now() - started < 10_000; step++) {
  const phase = (step % 60) / 60
  await page.mouse.move(box.x + box.width * (0.1 + 0.8 * (phase < 0.5 ? phase * 2 : 2 - phase * 2)), y)
  await page.waitForTimeout(40)
}
await page.mouse.up()
const totals = await page.evaluate(() => (window as typeof window & { __u109GlSync: Record<string, { calls: number; ms: number }> }).__u109GlSync)
const rows = Object.entries(totals).filter(([, entry]) => entry.calls).sort((a, b) => b[1].ms - a[1].ms)
console.log(`${origin} ${mobile ? 'Pixel 5' : 'desktop'}: 10 s scrubben`)
for (const [name, entry] of rows.slice(0, 15)) console.log(`${entry.ms.toFixed(1).padStart(9)} ms ${String(entry.calls).padStart(6)}× ${name}`)
await browser.close()
