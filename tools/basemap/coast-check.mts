// U108: kustcontrole. Rastert de waterlaag van twee archieven per gebied (eilanden, Zeeland, IJsselmeer, Biesbosch) en
// per zoom op de doelresolutie (4× overbemonsterd), telt het landoppervlak en vergelijkt kandidaat met referentie.
// Faalt (exit 1) als een gebied meer dan 10 % plus 1 px² land verliest (eiland weg) of meer dan 25 % plus 1 px² land
// wint (zee weg; weggelaten plassen geven tot ~20 % winst). Schrijft coast-check.json en een verschilblad
// (rood: land verloren, groen: land erbij).
// REFERENTIE is een archief, of `BRON.gpkg:laag` (een polygoonlaag in EPSG:3857, met gdal_rasterize op hetzelfde raster
// gelegd): dan telt de bron zelf, niet een ander gegeneraliseerd archief.
// Gebruik (vanuit web/): node --import tsx ../tools/basemap/coast-check.mts REFERENTIE KANDIDAAT UITMAP [zoom…]
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
const require = createRequire(resolve(dirname(fileURLToPath(import.meta.url)), '../../web/package.json'))
const { PMTiles } = require('pmtiles')
const { VectorTile } = require('@mapbox/vector-tile')
const Pbf = require('pbf').default
const sharp = require('sharp')

const [referencePath, candidatePath, outDirectory, ...zoomArguments] = process.argv.slice(2)
if (!referencePath || !candidatePath || !outDirectory) throw new Error('Gebruik: coast-check.mts REFERENTIE KANDIDAAT UITMAP [zoom…]')
const zooms = zoomArguments.length ? zoomArguments.map(Number) : [5, 6, 7, 8, 9, 10]
const OVERSAMPLE = 4
const MAX_LOSS = 0.1
const MAX_GAIN = 0.25

const REGIONS: Array<{ name: string; box: [number, number, number, number] }> = [
  { name: 'Texel', box: [4.70, 52.98, 4.93, 53.19] },
  { name: 'Vlieland', box: [4.88, 53.22, 5.12, 53.31] },
  { name: 'Terschelling', box: [5.15, 53.35, 5.60, 53.47] },
  { name: 'Ameland', box: [5.60, 53.42, 5.95, 53.50] },
  { name: 'Schiermonnikoog', box: [6.08, 53.46, 6.35, 53.51] },
  { name: 'Rottum–Borkum', box: [6.50, 53.53, 6.80, 53.62] },
  { name: 'Afsluitdijk–Wieringen', box: [4.95, 52.88, 5.40, 53.08] },
  { name: 'Hollandse kust', box: [4.30, 52.00, 4.70, 52.50] },
  { name: 'Marken', box: [5.07, 52.43, 5.17, 52.48] },
  { name: 'Marker Wadden', box: [5.32, 52.56, 5.42, 52.62] },
  { name: 'Flevoland', box: [5.15, 52.28, 5.95, 52.70] },
  { name: 'Urk–Noordoostpolder', box: [5.55, 52.62, 5.75, 52.72] },
  { name: 'Voorne-Putten', box: [4.00, 51.82, 4.40, 51.92] },
  { name: 'Hoeksche Waard', box: [4.30, 51.70, 4.65, 51.82] },
  { name: 'Goeree-Overflakkee', box: [3.85, 51.70, 4.45, 51.86] },
  { name: 'Schouwen-Duiveland', box: [3.68, 51.62, 4.12, 51.77] },
  { name: 'Tholen', box: [4.00, 51.52, 4.25, 51.63] },
  { name: 'Noord-Beveland', box: [3.66, 51.54, 3.92, 51.62] },
  { name: 'Walcheren', box: [3.40, 51.44, 3.72, 51.62] },
  { name: 'Zuid-Beveland', box: [3.70, 51.40, 4.20, 51.55] },
  { name: 'Zeeuws-Vlaanderen', box: [3.40, 51.25, 4.20, 51.42] },
  { name: 'Biesbosch', box: [4.68, 51.70, 4.90, 51.79] },
]

