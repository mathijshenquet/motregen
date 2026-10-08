import { addProtocol, type LayerSpecification, type StyleSpecification } from 'maplibre-gl'
import { Protocol } from 'pmtiles'

export type MapTheme = 'light' | 'dark'

const styleNames: Record<MapTheme, string> = { light: 'licht', dark: 'donker' }
const cache = new Map<MapTheme, Promise<StyleSpecification>>()
const glyphs = new Map<string, Promise<ArrayBuffer>>()
let protocolInstalled = false

function loadGlyph(url: string): Promise<ArrayBuffer> {
  url = new URL(url).href
  let pending = glyphs.get(url)
  if (!pending) {
    pending = fetch(url).then((response) => {
      if (!response.ok) throw new Error(`Kaartfont laden mislukt (${response.status})`)
      return response.arrayBuffer()
    }).catch((error) => {
      glyphs.delete(url)
      throw error
    })
    glyphs.set(url, pending)
  }
  return pending
}

export function loadBasemapStyle(theme: MapTheme): Promise<StyleSpecification> {
  if (!protocolInstalled) {
    addProtocol('pmtiles', new Protocol().tile)
    addProtocol('motregen-glyphs', async (request) => ({
      data: (await loadGlyph(request.url.slice('motregen-glyphs://'.length))).slice(0),
    }))
    protocolInstalled = true
  }
  let pending = cache.get(theme)
  if (!pending) {
    const url = import.meta.env.VITE_BASEMAP_STYLE_URL?.replace('{theme}', theme) ?? `/basemap/${styleNames[theme]}.json`
    const inline = !import.meta.env.VITE_BASEMAP_STYLE_URL && typeof document !== 'undefined'
      ? document.getElementById(`basemap-${styleNames[theme]}`)?.textContent
      : undefined
    pending = (inline ? Promise.resolve(JSON.parse(inline) as StyleSpecification) : fetch(url)
      .then((response) => {
        if (!response.ok) throw new Error(`Kaartstijl laden mislukt (${response.status})`)
        return response.json() as Promise<StyleSpecification>
      }))
      .then((style) => {
        const prepared = prepareBasemapStyle(style, import.meta.env.VITE_DATA_ORIGIN ?? location.origin, new URL(url, location.href).href)
        if (prepared.glyphs && Object.values(prepared.sources).some((source) => source.type === 'vector' && source.url?.startsWith('pmtiles://'))) {
          // Haal het gewone Latijnse font op voordat een worker zijn eerste labels terugstuurt.
          void loadGlyph(prepared.glyphs.replace('{fontstack}', 'Noto%20Sans%20Regular').replace('{range}', '0-255')).catch(() => undefined)
          return { ...prepared, glyphs: `motregen-glyphs://${prepared.glyphs}` }
        }
        return prepared
      })
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
