import { createReadStream, createWriteStream } from 'node:fs'
import { createInterface } from 'node:readline'
import { once } from 'node:events'
import { resolve } from 'node:path'

const directory = resolve(process.argv[2]!)
for (let zoom = 4; zoom <= 10; zoom++) {
  const output = createWriteStream(resolve(directory, `landcover-${zoom}.geojson`))
  output.write('{"type":"FeatureCollection","features":[\n')
  let first = true
  for (const file of [`cover-${zoom}.geojson`, ...(zoom <= 5 ? [`ne-${zoom}.geojsonl`] : [])]) {
    for await (const line of createInterface({ input: createReadStream(resolve(directory, file)) })) {
      const normalized = line.trim().replace(/^\x1e/, '').replace(/,$/, '')
      if (!normalized.startsWith('{"type":"Feature",')) continue
      if (!output.write(`${first ? '' : ',\n'}${normalized}`)) await once(output, 'drain')
      first = false
    }
  }
  output.end('\n]}\n')
  await once(output, 'finish')
}
