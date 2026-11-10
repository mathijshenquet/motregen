import { chromium } from '@playwright/test'
const [pinSlug = 'hoorn', hide = '0'] = process.argv.slice(2)
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block' })).newPage()
page.on('pageerror', (e) => console.log('pageerror', e.message.slice(0, 300)))
await page.goto(`http://ageq-dev2:4314/wind/${pinSlug}?t=2026-11-10T11:00:00.000Z&dev&plekken=provincies&namen=samen`)
await page.locator('.map-splash.ready').waitFor({ state: 'attached' })
await page.locator('.scrubber-placeholder').waitFor({ state: 'detached' })
if (hide === '1') await page.addStyleTag({ content: '.dev-panel { display: none !important; }' })
const jump = (z: number) => page.evaluate((z) => (window as any).__motregenJumpTo(4.75, 51.95, z), z)
await jump(0); await page.waitForTimeout(3000)
const ov = await page.evaluate(() => (window as any).__motregenCamera().zoom)
await jump(ov + 0.8); await page.waitForTimeout(800)
console.log(await page.evaluate(() => {
  const shell = document.querySelector('.map-shell')!, origin = document.querySelector('.maplibregl-map')!.getBoundingClientRect()
  return Array.from(shell.querySelectorAll<HTMLElement>('.map-clock, .search-box, .map-legend, .maplibregl-ctrl, .map-brand, button')).map((e) => { const r = e.getBoundingClientRect(); return r.width && r.height ? `${e.tagName}.${e.className.toString().slice(0, 40)} ${Math.round(r.left - origin.left)},${Math.round(r.top - origin.top)} ${Math.round(r.width)}x${Math.round(r.height)}` : '' }).filter(Boolean).join('\n')
}))
for (let s = 0.3; s <= 1.61; s += 0.1) {
  await jump(ov + s); await page.waitForTimeout(700)
  const placed = await page.evaluate(() => document.querySelector<HTMLElement>('.map-overlay-windsocks')?.dataset.placed ?? '')
  const z = await page.evaluate(() => (window as any).__motregenProject(3.75, 51.5))
  console.log(s.toFixed(2), placed.includes('Zeeland') || placed.includes('Middelburg') ? 'Z ok ' : 'Z WEG', placed.split('|').length, JSON.stringify(z))
}
await browser.close()
