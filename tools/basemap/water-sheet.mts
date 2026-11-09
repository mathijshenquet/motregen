// Diagnose U108: tekent alle water-/waterwayfeatures van één zoom over Nederland als PNG (blauw vlak, rode lijn).
// Gebruik: node --import tsx tools/basemap/water-sheet.mts ARCHIEF ZOOM UIT.png
import { createRequire } from 'node:module'
import { gunzipSync } from 'node:zlib'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const require = createRequire(resolve(dirname(fileURLToPath(import.meta.url)), '../../web/package.json'))
const { PMTiles } = require('pmtiles')
const { VectorTile } = require('@mapbox/vector-tile')
const Pbf = require('pbf').default
const sharp = require('sharp')
const [file, zArg, out] = process.argv.slice(2)
const z = Number(zArg)
const buf = readFileSync(file!)
const source = { getKey: () => file!, getBytes: async (o: number, l: number) => ({ data: buf.buffer.slice(buf.byteOffset + o, buf.byteOffset + o + l) }) }
const pm = new PMTiles(source as any)
const lon2x = (lon: number) => (lon + 180) / 360 * 2 ** z
const lat2y = (lat: number) => (1 - Math.asinh(Math.tan(lat * Math.PI / 180)) / Math.PI) / 2 * 2 ** z
const [x0, x1, y0, y1] = [Math.floor(lon2x(3.2)), Math.floor(lon2x(7.3)), Math.floor(lat2y(53.6)), Math.floor(lat2y(50.7))]
let paths = '', features = 0, vertices = 0, bytes = 0
for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) {
  const t = await pm.getZxy(z, x, y); if (!t) continue
  bytes += t.data.byteLength
  const raw = Buffer.from(t.data); const data = raw[0] === 0x1f ? gunzipSync(raw) : raw
  const vt = new VectorTile(new Pbf(data))
  for (const name of ['water', 'waterway']) {
    const layer = vt.layers[name]; if (!layer) continue
    for (let i = 0; i < layer.length; i++) {
      const f = layer.feature(i); features++
      let d = ''
      for (const ring of f.loadGeometry() as Array<Array<{ x: number; y: number }>>) { vertices += ring.length; d += ring.map((p, j) => `${j ? 'L' : 'M'}${((x - x0) * 256 + p.x * 256 / f.extent).toFixed(1)},${((y - y0) * 256 + p.y * 256 / f.extent).toFixed(1)}`).join('') + (f.type === 3 ? 'Z' : '') }
      paths += f.type === 3 ? `<path d="${d}" fill="#2a6fdb" fill-rule="evenodd"/>` : `<path d="${d}" fill="none" stroke="#d22" stroke-width="1"/>`
    }
  }
}
const w = (x1 - x0 + 1) * 256, h = (y1 - y0 + 1) * 256
writeFileSync(out! + '.svg', `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><rect width="100%" height="100%" fill="#fff"/>${paths}</svg>`)
await sharp(out! + '.svg').png().toFile(out!)
console.log(JSON.stringify({ z, features, vertices, bytes }))