function open(path: string) {
  const bytes = readFileSync(path)
  const source = { getKey: () => path, getBytes: async (offset: number, length: number) => ({ data: bytes.buffer.slice(bytes.byteOffset + offset, bytes.byteOffset + offset + length) }) }
  const archive = new PMTiles(source)
  const cache = new Map<string, string>()
  /** SVG-paden van de waterpolygonen van één tegel, in wereldpixels van die zoom en geknipt op de tegel. */
  return async (z: number, x: number, y: number) => {
    const key = `${z}/${x}/${y}`
    if (cache.has(key)) return cache.get(key)!
    const tile = await archive.getZxy(z, x, y)
    let paths = ''
    if (tile) {
      const raw = Buffer.from(tile.data)
      const layer = new VectorTile(new Pbf(raw[0] === 0x1f ? gunzipSync(raw) : raw)).layers.water
      for (let index = 0; layer && index < layer.length; index++) {
        const feature = layer.feature(index)
        if (feature.type !== 3) continue
        const scale = 256 / feature.extent
        const d = (feature.loadGeometry() as Array<Array<{ x: number; y: number }>>)
          .map((ring) => ring.map((point, i) => `${i ? 'L' : 'M'}${(x * 256 + point.x * scale).toFixed(2)},${(y * 256 + point.y * scale).toFixed(2)}`).join('') + 'Z').join('')
        paths += `<path d="${d}"/>`
      }
    }
    const clipped = paths && `<clipPath id="c${z}-${x}-${y}"><rect x="${x * 256}" y="${y * 256}" width="256" height="256"/></clipPath><g clip-path="url(#c${z}-${x}-${y})" fill="#fff" fill-rule="evenodd">${paths}</g>`
    cache.set(key, clipped)
    return clipped
  }
}

