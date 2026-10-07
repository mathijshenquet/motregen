import { createReadStream, createWriteStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { once } from 'node:events'
import { resolve } from 'node:path'

const scratch = resolve(process.argv[2] ?? 'tmp/basemap/build')
const output = createWriteStream(resolve(scratch, 'landcover-parts.geojsonl'))
const counts: Record<string, number> = {}
const grass = new Set(['grassland', 'heath', 'scrub', 'grass', 'meadow', 'allotments', 'village_green', 'recreation_ground', 'park', 'garden', 'golf_course'])
const urban = new Set(['residential', 'commercial', 'industrial', 'retail'])
for await (const line of createInterface({ input: createReadStream(resolve(scratch, 'raw-landcover.geojsonl')) })) {
  const feature = JSON.parse(line.replace(/^\x1e/, ''))
  const tags = feature.properties
  if (tags.natural === 'water' || tags.waterway === 'riverbank' || tags.landuse === 'reservoir') continue
  const cover = tags.natural === 'wood' || tags.landuse === 'forest' ? 'wood'
    : tags.natural === 'sand' || tags.natural === 'beach' ? 'sand'
      : tags.natural === 'wetland' ? 'wetland'
        : tags.leisure === 'nature_reserve' || tags.boundary === 'national_park' ? 'park'
          : [tags.natural, tags.landuse, tags.leisure].some(value => grass.has(value)) ? 'grass'
            : urban.has(tags.landuse) ? 'urban' : undefined
  if (!cover) continue
  const coordinates = feature.geometry.type === 'Polygon' ? feature.geometry.coordinates[0] : feature.geometry.coordinates[0][0]
  const [longitude, latitude] = coordinates[0]
  feature.properties = { class: cover, batch: `${Math.floor(longitude * 2)},${Math.floor(latitude * 2)}` }
  counts[cover] = (counts[cover] ?? 0) + 1
  if (!output.write(`${JSON.stringify(feature)}\n`)) await once(output, 'drain')
}
output.end()
await once(output, 'finish')
console.log(JSON.stringify(counts))
