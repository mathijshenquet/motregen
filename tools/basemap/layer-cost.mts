// U108: kosten per tegellaag (bytes gecomprimeerd/ruw, features, vertices) over het NL-kader per zoom.
// Gebruik (vanuit web/): node --import tsx ../tools/basemap/layer-cost.mts ARCHIEF [ZOOM…]
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
const require = createRequire(resolve(dirname(fileURLToPath(import.meta.url)), '../../web/package.json'))
const { PMTiles, FileSource } = require('pmtiles')
const { VectorTile } = require('@mapbox/vector-tile')
const Pbf = require('pbf').default
const [file, ...zoomArgs] = process.argv.slice(2)
if (!file) throw new Error('Gebruik: layer-cost.mts ARCHIEF [ZOOM…]')
const archive = new PMTiles(new FileSource(new File([readFileSync(file)], file)))
const zooms = zoomArgs.length ? zoomArgs.map(Number) : [6, 7, 8, 9, 10]
const mercatorY = (latitude: number) => (1 - Math.asinh(Math.tan(latitude * Math.PI / 180)) / Math.PI) / 2
// Ruwe bytes per laag: de herhaalde `layers`-velden (tag 3) van de tegel uit elkaar halen.
function layerSlices(data: Uint8Array) {
  const pbf = new Pbf(data)
  const slices: Array<{ name: string; bytes: Uint8Array }> = []
  while (pbf.pos < pbf.length) {
    const start = pbf.pos
    const tag = pbf.readVarint() >> 3
    const length = pbf.readVarint()
    const end = pbf.pos + length
    if (tag === 3) {
      const layer = new Pbf(data.subarray(pbf.pos, end))
      let name = ''
      while (layer.pos < layer.length) { const field = layer.readVarint(); if (field >> 3 === 1) { name = layer.readString(); break } layer.skip(field) }
      slices.push({ name, bytes: data.subarray(start, end) })
    }
    pbf.pos = end
  }
  return slices
}
for (const zoom of zooms) {
  const count = 2 ** zoom
  const totals = new Map<string, { raw: number; gzip: number; features: number; vertices: number }>()
  let tiles = 0
  for (let x = Math.floor((3.2 + 180) / 360 * count); x <= Math.floor((7.3 + 180) / 360 * count); x++) {
    for (let y = Math.floor(mercatorY(53.6) * count); y <= Math.floor(mercatorY(50.7) * count); y++) {
      const tile = await archive.getZxy(zoom, x, y)
      if (!tile) continue
      tiles++
      const data = new Uint8Array(tile.data)
      const vector = new VectorTile(new Pbf(data))
      for (const { name, bytes } of layerSlices(data)) {
        const total = totals.get(name) ?? { raw: 0, gzip: 0, features: 0, vertices: 0 }
        total.raw += bytes.length
        total.gzip += gzipSync(bytes, { level: 6 }).length
        const layer = vector.layers[name]
        for (let index = 0; index < layer.length; index++) {
          total.features++
          for (const ring of layer.feature(index).loadGeometry()) total.vertices += ring.length
        }
        totals.set(name, total)
      }
    }
  }
  const sum = [...totals.values()].reduce((all, t) => all + t.gzip, 0)
  console.log(`z${zoom} (${tiles} tegels over NL)`)
  for (const [name, t] of [...totals].sort((a, b) => b[1].gzip - a[1].gzip)) {
    console.log(`  ${name.padEnd(10)} ${String(t.gzip).padStart(9)} B gz (${(t.gzip / sum * 100).toFixed(0).padStart(2)} %)  ${String(t.raw).padStart(9)} B ruw  ${String(t.features).padStart(6)} features  ${String(t.vertices).padStart(8)} vertices`)
  }
}
