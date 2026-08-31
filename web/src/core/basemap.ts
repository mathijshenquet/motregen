import type { LayerSpecification, StyleSpecification } from 'maplibre-gl'

export type MapTheme = 'light' | 'dark'

const styleUrls: Record<MapTheme, string> = {
  light: import.meta.env.VITE_BASEMAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/liberty',
  dark: import.meta.env.VITE_BASEMAP_STYLE_URL ?? 'https://tiles.openfreemap.org/styles/liberty',
}

const cache = new Map<MapTheme, Promise<StyleSpecification>>()

export function loadBasemapStyle(theme: MapTheme): Promise<StyleSpecification> {
  let pending = cache.get(theme)
  if (!pending) {
    pending = fetch(styleUrls[theme])
      .then((response) => {
        if (!response.ok) throw new Error(`Kaartstijl laden mislukt (${response.status})`)
        return response.json() as Promise<StyleSpecification>
      })
      .then((style) => prepareBasemapStyle(style, theme))
      .catch((error) => {
        cache.delete(theme)
        throw error
      })
    cache.set(theme, pending)
  }
  return pending
}

export function prepareBasemapStyle(style: StyleSpecification, theme: MapTheme): StyleSpecification {
  const layers = style.layers.filter((layer) => {
    const sourceLayer = 'source-layer' in layer ? layer['source-layer'] : undefined
    return sourceLayer !== 'transportation' && sourceLayer !== 'transportation_name'
  }).map((layer) => {
    const sourceLayer = 'source-layer' in layer ? layer['source-layer'] : undefined
    const filtered = sourceLayer === 'boundary' ? withoutMaritimeBoundaries(layer) : layer
    return theme === 'dark' ? darkenLibertyLayer(filtered) : filtered
  })
  let boundaryIndex = -1
  for (let index = layers.length - 1; index >= 0; index--) {
    const layer = layers[index]!
    if ('source-layer' in layer && layer['source-layer'] === 'boundary') { boundaryIndex = index; break }
  }
  if (boundaryIndex >= 0) layers.splice(boundaryIndex + 1, 0, provinceBoundaryLayer(layers[boundaryIndex]!, theme))
  return {
    ...style,
    layers,
  }
}

export function firstBasemapTextLayerId(layers: readonly LayerSpecification[]): string | undefined {
  return layers.find((layer) => layer.type === 'symbol' && !layer.id.startsWith('motregen-') && layer.layout?.['text-field'] !== undefined)?.id
}

function provinceBoundaryLayer(boundary: StyleSpecification['layers'][number], theme: MapTheme): StyleSpecification['layers'][number] {
  if (!('source' in boundary)) return boundary
  return {
    id: 'motregen-province-boundaries',
    type: 'line',
    source: boundary.source,
    'source-layer': 'boundary',
    minzoom: 4,
    filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
    paint: {
      'line-color': theme === 'dark' ? '#80969c' : '#687e85',
      'line-opacity': 0.72,
      'line-width': ['interpolate', ['linear'], ['zoom'], 4, 0.55, 8, 1.15],
      'line-dasharray': [2, 1.5],
    },
  }
}

function withoutMaritimeBoundaries(layer: StyleSpecification['layers'][number]): StyleSpecification['layers'][number] {
  const maritimeFilter = ['!=', ['get', 'maritime'], 1] as const
  const currentFilter = 'filter' in layer ? layer.filter : undefined
  return { ...layer, filter: currentFilter ? ['all', currentFilter, maritimeFilter] : maritimeFilter } as unknown as typeof layer
}

function darkenLibertyLayer(layer: StyleSpecification['layers'][number]): StyleSpecification['layers'][number] {
  const sourceLayer = 'source-layer' in layer ? layer['source-layer'] : undefined
  if (layer.type === 'background') return { ...layer, paint: { ...layer.paint, 'background-color': '#101d21' } }
  if (layer.type === 'raster') return { ...layer, paint: { ...layer.paint, 'raster-opacity': 0.12, 'raster-brightness-max': 0.42 } }
  if (layer.type === 'fill') {
    const fill = sourceLayer === 'water' ? '#183746'
      : sourceLayer === 'park' ? '#23382c'
        : sourceLayer === 'landcover' ? landcoverColor(layer.id)
          : sourceLayer === 'landuse' ? '#26302c'
            : sourceLayer === 'building' ? '#29363a'
              : '#222e31'
    return { ...layer, paint: { ...layer.paint, 'fill-color': fill, 'fill-outline-color': fill } }
  }
  if (layer.type === 'fill-extrusion') return { ...layer, paint: { ...layer.paint, 'fill-extrusion-color': '#29363a' } }
  if (layer.type === 'line') {
    const color = sourceLayer === 'waterway' ? '#31596b' : sourceLayer === 'boundary' ? '#688087' : '#53656a'
    return { ...layer, paint: { ...layer.paint, 'line-color': color } }
  }
  if (layer.type === 'symbol') return {
    ...layer,
    paint: { ...layer.paint, 'text-color': '#c7d5d8', 'text-halo-color': '#101d21', 'text-halo-width': 1 },
  }
  return layer
}

function landcoverColor(id: string): string {
  if (id.includes('wood')) return '#203a2d'
  if (id.includes('grass')) return '#2b4033'
  if (id.includes('sand')) return '#4a4432'
  if (id.includes('ice')) return '#405057'
  return '#263b34'
}
