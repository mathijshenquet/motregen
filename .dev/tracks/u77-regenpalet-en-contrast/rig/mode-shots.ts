// U77 (vervolg): Weer, Wind en Lucht naast elkaar op hetzelfde frame, per stand van "Regen in Wind/Lucht". Eén
// pagina per beeld; de stand wisselt via de dev-knop en de modus via de tabelkop, dus data, tijd en uitsnede zijn per
// cel gelijk. Rijen: de standen; kolommen: Weer · Wind · Lucht. Magenta scheidt de cellen.
// Gebruik (vanuit web/, rig gekopieerd naar tmp/u77/):
//   U77_TIME=2026-10-11T0735 pnpm exec tsx tmp/u77/mode-shots.ts <baseURL> <label> <390|1280> <dag-vast|nacht-vast> [lng,lat,zoom|-] [standen, komma's]
import { chromium, devices } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import sharp from 'sharp'

const [baseURL = 'http://127.0.0.1:4320', label = 'modi', device = '1280', scene = 'dag-vast', view = '-', variantList = 'huidig,als-weer,gedempt,vermenigvuldigd'] = process.argv.slice(2)
const variants = variantList.split(',')
const MODES = ['Weer', 'Wind', 'Lucht']
const timeParameter = process.env.U77_TIME
if (!timeParameter) throw new Error('Zet U77_TIME (bv. 2026-10-11T0735): alle cellen moeten hetzelfde frame tonen')
const outputDir = new URL('./out/', import.meta.url).pathname
mkdirSync(outputDir, { recursive: true })

const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const mobile = device === '390'
const context = await browser.newContext(mobile ? { ...devices['Pixel 5'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 800 } })
await context.addInitScript(([storedView, fixedTheme]) => {
  if (storedView !== '-') {
    const [lng, lat, zoom] = storedView!.split(',').map(Number)
    localStorage.setItem('motregen-map-view', JSON.stringify({ lng, lat, zoom }))
  }
  // Een vast thema met Expressief uit: de radartijd bepaalt anders zelf of de kaart licht of donker is.
  localStorage.setItem('motregen-theme', fixedTheme!)
  localStorage.setItem('motregen-expressive', 'off')
  addEventListener('DOMContentLoaded', () => { const style = document.createElement('style'); style.textContent = '.dev-panel { opacity: 0 !important; pointer-events: none !important; }'; document.head.append(style) })
}, [view, scene === 'nacht-vast' ? 'dark' : 'light'])
const page = await context.newPage()
await page.goto(`${baseURL}/?dev#t=${timeParameter}`)
await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
await page.waitForTimeout(2_500)
if (await page.locator('.freshness-dialog[open]').count()) {
  await page.keyboard.press('Escape')
  await page.locator('.freshness-dialog[open]').waitFor({ state: 'detached', timeout: 5_000 }).catch(() => undefined)
}
await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
await page.waitForTimeout(8_000)

const shell = page.locator('.map-shell')
const cells: Buffer[] = []
const notes: string[] = []
for (const variant of variants) {
  await page.evaluate((value) => {
    const control = [...document.querySelectorAll('.dev-control')].find((element) => element.querySelector('label > span')?.textContent === 'Regen in Wind/Lucht')
    const select = control!.querySelector('select')!
    select.value = value
    if (select.value !== value) throw new Error(`Regen in Wind/Lucht kent de stand ${value} niet`)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  }, variant)
  for (const mode of MODES) {
    await page.locator('button', { hasText: new RegExp('^' + mode + '$') }).first().click()
    // De focus tweent; wachten tot de modus staat.
    await page.waitForTimeout(2_500)
    const map = page.locator('[data-rain-blend]')
    notes.push(`${variant}/${mode}: ${await map.getAttribute('data-rain-look')} ${await map.getAttribute('data-rain-blend')} dekking ${await map.getAttribute('data-rain-opacity')}`)
    const box = (await shell.boundingBox())!
    const cropWidth = mobile ? 390 : 520
    const cropHeight = mobile ? 420 : 520
    const clip = { x: box.x + (box.width - cropWidth) / 2, y: box.y + (mobile ? 110 : (box.height - cropHeight) / 2), width: cropWidth, height: cropHeight }
    const shot = await page.screenshot({ clip })
    const scale = mobile ? 2 : 1
    const { width: shotWidth = 0 } = await sharp(shot).metadata()
    const caption = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${shotWidth}" height="${34 * scale}"><rect width="100%" height="100%" fill="#000" fill-opacity="0.72"/><text x="${10 * scale}" y="${23 * scale}" font-family="sans-serif" font-size="${(mobile ? 14 : 17) * scale}" fill="#fff">${mode} · regen in Wind/Lucht: ${variant}</text></svg>`)
    cells.push(await sharp(shot).composite([{ input: caption, left: 0, top: 0 }]).png().toBuffer())
  }
}
await browser.close()

const { width: cellWidth = 0, height: cellHeight = 0 } = await sharp(cells[0]!).metadata()
const columns = MODES.length
const rows = Math.ceil(cells.length / columns)
const gap = 8
const file = `${outputDir}${label}-${scene}-${device}.png`
await sharp({ create: { width: (cellWidth + gap) * columns - gap, height: (cellHeight + gap) * rows - gap, channels: 3, background: '#ff00ff' } })
  .composite(cells.map((input, index) => ({ input, left: (index % columns) * (cellWidth + gap), top: Math.floor(index / columns) * (cellHeight + gap) })))
  .png().toFile(file)
console.log(`${file} · ${timeParameter}`)
console.log(notes.join('\n'))
