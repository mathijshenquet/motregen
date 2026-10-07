import { createRequire } from 'node:module'
import { cpSync, copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

if (process.env.MOTREGEN_BASEMAP_COMPARISON !== '1') process.exit(0)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(resolve(root, 'web/package.json'))
const fixture = resolve(root, 'web', process.env.MOTREGEN_MOBILE_FIXTURE_DIR!)
const output = resolve(fixture, 'compare')
mkdirSync(output, { recursive: true })
copyFileSync(require.resolve('maplibre-gl'), resolve(output, 'maplibre.js'))
copyFileSync(resolve(dirname(require.resolve('pmtiles')), '../pmtiles.js'), resolve(output, 'pmtiles.js'))
copyFileSync(resolve(root, 'tools/basemap/compare.html'), resolve(output, 'index.html'))
cpSync(resolve(root, 'tmp/basemap/openfreemap'), resolve(fixture, 'basemap-ofm'), { recursive: true })
const origin = `http://127.0.0.1:${process.env.MOTREGEN_E2E_DATA_PORT}`
for (const theme of ['light', 'dark']) {
  const style = JSON.parse(readFileSync(resolve(fixture, `basemap-ofm/${theme}.json`), 'utf8'))
  style.glyphs = `${origin}/basemap-ofm/fonts/{fontstack}/{range}.pbf`
  style.sprite = `${origin}/basemap-ofm/sprite`
  style.sources.openmaptiles = { type: 'vector', tiles: [`${origin}/basemap-ofm/tiles/{z}/{x}/{y}.pbf`], minzoom: 0, maxzoom: 14 }
  style.sources.ne2_shaded.tiles = [`${origin}/basemap-ofm/raster/{z}/{x}/{y}.png`]
  writeFileSync(resolve(fixture, `reference-style-${theme}.json`), JSON.stringify(style))
}
