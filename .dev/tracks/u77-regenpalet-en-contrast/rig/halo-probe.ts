// U77-diagnose: wat staat er werkelijk in de regencanvas, en hoe mengt de browser dat met de kaart?
// De pagina toont alleen de regencanvas, één keer op zwart en één keer op wit. Uit die twee beelden volgt per
// pixel de voorvermenigvuldigde kleur P (het zwarte beeld) en de alfa A van de canvas (wit = P + (1 − A) × 255).
// Onder de inzet van het palet (bytes ≤ 55) is de paletkleur vast (54, 183, 255), dus daar is de dekking uit het
// palet gewoon P.blauw / 255 en is te toetsen of de canvas-alfa die dekking is (zuivere menging) of het kwadraat.
// Gebruik (vanuit web/, rig gekopieerd naar tmp/u77/):
//   U77_TIME=2026-10-10T1415 pnpm exec tsx tmp/u77/halo-probe.ts <baseURL> [sleutel=waarde,...]
import { chromium } from '@playwright/test'
import sharp from 'sharp'

const [baseURL = 'http://127.0.0.1:4320', settings = ''] = process.argv.slice(2)
const timeParameter = process.env.U77_TIME
if (!timeParameter) throw new Error('Zet U77_TIME (bv. 2026-10-10T1415): beide beelden moeten hetzelfde frame tonen')

const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
await context.addInitScript((storedSettings) => {
  for (const pair of storedSettings.split(',').filter(Boolean)) {
    const [key, value] = pair.split('=')
    localStorage.setItem(`motregen-${key}`, value!)
  }
}, settings)
const page = await context.newPage()
await page.goto(`${baseURL}/?dev#t=${timeParameter}`)
await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
await page.waitForTimeout(2_500)
if (await page.locator('.freshness-dialog[open]').count()) await page.keyboard.press('Escape')
await page.waitForTimeout(8_000)

const sources = await page.locator('[data-rain-sources]').getAttribute('data-rain-sources')
const clip = (await page.locator('.map-overlay-motregen-rain').boundingBox())!
async function rainOn(backdrop: string): Promise<Buffer> {
  await page.addStyleTag({ content: `html { background: ${backdrop} !important } body, body * { visibility: hidden !important } .map-overlay-motregen-rain { visibility: visible !important }` })
  await page.waitForTimeout(300)
  return sharp(await page.screenshot({ clip })).removeAlpha().raw().toBuffer()
}
const onBlack = await rainOn('#000')
const onWhite = await rainOn('#fff')
await browser.close()

// Dekking uit het palet: min(210, byte × 1,6) / 255. In klassen van de byte, zodat de tabel de aanloop toont.
const classes = [
  { label: 'byte 1–15 (< 0,02 mm/u)', from: 1.6 / 255, to: 24 / 255 },
  { label: 'byte 15–30 (0,02–0,03)', from: 24 / 255, to: 48 / 255 },
  { label: 'byte 30–45 (0,03–0,05)', from: 48 / 255, to: 72 / 255 },
  { label: 'byte 45–55 (0,05–0,08)', from: 72 / 255, to: 88 / 255 },
]
const sums = classes.map(() => ({ pixels: 0, paletteAlpha: 0, canvasAlpha: 0 }))
let rainPixels = 0
let belowOnset = 0
for (let offset = 0; offset < onBlack.length; offset += 3) {
  const red = onBlack[offset]!, green = onBlack[offset + 1]!, blue = onBlack[offset + 2]!
  if (red + green + blue === 0) continue
  rainPixels++
  // De vaste beginkleur heeft rood : blauw = 54 : 255; verder op de schaal loopt rood of groen op.
  const isOnsetColour = blue >= 3 && Math.abs(red / blue - 54 / 255) < 0.05 && Math.abs(green / blue - 183 / 255) < 0.05
  if (!isOnsetColour) continue
  const paletteAlpha = blue / 255
  // Rood, niet blauw: de beginkleur heeft blauw = 255, dus op wit loopt blauw bij elke te lage canvas-alfa vast op 255.
  const canvasAlpha = 1 - (onWhite[offset]! - red) / 255
  const index = classes.findIndex((entry) => paletteAlpha >= entry.from && paletteAlpha < entry.to)
  if (index < 0) continue
  belowOnset++
  sums[index]!.pixels++
  sums[index]!.paletteAlpha += paletteAlpha
  sums[index]!.canvasAlpha += canvasAlpha
}

console.log(`tijd ${timeParameter} · bronnen ${sources} · instellingen ${settings || '(geen)'}`)
console.log(`regenpixels ${rainPixels} · waarvan onder de inzet (byte < 55, vaste beginkleur) ${belowOnset} = ${(100 * belowOnset / rainPixels).toFixed(1)} %`)
console.log('| klasse | pixels | dekking uit palet (α) | α² | canvas-alfa gemeten |')
console.log('| --- | --- | --- | --- | --- |')
for (const [index, entry] of classes.entries()) {
  const sum = sums[index]!
  if (!sum.pixels) { console.log(`| ${entry.label} | 0 | – | – | – |`); continue }
  const alpha = sum.paletteAlpha / sum.pixels
  console.log(`| ${entry.label} | ${sum.pixels} | ${alpha.toFixed(3)} | ${(alpha * alpha).toFixed(3)} | ${(sum.canvasAlpha / sum.pixels).toFixed(3)} |`)
}