const lonToX = (lon: number, z: number) => (lon + 180) / 360 * 2 ** z * 256
const latToY = (lat: number, z: number) => (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** z * 256

/** Waterraster (1 = water) van een gebied op zoom z. */
async function rasterize(tiles: ReturnType<typeof open>, box: [number, number, number, number], z: number) {
  const [left, top, right, bottom] = [lonToX(box[0], z), latToY(box[3], z), lonToX(box[2], z), latToY(box[1], z)]
  const width = Math.max(1, Math.round((right - left) * OVERSAMPLE)), height = Math.max(1, Math.round((bottom - top) * OVERSAMPLE))
  let body = ''
  for (let x = Math.floor(left / 256); x <= Math.floor(right / 256); x++) for (let y = Math.floor(top / 256); y <= Math.floor(bottom / 256); y++) body += await tiles(z, x, y)
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${left} ${top} ${right - left} ${bottom - top}" shape-rendering="crispEdges"><rect x="${left}" y="${top}" width="${right - left}" height="${bottom - top}" fill="#000"/>${body}</svg>`
  const { data } = await sharp(Buffer.from(svg)).greyscale().raw().toBuffer({ resolveWithObject: true })
  return { width, height, water: Uint8Array.from(data, (value: number) => value > 127 ? 1 : 0) }
}

const WORLD = 40075016.6856
const scratch = mkdtempSync(resolve(tmpdir(), 'coast-'))
/** Waterraster uit een GPKG-laag op precies het raster van rasterize(). */
async function rasterizeSource(source: string, box: [number, number, number, number], z: number) {
  const [path, layer] = source.split(/:(?=[^:]+$)/)
  const [left, top, right, bottom] = [lonToX(box[0], z), latToY(box[3], z), lonToX(box[2], z), latToY(box[1], z)]
  const width = Math.max(1, Math.round((right - left) * OVERSAMPLE)), height = Math.max(1, Math.round((bottom - top) * OVERSAMPLE))
  const meters = (value: number) => value / (256 * 2 ** z) * WORLD
  // Eén uitsnede per gebied: gdal_rasterize leest anders bij elke zoom de hele bronlaag.
  const clip = resolve(scratch, `${box.join('_')}.gpkg`)
  if (!existsSync(clip)) {
    execFileSync('ogr2ogr', ['--config', 'OGR2OGR_USE_ARROW_API', 'NO', '-f', 'GPKG', clip, path!, layer!, '-nln', layer!, '-spat', String(box[0] - 0.05), String(box[1] - 0.05), String(box[2] + 0.05), String(box[3] + 0.05), '-spat_srs', 'EPSG:4326'])
  }
  const output = resolve(scratch, 'source.tif')
  rmSync(output, { force: true })
  execFileSync('gdal_rasterize', ['-q', '-l', layer!, '-burn', '255', '-ot', 'Byte', '-init', '0', '-a_nodata', 'none', '-ts', String(width), String(height),
    '-te', String(meters(left) - WORLD / 2), String(WORLD / 2 - meters(bottom)), String(meters(right) - WORLD / 2), String(WORLD / 2 - meters(top)), clip, output])
  const { data } = await sharp(output).extractChannel(0).raw().toBuffer({ resolveWithObject: true })
  return { width, height, water: Uint8Array.from(data, (value: number) => value > 127 ? 1 : 0) }
}
const fromSource = /\.gpkg:[^/]+$/.test(referencePath)
const reference = fromSource ? undefined : open(referencePath)
const candidate = open(candidatePath)
mkdirSync(outDirectory, { recursive: true })
const CELL = { width: 150, height: 96 }
const results: Array<{ region: string; zoom: number; referenceLandPx: number; candidateLandPx: number; lostPx: number; gainedPx: number; ratio: number; ok: boolean }> = []
const cells: Array<{ input: Buffer; left: number; top: number }> = []
for (const [row, region] of REGIONS.entries()) {
  for (const [column, z] of zooms.entries()) {
    const a = reference ? await rasterize(reference, region.box, z) : await rasterizeSource(referencePath, region.box, z)
    const b = await rasterize(candidate, region.box, z)
    let referenceLand = 0, candidateLand = 0, lost = 0, gained = 0
    const pixels = Buffer.alloc(a.width * a.height * 3)
    for (let index = 0; index < a.water.length; index++) {
      const landA = !a.water[index], landB = !b.water[index]
      referenceLand += +landA; candidateLand += +landB
      if (landA && !landB) lost++
      if (!landA && landB) gained++
      const colour = landA && landB ? [238, 234, 226] : !landA && !landB ? [42, 111, 219] : landA ? [220, 30, 30] : [30, 170, 60]
      pixels.set(colour, index * 3)
    }
    const square = OVERSAMPLE * OVERSAMPLE
    const result = { region: region.name, zoom: z, referenceLandPx: referenceLand / square, candidateLandPx: candidateLand / square, lostPx: lost / square, gainedPx: gained / square, ratio: referenceLand ? candidateLand / referenceLand : 1, ok: true }
    result.ok = result.candidateLandPx >= result.referenceLandPx * (1 - MAX_LOSS) - 1 && result.candidateLandPx <= result.referenceLandPx * (1 + MAX_GAIN) + 1
    results.push(result)
    const image = await sharp(pixels, { raw: { width: a.width, height: a.height, channels: 3 } })
      .resize(CELL.width, CELL.height, { fit: 'contain', kernel: 'nearest', background: '#000' }).png().toBuffer()
    cells.push({ input: image, left: 150 + column * (CELL.width + 4), top: 24 + row * (CELL.height + 4) })
  }
}
const labels = [
  ...REGIONS.map((region, row) => `<text x="4" y="${24 + row * (CELL.height + 4) + CELL.height / 2}" font-size="13" fill="#fff">${region.name}</text>`),
  ...zooms.map((z, column) => `<text x="${150 + column * (CELL.width + 4) + 4}" y="16" font-size="13" fill="#fff">z${z}</text>`),
  ...results.map((result, index) => {
    const row = Math.floor(index / zooms.length), column = index % zooms.length
    return `<text x="${150 + column * (CELL.width + 4) + 4}" y="${24 + row * (CELL.height + 4) + CELL.height - 4}" font-size="11" fill="${result.ok ? '#fff' : '#f55'}" stroke="#000" stroke-width="2" paint-order="stroke">${(result.ratio * 100).toFixed(0)} %</text>`
  }),
].join('')
const sheetWidth = 150 + zooms.length * (CELL.width + 4), sheetHeight = 24 + REGIONS.length * (CELL.height + 4)
await sharp({ create: { width: sheetWidth, height: sheetHeight, channels: 3, background: '#111' } })
  .composite([...cells, { input: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${sheetWidth}" height="${sheetHeight}" font-family="sans-serif">${labels}</svg>`), left: 0, top: 0 }])
  .png().toFile(resolve(outDirectory, 'blad-kust.png'))
writeFileSync(resolve(outDirectory, 'coast-check.json'), `${JSON.stringify(results, null, 2)}\n`)
rmSync(scratch, { recursive: true, force: true })
const failures = results.filter((result) => !result.ok)
for (const failure of failures) console.log(`FAAL ${failure.region} z${failure.zoom}: land ${failure.referenceLandPx.toFixed(1)} → ${failure.candidateLandPx.toFixed(1)} px² (${(failure.ratio * 100).toFixed(0)} %)`)
console.log(`${results.length - failures.length}/${results.length} gebied×zoom binnen −${MAX_LOSS * 100} %/+${MAX_GAIN * 100} % land → ${resolve(outDirectory, 'blad-kust.png')}`)
process.exit(failures.length ? 1 : 0)
