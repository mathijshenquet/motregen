import { createRequire } from 'node:module'
import { copyFileSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(resolve(root, 'web/package.json'))
const { PMTiles, FileSource } = require('pmtiles')
const tiles = resolve(root, process.env.MOTREGEN_BASEMAP_VARIANT ?? 'tools/basemap/tiles')
const manifest = JSON.parse(readFileSync(resolve(tiles, 'manifest.json'), 'utf8'))
const archive = new PMTiles(new FileSource(new File([readFileSync(resolve(tiles, manifest.filename))], manifest.filename)))
const data: Record<string, string> = {}
const reference = process.env.MOTREGEN_MOBILE_BASEMAP === 'openfreemap'
const mercatorY = (latitude: number) => (1 - Math.asinh(Math.tan(latitude * Math.PI / 180)) / Math.PI) / 2
const [west, south, east, north] = manifest.bounds
for (let zoom = manifest.minzoom; !reference && zoom <= manifest.maxzoom; zoom++) {
  const count = 2 ** zoom
  for (let x = Math.floor((west + 180) / 360 * count); x <= Math.floor((east + 180) / 360 * count); x++) {
    for (let y = Math.floor(mercatorY(north) * count); y <= Math.floor(mercatorY(south) * count); y++) {
      const tile = await archive.getZxy(zoom, x, y)
      if (tile) data[`tiles/${zoom}/${x}/${y}`] = Buffer.from(tile.data).toString('base64')
    }
  }
}
for (const range of ['0-255', '256-511']) data[`fonts/Noto Sans Regular/${range}.pbf`] = readFileSync(resolve(root, `web/public/basemap/fonts/Noto Sans Regular/${range}.pbf`)).toString('base64')
const style = JSON.parse(readFileSync(resolve(root, 'web/public/basemap/licht.json'), 'utf8'))
style.sources.basemap = { type: 'vector', tiles: ['memory://tiles/{z}/{x}/{y}'], minzoom: manifest.minzoom, maxzoom: manifest.maxzoom, bounds: manifest.bounds }
style.glyphs = 'memory://fonts/{fontstack}/{range}.pbf'
let measuredStyle = style
let sourceId = 'basemap'
if (reference) {
  const snapshot = resolve(root, 'tmp/basemap/openfreemap')
  function include(directory: string, prefix = '') {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name)
      if (entry.isDirectory()) include(path, `${prefix}${entry.name}/`)
      else if (/\.(pbf|png)$/.test(entry.name) || entry.name.startsWith('sprite')) {
        const key = entry.name.startsWith('sprite') ? `sprites/${entry.name}` : `${prefix}${entry.name}`
        data[key] = readFileSync(path).toString('base64')
      }
    }
  }
  include(snapshot)
  measuredStyle = JSON.parse(readFileSync(resolve(snapshot, 'light.json'), 'utf8'))
  measuredStyle.sources.openmaptiles = { type: 'vector', tiles: ['memory://tiles/{z}/{x}/{y}.pbf'], minzoom: 0, maxzoom: 7 }
  measuredStyle.sources.ne2_shaded.tiles = ['memory://raster/{z}/{x}/{y}.png']
  measuredStyle.glyphs = 'memory://fonts/{fontstack}/{range}.pbf'
  measuredStyle.sprite = 'memory://sprites/sprite'
  sourceId = 'openmaptiles'
}
const output = resolve(root, 'web', process.env.MOTREGEN_MOBILE_FIXTURE_DIR ?? 'public/perf-mobile', 'parse')
mkdirSync(output, { recursive: true })
copyFileSync(require.resolve('maplibre-gl'), resolve(output, 'maplibre.js'))
copyFileSync(resolve(root, 'tools/basemap/parse.html'), resolve(output, 'index.html'))
writeFileSync(resolve(output, 'fixture.json'), JSON.stringify({ style: measuredStyle, data, manifest, sourceId }))
