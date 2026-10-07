import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import { join } from 'node:path'

// Meet de open-morph van de zoekpil per animatieframe (track U58) en bewaart een paar tussenbeelden:
// breedte, hoogte, hoekradius en randkleur van de pil, en de dekking van de inhoud.
// Gebruik: pnpm exec tsx scripts/search-tween.ts ORIGIN OUT_DIR [desktop|mobile|BREEDTExHOOGTE]
const [origin, outDir, layout = 'mobile'] = process.argv.slice(2)
if (!origin || !outDir) throw new Error('usage: pnpm exec tsx scripts/search-tween.ts ORIGIN OUT_DIR [desktop|mobile]')
mkdirSync(outDir, { recursive: true })
const custom = /^(\d+)x(\d+)$/.exec(layout)
const viewport = custom ? { width: Number(custom[1]), height: Number(custom[2]) } : layout === 'desktop' ? { width: 1280, height: 800 } : { width: 390, height: 844 }
const browser = await chromium.launch({ headless: true, args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const context = await browser.newContext({ viewport, deviceScaleFactor: 2 })
const page = await context.newPage()
// tsx (esbuild keepNames) wikkelt benoemde functies in __name(); die helper bestaat niet in de pagina.
await page.addInitScript('globalThis.__name = (value) => value')
await page.goto(new URL('/', origin).href)
await page.locator('.map-splash.ready').waitFor({ state: 'attached' })
await page.waitForTimeout(1_500)

await page.evaluate(() => {
  const samples: string[] = []
  ;(window as unknown as { __searchSamples: string[] }).__searchSamples = samples
  const box = document.querySelector<HTMLElement>('.search-box')!
  let started: number | undefined
  const sample = (time: number) => {
    const open = document.querySelector('.search')!.classList.contains('open')
    if (open && started === undefined) started = time
    if (started !== undefined) {
      const bounds = box.getBoundingClientRect()
      const style = getComputedStyle(box)
      const results = document.querySelector<HTMLElement>('.search-results')
      const clear = document.querySelector<HTMLElement>('.search-clear')
      samples.push(`t=${String(Math.round(time - started)).padStart(3)} ms  ${bounds.width.toFixed(0)}×${bounds.height.toFixed(0)}  radius ${Number.parseFloat(style.borderTopLeftRadius).toFixed(1)}  rand ${style.borderTopColor}  lijst ${results ? Number(getComputedStyle(results).opacity).toFixed(2) : '—'}  × ${clear ? Number(getComputedStyle(clear).opacity).toFixed(2) : '—'}`)
      if (time - started > 420) return
    }
    requestAnimationFrame(sample)
  }
  requestAnimationFrame(sample)
})
const closed = await page.locator('.search-box').evaluate((element) => { const bounds = element.getBoundingClientRect(); return `${bounds.width.toFixed(0)}×${bounds.height.toFixed(0)} radius ${getComputedStyle(element).borderTopLeftRadius}` })
console.log(`dicht: ${closed}`)
await page.locator('.search-field').click()
await page.waitForTimeout(800)
for (const line of await page.evaluate(() => (window as unknown as { __searchSamples: string[] }).__searchSamples)) console.log(line)

// Tussenbeelden: een screenshot duurt langer dan de morph, dus de pil opnieuw openen met alle transities en
// animaties gepauzeerd en ze per beeld op een vast tijdstip zetten.
await page.keyboard.press('Escape')
await page.waitForTimeout(600)
await page.evaluate(() => {
  document.querySelector<HTMLElement>('.search-field')!.focus()
  void document.querySelector<HTMLElement>('.search-box')!.offsetWidth
  for (const animation of document.getAnimations()) animation.pause()
})
const clip = { x: 0, y: 0, width: Math.min(viewport.width, 900), height: 130 }
for (const time of [0, 45, 90, 135, 180, 240, 300]) {
  await page.evaluate((currentTime) => { for (const animation of document.getAnimations()) animation.currentTime = currentTime }, time)
  await page.screenshot({ path: join(outDir, `zoekpil-${layout}-${String(time).padStart(3, '0')}.png`), clip })
}
await browser.close()
