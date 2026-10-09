// U72: filmstrip — één uitsnede (stad, 390 px) op een reeks kaarttijden naast elkaar, om een overgang te bekijken.
// Gebruik (vanuit web/): pnpm exec tsx tmp/u72/time-strip.ts <baseURL> <label> <tijden als 2026-10-09T2205, komma's> [lng,lat,zoom]
// U72_STORAGE='{"motregen-dev-regenveld-radar":"blur 9×9"}' zet vooraf dev-standen (voor een oudere build).
import { chromium, devices } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import sharp from 'sharp'

const [baseURL = 'http://127.0.0.1:4320', label = 'strip', timeList = '', view = '5.6,52.2,9'] = process.argv.slice(2)
const times = timeList.split(',').filter(Boolean)
const stored = JSON.parse(process.env.U72_STORAGE ?? '{}') as Record<string, string>
const outputDir = new URL('./out/', import.meta.url).pathname
mkdirSync(outputDir, { recursive: true })
const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const cells: Buffer[] = []
const notes: string[] = []
for (const time of times) {
  const context = await browser.newContext({ ...devices['Pixel 5'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 })
  await context.addInitScript(([storedView, entries]) => {
    const [lng, lat, zoom] = storedView!.split(',').map(Number)
    localStorage.setItem('motregen-map-view', JSON.stringify({ lng, lat, zoom }))
    for (const [key, value] of Object.entries(JSON.parse(entries!) as Record<string, string>)) localStorage.setItem(key, value)
    addEventListener('DOMContentLoaded', () => { const style = document.createElement('style'); style.textContent = '.dev-panel { opacity: 0 !important; pointer-events: none !important; }'; document.head.append(style) })
  }, [view, JSON.stringify(stored)])
  const page = await context.newPage()
  await page.goto(`${baseURL}/?dev#t=${time}`)
  await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
  await page.waitForTimeout(2_500)
  if (await page.locator('.freshness-dialog[open]').count()) {
    await page.keyboard.press('Escape')
    await page.locator('.freshness-dialog[open]').waitFor({ state: 'detached', timeout: 5_000 }).catch(() => undefined)
  }
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  await page.waitForTimeout(7_000)
  const sources = await page.locator('[data-rain-sources]').getAttribute('data-rain-sources') ?? '?'
  const box = (await page.locator('.map-shell').boundingBox())!
  const shot = await page.screenshot({ clip: { x: box.x, y: box.y + 110, width: 390, height: 420 } })
  const caption = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="780" height="68"><rect width="100%" height="100%" fill="#000" fill-opacity="0.72"/><text x="20" y="46" font-family="sans-serif" font-size="32" fill="#fff">${time.slice(11, 13)}:${time.slice(13)} · ${sources}</text></svg>`)
  cells.push(await sharp(shot).composite([{ input: caption, left: 0, top: 0 }]).png().toBuffer())
  notes.push(`${time} ${sources}`)
  await context.close()
}
await browser.close()
const { width: cellWidth = 0, height: cellHeight = 0 } = await sharp(cells[0]!).metadata()
const columns = Math.min(4, cells.length)
const rows = Math.ceil(cells.length / columns)
const gap = 8
const file = `${outputDir}${label}.png`
await sharp({ create: { width: (cellWidth + gap) * columns - gap, height: (cellHeight + gap) * rows - gap, channels: 3, background: '#ff00ff' } })
  .composite(cells.map((input, index) => ({ input, left: (index % columns) * (cellWidth + gap), top: Math.floor(index / columns) * (cellHeight + gap) })))
  .png().toFile(file)
console.log(`${file} · ${notes.join(' | ')}`)
