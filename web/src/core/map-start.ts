import { addProtocol, type Map as MapLibreMap, type LayerSpecification, type StyleSpecification } from 'maplibre-gl'

export interface MapStartPlaceholder {
  style: (style: StyleSpecification) => StyleSpecification
  ready: (map: MapLibreMap) => void
  dispose: () => void
}

const sourceId = 'motregen-map-start'
const protocol = 'motregen-map-start'
const fadeMs = 180

export function createMapStart(mapElement: HTMLElement): MapStartPlaceholder | undefined {
  const params = new URLSearchParams(location.search)
  if (!params.has('dev')) return undefined
  const mode = params.get('kaartstart')
  if (mode !== 'tegel') return undefined
  if (document.documentElement.dataset.mapStart !== mode) return undefined
  mapElement.dataset.mapStart = mode
  let completed = false
  let removal: number | undefined
  const inlineLayers: LayerSpecification[] = []
  const decoded = new Map<string, Promise<ArrayBuffer>>()
  {
    const element = document.getElementById('map-start-tiles')
    if (!element) return undefined
    const { tiles } = JSON.parse(element.textContent!) as { tiles: Record<string, string> }
    for (const [key, base64] of Object.entries(tiles)) {
      const bytes = Uint8Array.from(atob(base64), (character) => character.charCodeAt(0))
      decoded.set(key, new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer())
    }
    addProtocol(protocol, async (request) => ({ data: (await decoded.get(request.url.slice(`${protocol}://`.length)) ?? new ArrayBuffer(0)).slice(0) }))
  }
  return {
    style(style) {
      for (const layer of style.layers) {
        if (!('source' in layer) || !('source-layer' in layer) || layer.source !== 'basemap' || layer.type === 'symbol') continue
        if (!['water', 'boundary', 'landcover'].includes(layer['source-layer'] ?? '')) continue
        inlineLayers.push({ ...layer, id: `${sourceId}-${layer.id}`, source: sourceId })
      }
      return {
        ...style,
        sources: { ...style.sources, [sourceId]: { type: 'vector', tiles: [`${protocol}://{z}/{x}/{y}`], minzoom: 4, maxzoom: 4 } },
        layers: [...style.layers.filter((layer) => layer.type === 'background'), ...inlineLayers, ...style.layers.filter((layer) => layer.type !== 'background')],
      }
    },
    ready(map) {
      if (completed) return
      completed = true
      mapElement.dataset.mapStart = 'ready'
      for (const layer of inlineLayers) {
        const opacity = layer.type === 'fill' ? 'fill-opacity' : 'line-opacity'
        map.setPaintProperty(layer.id, `${opacity}-transition`, { duration: fadeMs, delay: 0 })
        map.setPaintProperty(layer.id, opacity, 0)
      }
      removal = window.setTimeout(() => {
        for (const layer of inlineLayers) if (map.getLayer(layer.id)) map.removeLayer(layer.id)
        if (map.getSource(sourceId)) map.removeSource(sourceId)
      }, fadeMs + 32)
    },
    dispose() {
      window.clearTimeout(removal)
      mapElement.ownerDocument.documentElement.removeAttribute('data-map-start')
    },
  }
}
