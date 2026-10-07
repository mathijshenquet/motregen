import { cpSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import Pbf from 'pbf'

const root = resolve(process.env.MOTREGEN_MOBILE_FIXTURE_DIR ?? 'public/perf-mobile')
const port = Number(process.env.MOTREGEN_E2E_DATA_PORT ?? 8392)
mkdirSync(root, { recursive: true })
const tile = new Pbf()
for (const name of ['water', 'land']) {
  tile.writeMessage(3, (layerName, layer) => {
    layer.writeStringField(1, layerName)
    layer.writeVarintField(15, 2)
    layer.writeVarintField(5, 4096)
    layer.writeMessage(2, (land, feature) => {
      feature.writeVarintField(1, 1)
      feature.writeVarintField(3, 3)
      const inset = land ? 1024 : 0
      const width = land ? 2048 : 4096
      feature.writePackedVarint(4, [9, inset * 2, inset * 2, 26, width * 2, 0, 0, width * 2, width * 2 - 1, 0, 15])
    }, layerName === 'land')
  }, name)
}
writeFileSync(resolve(root, 'tile.pbf'), tile.finish())
writeFileSync(resolve(root, 'style.json'), JSON.stringify({
  version: 8,
  name: 'motregen-mobile-offline',
  sources: { fixture: { type: 'vector', tiles: [`http://127.0.0.1:${port}/tiles/{z}/{x}/{y}.pbf`], minzoom: 0, maxzoom: 8 } },
  layers: [
    { id: 'water', type: 'fill', source: 'fixture', 'source-layer': 'water', paint: { 'fill-color': '#b7d9e5' } },
    { id: 'land', type: 'fill', source: 'fixture', 'source-layer': 'land', paint: { 'fill-color': '#dcebed' } },
  ],
}))
console.log('Offline mobiele vectorfixture geschreven')

const basemap = process.env.MOTREGEN_MOBILE_BASEMAP ?? 'fixture'
if (basemap === 'openfreemap') {
  cpSync('../tmp/basemap/openfreemap', resolve(root, 'basemap-ofm'), { recursive: true })
  const local = `http://127.0.0.1:${port}/basemap-ofm`
  for (const theme of ['light', 'dark']) {
    const style = JSON.parse(readFileSync(resolve(root, `basemap-ofm/${theme}.json`), 'utf8'))
    style.glyphs = `${local}/fonts/{fontstack}/{range}.pbf`
    style.sprite = `${local}/sprite`
    style.sources.openmaptiles = { type: 'vector', tiles: [`${local}/tiles/{z}/{x}/{y}.pbf`], minzoom: 0, maxzoom: 14 }
    style.sources.ne2_shaded.tiles = [`${local}/raster/{z}/{x}/{y}.png`]
    writeFileSync(resolve(root, `style-${theme}.json`), JSON.stringify(style))
  }
  cpSync(resolve(root, 'style-light.json'), resolve(root, 'style.json'))
} else if (basemap === 'own') {
  const tiles = resolve('..', process.env.MOTREGEN_BASEMAP_VARIANT ?? 'tools/basemap/tiles')
  cpSync(tiles, resolve(root, 'basemap'), { recursive: true })
  const { filename } = JSON.parse(readFileSync(resolve(tiles, 'manifest.json'), 'utf8'))
  for (const [theme, name] of [['light', 'licht'], ['dark', 'donker']]) {
    const style = JSON.parse(readFileSync(`public/basemap/${name}.json`, 'utf8'))
    style.sources.basemap.url = `pmtiles://http://127.0.0.1:${port}/basemap/${filename}`
    style.glyphs = `http://127.0.0.1:${process.env.MOTREGEN_E2E_PORT ?? 4392}/basemap/fonts/{fontstack}/{range}.pbf`
    writeFileSync(resolve(root, `style-${theme}.json`), JSON.stringify(style))
  }
}
