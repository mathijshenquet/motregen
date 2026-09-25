// node tmp/u25.mjs <origin> <outdir> <label> [scheme=light|dark] [device=desktop|pixel5] [fill=0.12] [extra...]
import { chromium, devices } from '@playwright/test'
const [origin, out, label, scheme = 'light', device = 'desktop', fill] = process.argv.slice(2)
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const context = await browser.newContext(device === 'pixel5' ? { ...devices['Pixel 5'] } : { viewport: { width: 1280, height: 800 }, deviceScaleFactor: Number(process.env.DPR ?? 1) })
await context.addInitScript((theme) => localStorage.setItem('motregen-theme', theme), scheme)
const page = await context.newPage()
await page.emulateMedia({ colorScheme: scheme })
page.on('console', (m) => { if (m.type() === 'error') console.log('console:', m.text()) })
page.on('pageerror', (e) => console.log('pageerror:', e.message))
await page.goto(`${origin}/?dev`, { waitUntil: 'load', timeout: 60_000 })
await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
await page.locator('.temperature-cell').first().waitFor({ timeout: 60_000 })
if (!process.env.PLAY) await page.getByRole('button', { name: 'Pauzeren' }).first().click({ force: true }).catch(() => {})
await page.evaluate(() => { const d = document.querySelector('details.wind-debug'); if (d) d.open = false })
if (fill !== undefined && fill !== '-') {
  await page.evaluate((value) => {
    for (const label of document.querySelectorAll('.wind-debug label')) {
      if (label.querySelector('span')?.textContent !== 'Vulling') continue
      const input = label.querySelector('input'); input.value = value; input.dispatchEvent(new Event('input', { bubbles: true }))
    }
  }, fill)
}
const heading = page.locator('.temperature-focus')
if (device === 'pixel5') await heading.tap(); else { await heading.click(); await heading.blur(); await page.mouse.move(5, 5) }
await page.waitForFunction(() => document.querySelector('.map-shell')?.getAttribute('data-focus') === '1.00', null, { timeout: 20_000 })
await page.waitForFunction(() => Number(document.querySelector('.map-shell')?.getAttribute('data-isolines')) > 0, null, { timeout: 30_000 })
await page.evaluate(() => window.scrollTo(0, 0))
await page.waitForTimeout(2500)
const info = await page.evaluate(() => ({
  saturation: getComputedStyle(document.querySelector('.map-shell')).getPropertyValue('--map-saturation'),
  filter: getComputedStyle(document.querySelector('.maplibregl-canvas')).filter,
  stats: window.__motregenIsolines?.(),
}))
console.log(label, JSON.stringify({ saturation: info.saturation, filter: info.filter, passes: info.stats?.passes, fillPasses: info.stats?.fillPasses, fillMs: info.stats?.fillMs, passMs: info.stats?.passMs }))
if (process.env.PERF) {
  await page.waitForTimeout(1500)
  const result = await page.evaluate(async () => {
    const counters = () => window.__motregenIsolines?.() ?? {}
    const before = counters()
    const intervals = []
    let last = performance.now()
    await new Promise((resolve) => {
      const end = last + 5000
      const tick = (now) => { intervals.push(now - last); last = now; if (now < end) requestAnimationFrame(tick); else resolve() }
      requestAnimationFrame(tick)
    })
    const after = counters()
    intervals.sort((a, b) => a - b)
    const mean = intervals.reduce((a, b) => a + b, 0) / intervals.length
    return { frames: intervals.length, meanMs: +mean.toFixed(2), p95Ms: +intervals[Math.floor(intervals.length * 0.95)].toFixed(2), mapRendersPerS: ((after.repaints ?? 0) - (before.repaints ?? 0)) / 5, passes: (after.passes ?? 0) - (before.passes ?? 0), fillPasses: (after.fillPasses ?? 0) - (before.fillPasses ?? 0) }
  })
  console.log('PERF', label, JSON.stringify(result))
}
const clip = process.env.CLIP?.split(',').map(Number)
await page.screenshot({ path: `${out}/${label}.png`, ...clip ? { clip: { x: clip[0], y: clip[1], width: clip[2], height: clip[3] } } : {} })
await browser.close()
