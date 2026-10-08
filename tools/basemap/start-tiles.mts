import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(resolve(root, 'web/package.json'))
const { PMTiles, FileSource } = require('pmtiles')
const directory = resolve(root, 'tools/basemap/tiles')
const manifest = JSON.parse(readFileSync(resolve(directory, 'manifest.json'), 'utf8'))
const archive = new PMTiles(new FileSource(new File([readFileSync(resolve(directory, manifest.filename))], manifest.filename)))
for (const x of [7, 8]) {
  const tile = await archive.getZxy(4, x, 5)
  if (!tile) throw new Error(`Z4-tegel ${x}/5 ontbreekt in ${manifest.filename}`)
  writeFileSync(resolve(root, `web/src/assets/map-start/4-${x}-5.pbf.gz`), gzipSync(Buffer.from(tile.data), { level: 9 }))
}
console.log(`Progressieve z4-tegels uit ${manifest.filename}`)
