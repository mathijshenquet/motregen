// U77: flikkert de rand van het regengebied bij afspelen? Eén pagina, één uitsnede rond een motregengebied; de
// kaarttijd loopt per minuut door het radarverleden (via de hash, zoals een permalink) en per stand van
// Regenmenging wordt elke minuut een beeld genomen. Alles behalve kaart en regen is verborgen (windstreepjes
// bewegen zelf). Twee uitkomsten:
// - een filmstrip per menging (om zelf te kijken), en
// - een maat voor flikkeren: per pixel en per drietal beelden (t − k, t, t + k) de "omkering": hoe ver de
//   helderheid heen én weer terug gaat (0 als hij één kant op loopt). k = 1 minuut is trillen binnen een stap,
//   k = 5 minuten is aan-uit-aan over drie radarbeelden. Geteld worden pixels met een omkering van meer dan
//   POP_LEVELS helderheidsniveaus (0–255): een zichtbare knipper.
// Gebruik (vanuit web/, rig gekopieerd naar tmp/u77/):
//   pnpm exec tsx tmp/u77/edge-flicker.ts <baseURL> <label> <starttijd 2026-10-11T0650> <minuten> <lng,lat,zoom> <palet> <dag-vast|nacht-vast> <menging,menging,...>
import { chromium } from '@playwright/test'
import { mkdirSync, writeFileSync } from 'node:fs'
import sharp from 'sharp'

const [baseURL = 'http://127.0.0.1:4320', label = 'flikker', startTime = '', minuteCount = '40', view = '5.0,51.6,9', palette = 'violet-klassen', scene = 'dag-vast', blendList = 'zuiver,drempel,drempel-zacht'] = process.argv.slice(2)
const blends = blendList.split(',')
const outputDir = new URL('./out/', import.meta.url).pathname
mkdirSync(outputDir, { recursive: true })
const POP_LEVELS = 12
const CROP = 360

// Kaarttijden als Amsterdamse wandkloktijd; rekenen als UTC en weer uitschrijven houdt de notatie van de permalink.
const startMatch = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})$/.exec(startTime)
if (!startMatch) throw new Error('Starttijd als 2026-10-11T0650')
const startMs = Date.UTC(Number(startMatch[1]), Number(startMatch[2]) - 1, Number(startMatch[3]), Number(startMatch[4]), Number(startMatch[5]))
const times = Array.from({ length: Number(minuteCount) + 1 }, (_, minute) => {
  const iso = new Date(startMs + minute * 60_000).toISOString()
  return `${iso.slice(0, 10)}T${iso.slice(11, 13)}${iso.slice(14, 16)}`
})

const browser = await chromium.launch({ args: ['--enable-webgl', '--ignore-gpu-blocklist', '--use-angle=swiftshader'] })
const context = await browser.newContext({ viewport: { width: 1280, height: 800 } })
await context.addInitScript(([storedView, fixedTheme, storedPalette]) => {
  const [lng, lat, zoom] = storedView!.split(',').map(Number)
  localStorage.setItem('motregen-map-view', JSON.stringify({ lng, lat, zoom }))
  localStorage.setItem('motregen-theme', fixedTheme!)
  localStorage.setItem('motregen-expressive', 'off')
  localStorage.setItem('motregen-dev-regenpalet', storedPalette!)
  // De hash opent het klokpaneel als modaal venster; de achtergrond daarvan zou de hele kaart dimmen.
  addEventListener('DOMContentLoaded', () => {
    const style = document.createElement('style')
    style.textContent = '.dev-panel, .freshness-dialog, .maplibregl-marker, .map-overlay:not(.map-overlay-motregen-rain) { opacity: 0 !important; pointer-events: none !important; } .freshness-dialog::backdrop { background: transparent !important; backdrop-filter: none !important; }'
    document.head.append(style)
  })
}, [view, scene === 'nacht-vast' ? 'dark' : 'light', palette])
const page = await context.newPage()
await page.goto(`${baseURL}/?dev#t=${times[0]}`)
await page.locator('.map-splash.ready').waitFor({ state: 'attached', timeout: 60_000 })
await page.waitForTimeout(10_000)

async function showTime(time: string, settleMs: number): Promise<void> {
  await page.evaluate((hash) => { location.hash = hash }, `#t=${time}`)
  await page.waitForTimeout(settleMs)
}
// Eén keer door alle tijden, zodat elk radarbeeld geladen is vóór er gemeten wordt.
for (const time of times) await showTime(time, 250)

const box = (await page.locator('.map-shell').boundingBox())!
const clip = { x: Math.round(box.x + (box.width - CROP) / 2), y: Math.round(box.y + (box.height - CROP) / 2), width: CROP, height: CROP }
const luminanceOf = async (png: Buffer): Promise<Float32Array> => {
  const raw = await sharp(png).removeAlpha().raw().toBuffer()
  const luminance = new Float32Array(raw.length / 3)
  for (let pixel = 0; pixel < luminance.length; pixel++) luminance[pixel] = 0.2126 * raw[pixel * 3]! + 0.7152 * raw[pixel * 3 + 1]! + 0.0722 * raw[pixel * 3 + 2]!
  return luminance
}

