import { chromium } from '@playwright/test'

// Reproductie U101 ronde 3 punt 6: windzakken bij wisselen Wind → Gevoel (ook snel heen en weer).
// usage: pnpm exec tsx scripts/windsock-mode-switch.ts ORIGIN
const [origin] = process.argv.slice(2)
if (!origin) throw new Error('usage: pnpm exec tsx scripts/windsock-mode-switch.ts ORIGIN')
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, timezoneId: 'Europe/Amsterdam' })
const page = await context.newPage()
page.setDefaultTimeout(120_000)
await page.goto(new URL('/wind', origin).href)
await page.locator('.scrubber-placeholder').waitFor({ state: 'detached' })
await page.locator('.map-overlay-windsocks[data-socks]').waitFor({ state: 'attached' })
const state = () => page.evaluate(() => {
  const canvas = document.querySelector<HTMLCanvasElement>('.map-overlay-windsocks')
  return `focus=${document.querySelector('.map-shell')?.getAttribute('data-wind-focus')} opacity=${canvas?.style.opacity} visibility=${canvas?.style.visibility || 'visible'} socks=${canvas?.dataset.socks}`
})
console.log('wind', await state())
const heading = (name: string) => page.locator('.forecast-table thead').getByRole('button', { name, exact: true })
await heading('Gevoel').click()
for (const wait of [100, 300, 1000, 3000]) { await page.waitForTimeout(wait); console.log(`gevoel +${wait}`, await state()) }
for (let round = 0; round < 4; round++) { await heading('Wind').click(); await page.waitForTimeout(120); await heading('Gevoel').click(); await page.waitForTimeout(90) }
for (const wait of [300, 2000]) { await page.waitForTimeout(wait); console.log(`snel → gevoel +${wait}`, await state()) }
if (process.env.SHOT) await page.screenshot({ path: process.env.SHOT })
await heading('Wind').click()
await page.waitForTimeout(1500)
console.log('terug naar wind', await state())
await browser.close()
