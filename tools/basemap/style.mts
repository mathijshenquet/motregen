import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const { filename } = JSON.parse(readFileSync(resolve(root, 'tools/basemap/tiles/manifest.json'), 'utf8'))
for (const theme of ['licht', 'donker']) {
  const dark = theme === 'donker'
  const label = (id: string, kind: string, minimumZoom: number, size: number) => ({
    id, type: 'symbol', source: 'basemap', 'source-layer': 'place', minzoom: minimumZoom,
    filter: ['==', ['get', 'class'], kind],
    layout: { 'text-field': ['get', 'name'], 'text-font': ['Noto Sans Regular'], 'text-size': ['interpolate', ['linear'], ['zoom'], 5, size, 11, size + 3], 'text-max-width': 9, 'text-padding': 4, 'symbol-sort-key': ['-', ['*', ['get', 'rank'], 10_000_000], ['get', 'population']] },
    paint: { 'text-color': dark ? '#c7d5d8' : '#283239', 'text-halo-color': dark ? '#101d21' : '#f8f4f0', 'text-halo-width': 1.3 },
  })
  const style = {
    version: 8,
    name: `motregen — ${theme}`,
    glyphs: '/basemap/fonts/{fontstack}/{range}.pbf',
    sources: { basemap: { type: 'vector', url: `pmtiles:///data/basemap/${filename}`, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' } },
    layers: [
      { id: 'background', type: 'background', paint: { 'background-color': dark ? '#222e31' : '#f8f4f0' } },
      { id: 'landcover_wood', type: 'fill', source: 'basemap', 'source-layer': 'landcover', filter: ['==', ['get', 'class'], 'wood'], paint: { 'fill-color': dark ? '#203a2d' : '#cce0b9', 'fill-antialias': false } },
      { id: 'landuse_residential', type: 'fill', source: 'basemap', 'source-layer': 'landcover', filter: ['==', ['get', 'class'], 'urban'], paint: { 'fill-color': dark ? '#26302c' : '#e7e3df', 'fill-antialias': false } },
      { id: 'water', type: 'fill', source: 'basemap', 'source-layer': 'water', paint: { 'fill-color': dark ? '#183746' : '#9ebdff', 'fill-antialias': true } },
      { id: 'boundary_2', type: 'line', source: 'basemap', 'source-layer': 'boundary', filter: ['==', ['get', 'admin_level'], 2], layout: { 'line-join': 'round' }, paint: { 'line-color': dark ? '#688087' : '#68676a', 'line-opacity': 0.85, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.8, 11, 1.6] } },
      { id: 'motregen-province-boundaries', type: 'line', source: 'basemap', 'source-layer': 'boundary', minzoom: 4, filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]], paint: { 'line-color': dark ? '#80969c' : '#687e85', 'line-opacity': 0.72, 'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.55, 8, 1.15], 'line-dasharray': [2, 1.5] } },
      label('label_village', 'village', 8, 10),
      label('label_town', 'town', 6, 11),
      label('label_city', 'city', 4, 12),
      { ...label('label_state', 'state', 6, 11), paint: { 'text-color': dark ? '#a8babc' : '#657375', 'text-halo-color': dark ? '#101d21' : '#f8f4f0', 'text-halo-width': 1 } },
    ],
  }
  writeFileSync(resolve(root, `web/public/basemap/${theme}.json`), `${JSON.stringify(style, null, 2)}\n`)
}
