// U108: stekel- en duntemetriek per zoom voor een polygoonlaag. Een stekel is een hoekpunt met een binnenhoek < 20°
// waarvan beide benen ≥ 1 px (van die zoom) zijn; een dunne vorm is een ring met equivalente breedte 2A/P < 0,75 px en
// omtrek > 4 px (een sloot of draad, op die zoom onleesbaar). Over alle tegels binnen het kader (standaard Nederland).
// Gebruik (vanuit web/): node --import tsx ../tools/basemap/spike-check.mts ARCHIEF LAAG [--box l,o,r,b] [zoom…]
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
const require = createRequire(resolve(dirname(fileURLToPath(import.meta.url)), '../../web/package.json'))
const { PMTiles } = require('pmtiles')
const { VectorTile } = require('@mapbox/vector-tile')
const Pbf = require('pbf').default

const args = process.argv.slice(2)
const [path, layerName] = args
if (!path || !layerName) throw new Error('Gebruik: spike-check.mts ARCHIEF LAAG [--box l,o,r,b] [zoom…]')
let box = [3.2, 50.7, 7.3, 53.6]
const zooms: number[] = []
for (let index = 2; index < args.length; index++) {
  if (args[index] === '--box') box = args[++index]!.split(',').map(Number)
  else zooms.push(Number(args[index]))
}
if (!zooms.length) zooms.push(5, 6, 7, 8, 9, 10)
const SPIKE_DEGREES = 20, THIN_PX = 0.75

const bytes = readFileSync(path)
const archive = new PMTiles({ getKey: () => path, getBytes: async (offset: number, length: number) => ({ data: bytes.buffer.slice(bytes.byteOffset + offset, bytes.byteOffset + offset + length) }) })
const lonToTile = (lon: number, z: number) => Math.floor((lon + 180) / 360 * 2 ** z)
const latToTile = (lat: number, z: number) => Math.floor((1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** z)

const rows = []
for (const z of zooms) {
  let polygons = 0, vertices = 0, spikes = 0, thin = 0, rings = 0
  for (let x = lonToTile(box[0]!, z); x <= lonToTile(box[2]!, z); x++) for (let y = latToTile(box[3]!, z); y <= latToTile(box[1]!, z); y++) {
    const tile = await archive.getZxy(z, x, y)
    if (!tile) continue
    const raw = Buffer.from(tile.data)
    const layer = new VectorTile(new Pbf(raw[0] === 0x1f ? gunzipSync(raw) : raw)).layers[layerName]
    for (let index = 0; layer && index < layer.length; index++) {
      const feature = layer.feature(index)
      if (feature.type !== 3) continue
      polygons++
      const pixel = feature.extent / 256
      for (const ring of feature.loadGeometry() as Array<Array<{ x: number; y: number }>>) {
        const points = ring.at(-1)!.x === ring[0]!.x && ring.at(-1)!.y === ring[0]!.y ? ring.slice(0, -1) : ring
        if (points.length < 3) continue
        rings++
        vertices += points.length
        let area = 0, perimeter = 0
        for (let i = 0; i < points.length; i++) {
          const a = points[(i + points.length - 1) % points.length]!, b = points[i]!, c = points[(i + 1) % points.length]!
          area += (a.x - b.x) * (a.y + b.y)
          const ab = Math.hypot(a.x - b.x, a.y - b.y), cb = Math.hypot(c.x - b.x, c.y - b.y)
          perimeter += cb
          if (ab < pixel || cb < pixel) continue
          const cosine = ((a.x - b.x) * (c.x - b.x) + (a.y - b.y) * (c.y - b.y)) / (ab * cb)
          if (Math.acos(Math.max(-1, Math.min(1, cosine))) * 180 / Math.PI < SPIKE_DEGREES) spikes++
        }
        if (perimeter > 4 * pixel && (2 * Math.abs(area / 2)) / perimeter < THIN_PX * pixel) thin++
      }
    }
  }
  rows.push({ z, polygons, rings, vertices, spikes, spikesPer1000Vertices: +(spikes / Math.max(1, vertices) * 1000).toFixed(2), thinRings: thin, thinShare: +(thin / Math.max(1, rings)).toFixed(3) })
}
console.log(JSON.stringify({ archive: path.split('/').at(-1), layer: layerName, box, rows }))
