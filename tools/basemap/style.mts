import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { prepareBasemapStyle } from './liberty'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const { filename } = JSON.parse(readFileSync(resolve(root, 'tools/basemap/tiles/manifest.json'), 'utf8'))
const reference = JSON.parse(readFileSync(resolve(root, 'tools/basemap/liberty-reference.json'), 'utf8'))

for (const [theme, name] of [['light', 'licht'], ['dark', 'donker']] as const) {
  const liberty = prepareBasemapStyle({ version: 8, sources: {}, layers: reference.layers }, theme)
  const referenceLayer = (id: string) => {
    const layer = liberty.layers.find((layer) => layer.id === id)
    if (!layer) throw new Error(`Liberty-laag ontbreekt: ${id}`)
    return structuredClone(layer)
  }
  const cover = (id: string, kind: string) => ({
    ...referenceLayer(id), source: 'basemap', 'source-layer': 'landcover',
    filter: ['==', ['get', 'class'], kind],
  })
  const label = (id: string, kind: string, padding: number) => {
    const layer = referenceLayer(id)
    if (layer.type !== 'symbol') throw new Error(`Liberty-label ontbreekt: ${id}`)
    const rankLimit = ['step', ['zoom'], 0, 4, 3, 5, 5, 6, 7, 7, 8, 8, 9, 9, 10]
    return {
      ...layer, source: 'basemap',
      filter: ['==', ['get', 'class'], kind],
      layout: {
        'text-field': kind === 'state' ? ['get', 'name'] : ['case', ['<=', ['get', 'rank'], rankLimit], ['get', 'name'], ''],
        'text-font': ['Noto Sans Regular'],
        'text-size': layer.layout?.['text-size'],
        'text-max-width': layer.layout?.['text-max-width'],
        'text-padding': padding,
        'symbol-sort-key': ['-', ['*', ['get', 'rank'], 10_000_000], ['get', 'population']],
      },
    }
  }
  const dark = theme === 'dark'
  const style = {
    version: 8,
    name: `motregen — ${name}`,
    glyphs: '/basemap/fonts/{fontstack}/{range}.pbf',
    sources: { basemap: { type: 'vector', url: `pmtiles:///data/basemap/${filename}`, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' } },
    layers: [
      referenceLayer('background'),
      cover('park', 'park'),
      cover('landuse_residential', 'urban'),
      cover('landcover_wood', 'wood'),
      cover('landcover_grass', 'grass'),
      // Een vlakke moeraskleur vervangt Liberty's spritepatroon; geen extra sprite-download.
      { id: 'landcover_wetland', type: 'fill', source: 'basemap', 'source-layer': 'landcover', minzoom: 12, filter: ['==', ['get', 'class'], 'wetland'], paint: { 'fill-color': dark ? '#263b34' : '#d8e8c8', 'fill-opacity': 0.8, 'fill-antialias': false } },
      { ...referenceLayer('water'), source: 'basemap', filter: undefined },
      cover('landcover_sand', 'sand'),
      { id: 'boundary_2', type: 'line', source: 'basemap', 'source-layer': 'boundary', filter: ['==', ['get', 'admin_level'], 2], layout: { 'line-join': 'round' }, paint: { 'line-color': dark ? '#688087' : '#68676a', 'line-opacity': 0.85, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.8, 11, 1.6] } },
      { ...referenceLayer('motregen-province-boundaries'), source: 'basemap' },
      label('label_village', 'village', 8),
      label('label_town', 'town', 8),
      label('label_city', 'city', 8),
      label('label_state', 'state', 4),
    ],
  }
  writeFileSync(resolve(root, `web/public/basemap/${name}.json`), `${JSON.stringify(style, null, 2)}\n`)
}
