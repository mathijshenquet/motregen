// U108 diagram: visuele afwijking van een gegeneraliseerde laag tegen zijn bron, op de doelresolutie van de zoom.
// Beide maskers (SS× overbemonsterd) gaan naar dekking per doelpixel en worden met σ_p = 1 px vervaagd: wat het oog
// op die zoom ziet; details onder een pixel tellen nauwelijks mee. E = Σ|kandidaat − bron| / Σ bron, over het kader en
// het 95e percentiel per 256-px-tegel (alleen tegels met ≥ 2 % dekking).
// Gebruik (vanuit web/): node --import tsx ../tools/basemap/diagram-metric.mts BRON.tif KANDIDAAT.tif SS
import { createRequire } from 'node:module'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const require = createRequire(resolve(dirname(fileURLToPath(import.meta.url)), '../../web/package.json'))
const sharp = require('sharp')
sharp.cache(false)

const [sourcePath, candidatePath, ssText] = process.argv.slice(2)
if (!sourcePath || !candidatePath || !ssText) throw new Error('Gebruik: diagram-metric.mts BRON.tif KANDIDAAT.tif SS')
const ss = Number(ssText)
async function coverage(path: string) {
  const meta = await sharp(path, { limitInputPixels: false }).metadata()
  const width = Math.floor(meta.width! / ss), height = Math.floor(meta.height! / ss)
  const { data } = await sharp(path, { limitInputPixels: false }).extractChannel(0)
    .resize(width, height, { kernel: 'linear', fit: 'fill' }).blur(1).raw().toBuffer({ resolveWithObject: true })
  return { width, height, data: data as Buffer }
}
const source = await coverage(sourcePath)
const candidate = await coverage(candidatePath)
let difference = 0, ink = 0
const tiles = new Map<string, { difference: number; ink: number; pixels: number }>()
for (let y = 0; y < source.height; y++) for (let x = 0; x < source.width; x++) {
  const index = y * source.width + x
  const a = source.data[index]!, b = candidate.data[index]!
  difference += Math.abs(a - b); ink += a
  const key = `${x >> 8}/${y >> 8}`
  const tile = tiles.get(key) ?? { difference: 0, ink: 0, pixels: 0 }
  tile.difference += Math.abs(a - b); tile.ink += a; tile.pixels++
  tiles.set(key, tile)
}
const perTile = [...tiles.values()].filter((tile) => tile.ink > tile.pixels * 255 * 0.02).map((tile) => tile.difference / tile.ink).sort((a, b) => a - b)
console.log(JSON.stringify({ E: +(difference / Math.max(1, ink)).toFixed(4), p95Tile: +(perTile[Math.floor(perTile.length * 0.95)] ?? 0).toFixed(4), tiles: perTile.length }))
