import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync, copyFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(resolve(root, 'web/package.json'))
const { PMTiles, FileSource } = require('pmtiles')
const { VectorTile } = require('@mapbox/vector-tile')
const Pbf = require('pbf').default
const input = resolve(root, process.argv[2] ?? 'tmp/basemap/build/nl.pmtiles')
const bytes = readFileSync(input)
if (bytes.length > 25_000_000) throw new Error(`Basiskaart overschrijdt 25 MB: ${bytes.length}`)
const sha256 = createHash('sha256').update(bytes).digest('hex')
const filename = `nl-${sha256.slice(0, 16)}.pmtiles`
const source = new FileSource(new File([bytes], filename))
let compressedSize = 0
const getBytes = source.getBytes.bind(source)
source.getBytes = async (offset: number, length: number) => {
  compressedSize = length
  return getBytes(offset, length)
}
const archive = new PMTiles(source)
const header = await archive.getHeader()
const mercatorY = (latitude: number) => (1 - Math.asinh(Math.tan(latitude * Math.PI / 180)) / Math.PI) / 2
const zooms = []
const layers = new Set<string>()
for (let zoom = header.minZoom; zoom <= header.maxZoom; zoom++) {
  const count = 2 ** zoom
  const sizes: number[] = []
  const compressedSizes: number[] = []
  for (let tileX = Math.floor((header.minLon + 180) / 360 * count); tileX <= Math.floor((header.maxLon + 180) / 360 * count); tileX++) {
    for (let tileY = Math.floor(mercatorY(header.maxLat) * count); tileY <= Math.floor(mercatorY(header.minLat) * count); tileY++) {
      const tile = await archive.getZxy(zoom, tileX, tileY)
      if (!tile) continue
      sizes.push(tile.data.byteLength)
      compressedSizes.push(compressedSize)
      const vector = new VectorTile(new Pbf(new Uint8Array(tile.data)))
      for (const [name, layer] of Object.entries(vector.layers) as Array<[string, any]>) {
        if (!['water', 'landcover', 'boundary', 'place'].includes(name)) throw new Error(`Onverwachte laag: ${name}`)
        layers.add(name)
        for (let index = 0; index < layer.length; index++) {
          const feature = layer.feature(index)
          if (name === 'boundary' && (![2, 4].includes(feature.properties.admin_level) || feature.properties.maritime === 1)) throw new Error('Onverwachte grens')
          if (name === 'landcover' && !['wood', 'urban'].includes(feature.properties.class)) throw new Error('Onverwachte landklasse')
          if (name === 'place' && [...feature.properties.name].length < 2) throw new Error('Onleesbaar plaatslabel')
        }
      }
    }
  }
  sizes.sort((left, right) => left - right)
  compressedSizes.sort((left, right) => left - right)
  zooms.push({ zoom, tiles: sizes.length, compressedBytes: compressedSizes.reduce((sum, size) => sum + size, 0), p50CompressedBytes: compressedSizes[Math.ceil(compressedSizes.length / 2) - 1], maxCompressedBytes: compressedSizes.at(-1), decodedBytes: sizes.reduce((sum, size) => sum + size, 0), p50Bytes: sizes[Math.ceil(sizes.length / 2) - 1], maxBytes: sizes.at(-1) })
}
if (layers.size !== 4) throw new Error(`Ontbrekende lagen: ${[...layers]}`)
const metadata = { filename, sha256, bytes: bytes.length, minzoom: header.minZoom, maxzoom: header.maxZoom, bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat], zooms }
const output = resolve(root, process.env.MOTREGEN_BASEMAP_OUTPUT ?? 'tools/basemap/tiles')
mkdirSync(output, { recursive: true })
copyFileSync(input, resolve(output, filename))
writeFileSync(resolve(output, 'manifest.json'), `${JSON.stringify(metadata, null, 2)}\n`)
console.log(JSON.stringify(metadata, null, 2))
if (!process.env.MOTREGEN_BASEMAP_OUTPUT) await import('./style.mts')
