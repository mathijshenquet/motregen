import { createReadStream, createWriteStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { once } from 'node:events'
import { resolve } from 'node:path'

const scratch = resolve(process.argv[2] ?? 'tmp/basemap/build')
const output = createWriteStream(resolve(scratch, 'landcover-parts.geojsonl'))
const counts: Record<string, number> = {}
const grass = new Set(['grassland', 'heath', 'scrub', 'grass', 'meadow', 'allotments', 'village_green', 'recreation_ground', 'park', 'garden', 'golf_course'])
const urban = new Set(['residential', 'commercial', 'industrial', 'retail'])
const circumference = 40_075_016.6856
const radius = circumference / (2 * Math.PI)
const projectedRingArea = (ring: number[][]) => {
  let sum = 0
  let previous = ring.at(-1)!
  const project = ([longitude, latitude]: number[]) => [radius * longitude! * Math.PI / 180, radius * Math.asinh(Math.tan(latitude! * Math.PI / 180))]
  let [previousX, previousY] = project(previous)
  for (const point of ring) {
    const [x, y] = project(point)
    sum += previousX! * y! - x! * previousY!
    previousX = x
    previousY = y
  }
  return Math.abs(sum / 2)
}
for await (const line of createInterface({ input: createReadStream(resolve(scratch, 'raw-landcover.geojsonl')) })) {
  const feature = JSON.parse(line.replace(/^\x1e/, ''))
  const tags = feature.properties
  if (tags.natural === 'water' || tags.waterway === 'riverbank' || tags.landuse === 'reservoir') continue
  const classes: string[] = []
  if (tags.natural === 'wood' || tags.landuse === 'forest') classes.push('wood')
  else if (tags.natural === 'sand' || tags.natural === 'beach') classes.push('sand')
  else if (tags.natural === 'wetland') classes.push('wetland')
  else if ([tags.natural, tags.landuse, tags.leisure].some(value => grass.has(value))) classes.push('grass')
  if (tags.leisure === 'nature_reserve' || ['national_park', 'protected_area', 'aboriginal_lands'].includes(tags.boundary)) classes.push('park')
  if (urban.has(tags.landuse)) classes.push('urban')
  if (!classes.length) continue
  const polygons: number[][][][] = feature.geometry.type === 'Polygon' ? [feature.geometry.coordinates] : feature.geometry.coordinates
  const area = polygons.reduce((total, rings) => total + projectedRingArea(rings[0]!) - rings.slice(1).reduce((holes, ring) => holes + projectedRingArea(ring), 0), 0)
  for (const cover of classes) {
    const firstZoom = cover === 'park' ? 4 : cover === 'urban' ? tags.landuse === 'residential' ? 6 : 9 : 7
    let detailMinzoom = 13
    // OpenMapTiles selecteert oorspronkelijke polygonen vóór union op hun geprojecteerde pixeloppervlak.
    for (let zoom = firstZoom; zoom <= 12; zoom++) {
      const pixels = cover === 'park' ? 2 : cover === 'urban' ? tags.landuse === 'residential' ? 0.1 : 4 : zoom <= 9 ? 2 : zoom === 10 ? 4 : 8
      const minimumArea = (circumference / (256 * 2 ** zoom) * pixels) ** 2
      if (area >= minimumArea) { detailMinzoom = zoom; break }
    }
    if (detailMinzoom > 12) continue
    const selected = { ...feature, properties: { class: cover, detail_minzoom: detailMinzoom } }
    counts[cover] = (counts[cover] ?? 0) + 1
    if (!output.write(`${JSON.stringify(selected)}\n`)) await once(output, 'drain')
  }
}
output.end()
await once(output, 'finish')
console.log(JSON.stringify(counts))
