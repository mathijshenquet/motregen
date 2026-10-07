import { addProtocol, type LayerSpecification, type StyleSpecification } from 'maplibre-gl'
import { Protocol } from 'pmtiles'

export type MapTheme = 'light' | 'dark'

const styleNames: Record<MapTheme, string> = { light: 'licht', dark: 'donker' }
const cache = new Map<MapTheme, Promise<StyleSpecification>>()
let protocolInstalled = false

export function loadBasemapStyle(theme: MapTheme): Promise<StyleSpecification> {
  if (!protocolInstalled) {
    addProtocol('pmtiles', new Protocol().tile)
    protocolInstalled = true
  }
  let pending = cache.get(theme)
  if (!pending) {
    const url = import.meta.env.VITE_BASEMAP_STYLE_URL?.replace('{theme}', theme) ?? `/basemap/${styleNames[theme]}.json`
    pending = fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`Kaartstijl laden mislukt (${response.status})`)
        return response.json() as Promise<StyleSpecification>
      })
      .then((style) => prepareBasemapStyle(style, import.meta.env.VITE_DATA_ORIGIN ?? location.origin, new URL(url, location.href).href))
      .catch((error) => {
        cache.delete(theme)
        throw error
      })
    cache.set(theme, pending)
  }
  return pending
}

export function prepareBasemapStyle(style: StyleSpecification, dataOrigin: string, styleUrl = dataOrigin): StyleSpecification {
  const sources = Object.fromEntries(Object.entries(style.sources).map(([name, source]) => {
    if (source.type !== 'vector' || !source.url?.startsWith('pmtiles://')) return [name, source]
    const path = source.url.slice('pmtiles://'.length)
    return [name, { ...source, url: `pmtiles://${new URL(path, dataOrigin).href}` }]
  }))
  const glyphs = style.glyphs && new URL(style.glyphs, styleUrl).href.replaceAll('%7B', '{').replaceAll('%7D', '}')
  return { ...style, sources, ...glyphs ? { glyphs } : {} }
}

export function firstBasemapTextLayerId(layers: readonly LayerSpecification[]): string | undefined {
  return layers.find((layer) => layer.type === 'symbol' && !layer.id.startsWith('motregen-') && layer.layout?.['text-field'] !== undefined)?.id
}

// Temperatures yield to town, city and province names in label collision.
export function temperatureLayerBeforeId(layers: readonly LayerSpecification[]): string | undefined {
  return layers.find((layer) => ['label_town', 'label_city', 'label_state'].includes(layer.id))?.id ?? firstBasemapTextLayerId(layers)
}
