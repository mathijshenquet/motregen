import { createReadStream, createWriteStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { once } from 'node:events'
import { resolve } from 'node:path'
import { circumference, projectedRingArea } from './geometry.mts'

const directory = resolve(process.argv[2]!)
for (let zoom = 4; zoom <= 10; zoom++) {
  const output = createWriteStream(resolve(directory, `landcover-${zoom}.tmp.geojson`))
  output.write('{"type":"FeatureCollection","features":[\n')
  let first = true
  const pixelArea = (circumference / (256 * 2 ** zoom)) ** 2
  for (const file of [`cover-${zoom}.geojson`, ...(zoom <= 5 ? [`ne-${zoom}.geojsonl`] : [])]) {
    for await (const line of createInterface({ input: createReadStream(resolve(directory, file)) })) {
      const normalized = line.trim().replace(/^\x1e/, '').replace(/,$/, '')
      if (!normalized.startsWith('{"type":"Feature",')) continue
      const feature = JSON.parse(normalized)
      if (!feature.geometry) continue
      if (!file.startsWith('ne-') && feature.properties.class.startsWith('urban')) {
        const polygons: number[][][][] = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates
        const kept = polygons.filter(rings => projectedRingArea(rings[0]!) >= pixelArea)
          .map(rings => [rings[0]!, ...rings.slice(1).filter(ring => projectedRingArea(ring) >= pixelArea)])
        if (!kept.length) continue
        feature.geometry = { type: 'MultiPolygon', coordinates: kept }
        feature.properties.class = 'urban'
      }
      if (!output.write(`${first ? '' : ',\n'}${JSON.stringify(feature)}`)) await once(output, 'drain')
      first = false
    }
  }
  output.end('\n]}\n')
  await once(output, 'finish')
}
