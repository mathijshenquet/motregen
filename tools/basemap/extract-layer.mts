// U108: haalt één laag uit alle tegels van één zoom van een archief als GeoJSON-regels in EPSG:3857 (meter), met de
// attributen. Bron voor het opnieuw generaliseren van landbedekking en water zonder de oorspronkelijke OSM-extracten.
// Gebruik (vanuit web/): node --import tsx ../tools/basemap/extract-layer.mts ARCHIEF ZOOM LAAG UIT.geojsonl
import { createRequire } from 'node:module'
import { createWriteStream, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const require = createRequire(resolve(dirname(fileURLToPath(import.meta.url)), '../../web/package.json'))
const { PMTiles, FileSource, tileIdToZxy } = require('pmtiles')
const { VectorTile } = require('@mapbox/vector-tile')
const Pbf = require('pbf').default

const [file, zoomText, layerName, output] = process.argv.slice(2)
if (!file || !zoomText || !layerName || !output) throw new Error('Gebruik: extract-layer.mts ARCHIEF ZOOM LAAG UIT.geojsonl')
const zoom = Number(zoomText)
const archive = new PMTiles(new FileSource(new File([readFileSync(file)], file)))
const header = await archive.getHeader()
const ids: number[] = []
const collect = async (offset: number, length: number) => {
  for (const entry of await archive.cache.getDirectory(archive.source, offset, length, header)) {
    if (entry.runLength === 0) await collect(header.leafDirectoryOffset + entry.offset, entry.length)
    else for (let run = 0; run < entry.runLength; run++) ids.push(entry.tileId + run)
  }
}
await collect(header.rootDirectoryOffset, header.rootDirectoryLength)

const WORLD = 40075016.6856
const out = createWriteStream(output)
let features = 0
for (const id of ids) {
  const [z, x, y] = tileIdToZxy(id)
  if (z !== zoom) continue
  const tile = await archive.getZxy(z, x, y)
  const layer = tile && new VectorTile(new Pbf(new Uint8Array(tile.data))).layers[layerName]
  if (!layer) continue
  const size = WORLD / 2 ** z
  for (let index = 0; index < layer.length; index++) {
    const feature = layer.feature(index)
    if (feature.type !== 3) continue
    const rings = (feature.loadGeometry() as Array<Array<{ x: number; y: number }>>).map((ring) => ring.map((point) => [
      +(-WORLD / 2 + (x + point.x / feature.extent) * size).toFixed(1),
      +(WORLD / 2 - (y + point.y / feature.extent) * size).toFixed(1),
    ]))
    // Indelen zoals MapLibre (classifyRings): een ring met hetzelfde teken als de eerste ring begint een polygoon, een
    // ring met het andere teken is een gat. Een vast teken klopte niet: na de y-omkering keerde het, en eilanden (gaten
    // in de zee) werden zo zelf watervlakken.
    const polygons: number[][][][] = []
    let exteriorSign = 0
    for (const ring of rings) {
      let area = 0
      for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) area += (ring[j]![0]! - ring[i]![0]!) * (ring[j]![1]! + ring[i]![1]!)
      if (area === 0) continue
      if (exteriorSign === 0) exteriorSign = Math.sign(area)
      if (Math.sign(area) === exteriorSign) polygons.push([ring])
      else polygons.at(-1)!.push(ring)
    }
    if (polygons.length === 0) continue
    out.write(`${JSON.stringify({ type: 'Feature', properties: feature.properties, geometry: { type: 'MultiPolygon', coordinates: polygons } })}\n`)
    features++
  }
}
out.end()
await new Promise((done) => out.on('finish', done))
console.log(`${features} ${layerName}-features uit z${zoom} → ${output}`)
