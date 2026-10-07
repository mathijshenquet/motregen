import { createReadStream, createWriteStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { once } from 'node:events'
import { resolve } from 'node:path'

const coverDirectory = resolve(process.argv[2]!)
const output = createWriteStream(resolve(coverDirectory, 'landcover.tmp.geojson'))
output.write('{"type":"FeatureCollection","features":[\n')
let first = true
const counts: Record<string, number> = {}
for (const kind of ['wood', 'grass', 'urban', 'park', 'sand', 'wetland']) {
  counts[kind] = 0
  // GDAL schrijft één volledig Feature per regel; zo blijven de al verenigde coördinaten intact.
  for await (const line of createInterface({ input: createReadStream(resolve(coverDirectory, `cover-${kind}.geojson`)) })) {
    if (!line.startsWith('{"type":"Feature",')) continue
    const feature = line.trimEnd().replace(/,$/, '')
    const record = `${first ? '' : ',\n'}${feature}`
    first = false
    counts[kind]++
    if (!output.write(record)) await once(output, 'drain')
  }
}
if (first) throw new Error('Geen landcover-vlakken gevonden')
output.end('\n]}\n')
await once(output, 'finish')
console.log(JSON.stringify(counts))
