// U72: de standen van Kaart › Regenveld naast elkaar op exact hetzelfde frame. Eén pagina per beeld; de stand
// wisselt via de dev-knop zelf, dus de data, de tijd en de uitsnede zijn per cel gelijk. Magenta scheidt de cellen.
// De PNG's uit out/ gaan als WebP (kwaliteit 92) naar beelden/; verliesvrij is 29 MB.
// Gebruik (vanuit web/, rig gekopieerd naar tmp/u72/):
//   pnpm exec tsx tmp/u72/field-shots.ts <baseURL> <label> <390|1280> <dag|nacht|nacht-vast> <radar|harmonie|tijd> <uren vooruit> [lng,lat,zoom] [standen, komma's]
// Groep `tijd` wisselt Tijdmenging HARMONIE. U72_TIME=2026-10-09T2330 zet een vaste kaarttijd (Amsterdam) in plaats
// van uren vooruit; U72_HARMONIE=<stand> zet vooraf het regenveld van HARMONIE.
import { chromium, devices } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import sharp from 'sharp'

const [baseURL = 'http://127.0.0.1:4320', label = 'veld', device = '1280', scene = 'dag', group = 'harmonie', hoursAhead = '8', view = '', variantList = ''] = process.argv.slice(2)
const CONTROLS: Record<string, { label: string; variants: string[] }> = {
  radar: { label: 'Regenveld radar/nowcast', variants: ['blokken', 'bilineair', 'bronlineair', 'glad', 'blur 3×3', 'blur 5×5', 'blur 7×7', 'blur 9×9'] },
  harmonie: { label: 'Regenveld HARMONIE', variants: ['blokken', 'bilineair', 'bronlineair', 'glad', 'blur 3×3', 'blur 5×5', 'blur 7×7', 'blur 9×9'] },
  tijd: { label: 'Tijdmenging HARMONIE', variants: ['kruisfade', 'vloeiend', 'meebewegen'] },
}
const control = CONTROLS[group]
if (!control) throw new Error(`Onbekende groep ${group}`)
const variants = variantList ? variantList.split(',') : control.variants
const outputDir = new URL('./out/', import.meta.url).pathname
mkdirSync(outputDir, { recursive: true })

const target = new Date(Date.now() + Number(hoursAhead) * 3_600_000)
const amsterdam = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Amsterdam', dateStyle: 'short', timeStyle: 'short' }).format(target)
const timeParameter = process.env.U72_TIME ?? amsterdam.replace(' ', 'T').replace(':', '')

const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const mobile = device === '390'
const context = await browser.newContext(mobile ? { ...devices['Pixel 5'], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 800 } })
await context.addInitScript(([storedView, theme, harmonie]) => {
  if (harmonie) localStorage.setItem('motregen-dev-regenveld-harmonie', harmonie)
  if (storedView) {
    const [lng, lat, zoom] = storedView.split(',').map(Number)
    localStorage.setItem('motregen-map-view', JSON.stringify({ lng, lat, zoom }))
  }
  // De kaart volgt de kaarttijd zolang Expressief aan staat; een nachtbeeld op een dagtijd (radar) vraagt dus om
  // een vast donker thema met Expressief uit.
  if (theme === 'nacht-vast') { localStorage.setItem('motregen-theme', 'dark'); localStorage.setItem('motregen-expressive', 'off') }
  addEventListener('DOMContentLoaded', () => { const style = document.createElement('style'); style.textContent = '.dev-panel { opacity: 0 !important; pointer-events: none !important; }'; document.head.append(style) })
}, [view, scene === 'nacht-vast' ? 'nacht-vast' : '', process.env.U72_HARMONIE ?? ''])
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
const controlLabel = control.label
const cells: Buffer[] = []
let sources = ''
for (const variant of variants) {
  await page.evaluate(([wantedLabel, value]) => {
    const control = [...document.querySelectorAll('.dev-control')].find((element) => element.querySelector('label > span')?.textContent === wantedLabel)
    const select = control!.querySelector('select')!
    select.value = value!
    select.dispatchEvent(new Event('change', { bubbles: true }))
  }, [controlLabel, variant])
  await page.waitForTimeout(700)
  sources = await page.locator('[data-rain-sources]').getAttribute('data-rain-sources') ?? '?'
  const box = (await shell.boundingBox())!
  // De uitsnede is het midden van de kaart, op schermpixels (geen verkleining: het gaat om de celranden).
  const cropWidth = mobile ? 390 : 520
  const cropHeight = mobile ? 420 : 520
  const clip = { x: box.x + (box.width - cropWidth) / 2, y: box.y + (mobile ? 110 : (box.height - cropHeight) / 2), width: cropWidth, height: cropHeight }
  const shot = await page.screenshot({ clip })
  const scale = mobile ? 2 : 1
  const caption = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${cropWidth * scale}" height="${34 * scale}"><rect width="100%" height="100%" fill="#000" fill-opacity="0.72"/><text x="${10 * scale}" y="${23 * scale}" font-family="sans-serif" font-size="${18 * scale}" fill="#fff">${variant}</text></svg>`)
  cells.push(await sharp(shot).composite([{ input: caption, left: 0, top: 0 }]).png().toBuffer())
}
await browser.close()

const { width: cellWidth = 0, height: cellHeight = 0 } = await sharp(cells[0]!).metadata()
const columns = Math.min(3, cells.length)
const rows = Math.ceil(cells.length / columns)
const gap = 8
const file = `${outputDir}${label}-${group}-${scene}-${device}.png`
await sharp({ create: { width: (cellWidth + gap) * columns - gap, height: (cellHeight + gap) * rows - gap, channels: 3, background: '#ff00ff' } })
  .composite(cells.map((input, index) => ({ input, left: (index % columns) * (cellWidth + gap), top: Math.floor(index / columns) * (cellHeight + gap) })))
  .png().toFile(file)
console.log(`${file} · ${process.env.U72_TIME ?? amsterdam} · bronnen ${sources} · ${variants.join(' | ')}`)
