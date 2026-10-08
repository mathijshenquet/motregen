// U62 splash-proef: koud laden per sluierstand, als strook van beelden op vaste tijden na de navigatie.
// 390 px met het mobile-4g-profiel (netwerk 9 Mbps/60 ms, CPU 4×) en desktop zonder rem. Meet ook de
// frametijden van de eerste seconden en het contrast van het woordmerk tegen wat erachter staat.
// Gebruik: pnpm exec tsx tmp/u62/splash-frames.ts <baseURL> <label>
import { chromium, devices } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'
import { applyEmulation, performanceProfile } from '../../e2e/profiles'

const [baseURL = 'http://127.0.0.1:4320', label = 'splash'] = process.argv.slice(2)
const outputDir = new URL('./out/', import.meta.url).pathname
mkdirSync(outputDir, { recursive: true })
const VEILS = ['dekkend', '70', '40', 'glas'] as const
// De gevraagde 0 / 0,5 / 1 / 2 s, plus 2,5 / 3 / 3,5 s: op het mobiele profiel verschijnen de tegels pas daar.
const MOMENTS_MS = [0, 500, 1_000, 2_000, 2_500, 3_000, 3_500]
function luminance(channels: number[]): number {
  const linear = channels.slice(0, 3).map((channel) => { const share = channel / 255; return share <= 0.04045 ? share / 12.92 : ((share + 0.055) / 1.055) ** 2.4 })
  return 0.2126 * linear[0]! + 0.7152 * linear[1]! + 0.0722 * linear[2]!
}
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const report: Record<string, unknown> = {}
for (const device of ['390', 'desktop'] as const) {
  const strips: Buffer[] = []
  for (const veil of VEILS) {
    const context = await browser.newContext(device === '390' ? { ...devices['Pixel 5'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 1 } : { viewport: { width: 1280, height: 800 } })
    // tsx (esbuild) wikkelt benoemde functies in __name; die bestaat niet in de pagina.
    await context.addInitScript('globalThis.__name = (target) => target')
    await context.addInitScript((choice) => {
      localStorage.setItem('motregen-dev-splash', choice)
      // De knop werkt alleen onder ?dev; het paneel zelf hoort niet in beeld.
      addEventListener('DOMContentLoaded', () => { const style = document.createElement('style'); style.textContent = '.dev-panel { display: none !important; }'; document.head.append(style) })
      // Frametijden vanaf het eerste frame van de pagina.
      const deltas: number[] = []
      let last = performance.now()
      const tick = (time: number) => { deltas.push(time - last); last = time; if (time < 6_000) requestAnimationFrame(tick) }
      requestAnimationFrame(tick)
      ;(window as unknown as { splashFrames: number[] }).splashFrames = deltas
    }, veil)
    const page = await context.newPage()
    if (device === '390') await applyEmulation(await context.newCDPSession(page), performanceProfile('mobile-4g'))
    const startedAt = Date.now()
    await page.goto(`${baseURL}/weer?dev`, { waitUntil: 'commit' })
    const frames: Buffer[] = []
    let worstMarkContrast = Infinity
    for (const moment of MOMENTS_MS) {
      const wait = startedAt + moment - Date.now()
      if (wait > 0) await page.waitForTimeout(wait)
      const shot = await page.screenshot()
      frames.push(shot)
      // Woordmerk tegen de slechtste pixel direct naast de letters (zolang de splash er staat).
      const mark = await page.evaluate(() => {
        const word = document.querySelector<HTMLElement>('.map-splash:not(.ready) .map-splash-mark strong')
        if (!word) return undefined
        const bounds = word.getBoundingClientRect()
        return { ink: getComputedStyle(word).color.match(/[\d.]+/g)!.slice(0, 3).map(Number), x: bounds.left, y: bounds.top, width: bounds.width, height: bounds.height }
      }).catch(() => undefined)
      if (mark && mark.width > 10) {
        const { data, info } = await sharp(shot).raw().toBuffer({ resolveWithObject: true })
        const scale = info.width / page.viewportSize()!.width
        // Vlak boven en onder de regel: daar staat geen inkt, wel dezelfde ondergrond.
        for (const y of [mark.y - 3, mark.y + mark.height + 3]) for (let x = mark.x; x <= mark.x + mark.width; x += 3) {
          const index = (Math.floor(y * scale) * info.width + Math.floor(x * scale)) * info.channels
          const ground = luminance([data[index]!, data[index + 1]!, data[index + 2]!])
          const ink = luminance(mark.ink)
          worstMarkContrast = Math.min(worstMarkContrast, (Math.max(ink, ground) + 0.05) / (Math.min(ink, ground) + 0.05))
        }
      }
    }
    const deltas = await page.evaluate(() => (window as unknown as { splashFrames: number[] }).splashFrames)
    const sorted = [...deltas].sort((left, right) => left - right)
    const readyMs = await page.evaluate(() => new Promise<number>((resolve) => { const check = () => document.querySelector('.map-splash.ready') ? resolve(Math.round(performance.now())) : setTimeout(check, 50); check() }))
    report[`${device}-${veil}`] = { frames: sorted.length, p50Ms: Math.round(sorted[Math.floor(sorted.length / 2)] ?? 0), p95Ms: Math.round(sorted[Math.floor(sorted.length * 0.95)] ?? 0), maxMs: Math.round(sorted.at(-1) ?? 0), over50Ms: sorted.filter((delta) => delta > 50).length, markContrast: Math.round(worstMarkContrast * 100) / 100, splashKlaarMs: readyMs }
    console.log(`${device} ${veil}`, JSON.stringify(report[`${device}-${veil}`]))
    const width = device === '390' ? 390 : 512
    const height = device === '390' ? 844 : 320
    const cells = await Promise.all(frames.map((frame) => sharp(frame).resize({ width, height, fit: 'cover', position: 'top' }).png().toBuffer()))
    strips.push(await sharp({ create: { width: (width + 6) * cells.length - 6, height, channels: 3, background: '#ff00ff' } }).composite(cells.map((input, index) => ({ input, left: index * (width + 6), top: 0 }))).png().toBuffer())
    await context.close()
  }
  for (const [index, veil] of VEILS.entries()) await sharp(strips[index]!).toFile(`${outputDir}${label}-${device}-${veil}.png`)
}
await browser.close()
writeFileSync(`${outputDir}${label}-meting.json`, JSON.stringify({ momentsMs: MOMENTS_MS, report }, null, 1))
