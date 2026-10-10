// U77: combinaties van Regenpalet en Regenmenging naast elkaar op exact hetzelfde frame (naar rig/field-shots.ts van
// U72). Eén pagina per beeld; de stand wisselt via de dev-knoppen zelf, dus data, tijd en uitsnede zijn per cel
// gelijk. Magenta scheidt de cellen. Gebruik (vanuit web/, rig gekopieerd naar tmp/u77/):
//   pnpm exec tsx tmp/u77/look-shots.ts <baseURL> <label> <390|1280> <dag|nacht|nacht-vast> <uren vooruit> <lng,lat,zoom|-> <palet/menging,palet/menging,...>
// U77_TIME=2026-10-10T1415 zet een vaste kaarttijd (Amsterdam) in plaats van uren vooruit. U77_PANEL=1 neemt het
// hele kaartvlak met het histogram erbij (één kolom per cel) in plaats van de uitsnede. U77_MODE=Wind|Lucht kiest de kaartmodus.
import { chromium, devices } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import sharp from 'sharp'

const [baseURL = 'http://127.0.0.1:4320', label = 'paletten', device = '1280', scene = 'dag', hoursAhead = '0', view = '-', lookList = 'huidig/huidig'] = process.argv.slice(2)
const looks = lookList.split(',').map((entry) => { const [palette, blend] = entry.split('/'); return { palette: palette!, blend: blend! } })
const outputDir = new URL('./out/', import.meta.url).pathname
mkdirSync(outputDir, { recursive: true })

const target = new Date(Date.now() + Number(hoursAhead) * 3_600_000)
const amsterdam = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam', dateStyle: 'short', timeStyle: 'short' }).format(target)
const timeParameter = process.env.U77_TIME ?? amsterdam.replace(' ', 'T').replace(':', '')
const wholePanel = process.env.U77_PANEL === '1'

const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const mobile = device === '390'
const context = await browser.newContext(mobile ? { ...devices['Pixel 5'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 800 } })
await context.addInitScript(([storedView, fixedNight]) => {
  if (storedView !== '-') {
    const [lng, lat, zoom] = storedView!.split(',').map(Number)
    localStorage.setItem('motregen-map-view', JSON.stringify({ lng, lat, zoom }))
  }
  // De kaart volgt de kaarttijd zolang Expressief aan staat; een nachtbeeld op een dagtijd (radar) vraagt dus om
  // een vast donker thema met Expressief uit.
  if (fixedNight) { localStorage.setItem('motregen-theme', 'dark'); localStorage.setItem('motregen-expressive', 'off') }
  addEventListener('DOMContentLoaded', () => { const style = document.createElement('style'); style.textContent = '.dev-panel { opacity: 0 !important; pointer-events: none !important; }'; document.head.append(style) })
}, [view, scene === 'nacht-vast' ? 'ja' : ''])
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

async function choose(controlLabel: string, value: string): Promise<void> {
  await page.evaluate(([wantedLabel, wantedValue]) => {
    const control = [...document.querySelectorAll('.dev-control')].find((element) => element.querySelector('label > span')?.textContent === wantedLabel)
    const select = control!.querySelector('select')!
    select.value = wantedValue!
    if (select.value !== wantedValue) throw new Error(`${wantedLabel} kent de stand ${wantedValue} niet`)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  }, [controlLabel, value])
}

// U77_MODE=Wind of Lucht: de kaartmodus via de tabelkop, om een palet ook daar te zien (de menging blijft er huidig).
if (process.env.U77_MODE) {
  await page.locator('button', { hasText: new RegExp('^' + process.env.U77_MODE + '$') }).first().click()
  await page.waitForTimeout(2_500)
}
const shell = page.locator('.map-shell')
const cells: Buffer[] = []
let sources = ''
for (const look of looks) {
  await choose('Regenpalet', look.palette)
  await choose('Regenmenging', look.blend)
  await page.waitForTimeout(700)
  sources = await page.locator('[data-rain-sources]').getAttribute('data-rain-sources') ?? '?'
  const box = (await shell.boundingBox())!
  // De uitsnede is het midden van de kaart, op schermpixels (geen verkleining: het gaat om randen en tinten).
  const cropWidth = mobile ? 390 : 520
  const cropHeight = mobile ? 420 : 520
  const centreCrop = { x: box.x + (box.width - cropWidth) / 2, y: box.y + (mobile ? 110 : (box.height - cropHeight) / 2), width: cropWidth, height: cropHeight }
  const viewport = page.viewportSize()!
  const shot = await page.screenshot({ clip: wholePanel ? { x: 0, y: 0, width: viewport.width, height: mobile ? viewport.height : 260 } : centreCrop })
  const scale = mobile ? 2 : 1
  const { width: shotWidth = 0 } = await sharp(shot).metadata()
  const caption = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${shotWidth}" height="${34 * scale}"><rect width="100%" height="100%" fill="#000" fill-opacity="0.72"/><text x="${10 * scale}" y="${23 * scale}" font-family="sans-serif" font-size="${17 * scale}" fill="#fff">${look.palette} · menging ${look.blend}</text></svg>`)
  cells.push(await sharp(shot).composite([{ input: caption, left: 0, top: wholePanel ? (await sharp(shot).metadata()).height! - 34 * scale : 0 }]).png().toBuffer())
}
await browser.close()

const { width: cellWidth = 0, height: cellHeight = 0 } = await sharp(cells[0]!).metadata()
const columns = wholePanel ? (mobile ? Math.min(4, cells.length) : 1) : Math.min(3, cells.length)
const rows = Math.ceil(cells.length / columns)
const gap = 8
const file = `${outputDir}${label}-${scene}-${device}.png`
await sharp({ create: { width: (cellWidth + gap) * columns - gap, height: (cellHeight + gap) * rows - gap, channels: 3, background: '#ff00ff' } })
  .composite(cells.map((input, index) => ({ input, left: (index % columns) * (cellWidth + gap), top: Math.floor(index / columns) * (cellHeight + gap) })))
  .png().toFile(file)
console.log(`${file} · ${timeParameter} · bronnen ${sources} · ${looks.map((look) => `${look.palette}/${look.blend}`).join(' | ')}`)