function reversals(frames: Float32Array[], lag: number): { popPixelShare: number; meanReversal: number; popsPerFrame: number[] } {
  let pops = 0
  let total = 0
  let samples = 0
  const popsPerFrame: number[] = []
  for (let frame = lag; frame + lag < frames.length; frame++) {
    const popsBefore = pops
    const before = frames[frame - lag]!, now = frames[frame]!, after = frames[frame + lag]!
    for (let pixel = 0; pixel < now.length; pixel++) {
      const arriving = now[pixel]! - before[pixel]!
      const leaving = after[pixel]! - now[pixel]!
      const reversal = arriving * leaving < 0 ? Math.min(Math.abs(arriving), Math.abs(leaving)) : 0
      if (reversal > POP_LEVELS) pops++
      total += reversal
      samples++
    }
    popsPerFrame.push(pops - popsBefore)
  }
  return { popPixelShare: pops / samples, meanReversal: total / samples, popsPerFrame }
}

const summary: Record<string, unknown>[] = []
const minuteRows: Buffer[] = []
const radarRows: Buffer[] = []
const STRIP_FRAMES = 9

async function stripRow(shots: Buffer[], shotTimes: string[], frames: number[], title: string): Promise<Buffer> {
  const cellSize = CROP / 2
  const captionHeight = 26
  const width = (cellSize + 4) * frames.length - 4
  const cells = await Promise.all(frames.map((frame) => sharp(shots[frame]!).resize(cellSize).png().toBuffer()))
  const clock = (frame: number) => `${shotTimes[frame]!.slice(11, 13)}:${shotTimes[frame]!.slice(13)}`
  const labels = frames.map((frame, cell) => `<text x="${cell * (cellSize + 4) + 6}" y="${captionHeight + 16}" font-family="sans-serif" font-size="13" fill="#000" stroke="#fff" stroke-width="3" paint-order="stroke">${clock(frame)}</text>`).join('')
  const overlay = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${cellSize + captionHeight}"><rect width="100%" height="${captionHeight}" fill="#111"/><text x="8" y="18" font-family="sans-serif" font-size="15" fill="#fff">${title}</text>${labels}</svg>`)
  return sharp({ create: { width, height: cellSize + captionHeight, channels: 3, background: '#ff00ff' } })
    .composite([...cells.map((input, cell) => ({ input, left: cell * (cellSize + 4), top: captionHeight })), { input: overlay, left: 0, top: 0 }]).png().toBuffer()
}
for (const blend of blends) {
  await page.evaluate((value) => {
    const control = [...document.querySelectorAll('.dev-control')].find((element) => element.querySelector('label > span')?.textContent === 'Regenmenging')
    const select = control!.querySelector('select')!
    select.value = value
    if (select.value !== value) throw new Error(`Regenmenging kent de stand ${value} niet`)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  }, blend)
  const lookOnPage = await page.locator('[data-rain-look]').getAttribute('data-rain-look')
  const frames: Float32Array[] = []
  const shots: Buffer[] = []
  for (const time of times) {
    await showTime(time, 350)
    const shot = await page.screenshot({ clip })
    shots.push(shot)
    frames.push(await luminanceOf(shot))
  }
  const perMinute = reversals(frames, 1)
  const perRadarFrame = reversals(frames, 5)
  summary.push({ blend, look: lookOnPage, frames: frames.length,
    knipperPerMinuutPromille: Math.round(perMinute.popPixelShare * 1e5) / 100, omkeringPerMinuut: Math.round(perMinute.meanReversal * 1000) / 1000,
    knipperPerRadarbeeldPromille: Math.round(perRadarFrame.popPixelShare * 1e5) / 100, omkeringPerRadarbeeld: Math.round(perRadarFrame.meanReversal * 1000) / 1000,
    // Knipperpixels per minuut (vanaf de tweede minuut): pieken op de wissel van radarbeeld, of verspreid?
    knipperpixelsPerMinuut: perMinute.popsPerFrame.join(' ') })
  // Twee strips op halve grootte: negen opeenvolgende minuten uit het midden (trilt de rand?), en om de vijf minuten
  // over de hele reeks (gaat een buitje aan, uit en weer aan over drie radarbeelden?).
  const middle = Math.max(0, Math.floor((shots.length - STRIP_FRAMES) / 2))
  minuteRows.push(await stripRow(shots, times, Array.from({ length: STRIP_FRAMES }, (_, cell) => middle + cell), `${palette} · menging ${blend} · per minuut`))
  radarRows.push(await stripRow(shots, times, Array.from({ length: STRIP_FRAMES }, (_, cell) => cell * 5).filter((frame) => frame < shots.length), `${palette} · menging ${blend} · per radarbeeld (5 min)`))
}
const sources = await page.locator('[data-rain-sources]').getAttribute('data-rain-sources')
await browser.close()

async function writeStrip(rows: Buffer[], name: string): Promise<string> {
  const { width: rowWidth = 0, height: rowHeight = 0 } = await sharp(rows[0]!).metadata()
  const stripFile = `${outputDir}${label}-${name}.png`
  await sharp({ create: { width: rowWidth, height: (rowHeight + 6) * rows.length - 6, channels: 3, background: '#ff00ff' } })
    .composite(rows.map((input, index) => ({ input, left: 0, top: index * (rowHeight + 6) }))).png().toFile(stripFile)
  return stripFile
}
const stripFiles = [await writeStrip(minuteRows, 'per-minuut'), await writeStrip(radarRows, 'per-radarbeeld')]
const result = { label, palette, scene, view, times: `${times[0]} … ${times[times.length - 1]}`, sourcesAtEnd: sources, popLevels: POP_LEVELS, summary }
writeFileSync(`${outputDir}${label}.json`, JSON.stringify(result, null, 1))
console.log(JSON.stringify(result))
console.log(stripFiles.join('\n'))
