import { addProtocol, removeProtocol, type LayerSpecification, type Map as MapLibreMap, type StyleSpecification } from 'maplibre-gl'
import westTile from '../assets/map-start/4-7-5.pbf.gz?url'
import eastTile from '../assets/map-start/4-8-5.pbf.gz?url'

export const mapStartSource = 'motregen-map-start'
const protocol = 'motregen-map-start'

export function mapStartStyle(style: StyleSpecification): StyleSpecification {
  const source = style.sources.basemap
  if (source?.type !== 'vector' || !source.url?.startsWith('pmtiles://')) return style
  const layers: LayerSpecification[] = []
  for (const layer of style.layers) {
    if (!('source' in layer) || layer.source !== 'basemap' || !('source-layer' in layer)) continue
    if (layer.type !== 'fill' && layer.type !== 'line') continue
    // Geen landcover in de startkaart: de grijze bebouwde kom op z4 flikkerde bij de wissel; nu komt bij de
    // overgang alleen bebouwing en groen bíj (PO 2026-10-09).
    if (!['water', 'boundary'].includes(layer['source-layer'] ?? '')) continue
    layers.push({ ...layer, id: `${mapStartSource}-${layer.id}`, source: mapStartSource })
  }
  return {
    ...style,
    sources: { ...style.sources, [mapStartSource]: { type: 'vector', tiles: [`${protocol}://{z}/{x}/{y}`], minzoom: 4, maxzoom: 4, bounds: [-22.5, 40.979898, 22.5, 55.776573] } },
    layers: [...style.layers.filter((layer) => layer.type === 'background'), ...layers, ...style.layers.filter((layer) => layer.type !== 'background')],
  }
}

export function createMapStart(): { style: typeof mapStartStyle; replace: (map: MapLibreMap) => void; dispose: () => void } | undefined {
  if (import.meta.env.VITE_MAP_START === 'off' && new URLSearchParams(location.search).has('dev')) return undefined
  const worker = new Worker(new URL('./map-start.worker.ts', import.meta.url), { type: 'module' })
  const data = new Map<string, Promise<ArrayBuffer>>()
  const complete = new Map<string, (data: ArrayBuffer) => void>()
  for (const key of ['4/7/5', '4/8/5']) data.set(key, new Promise((resolve) => complete.set(key, resolve)))
  // Beide tegels tegelijk vrijgeven: de westtegel (zee, 3,5 kB) is eerder gedecodeerd dan de oosttegel (NL,
  // 20 kB) en tekende anders eerst alleen, met wit ernaast (PO 2026-10-09).
  const decoded = new Map<string, ArrayBuffer>()
  worker.onmessage = (event: MessageEvent<{ key: string; data: ArrayBuffer }>) => {
    decoded.set(event.data.key, event.data.data)
    if (decoded.size < complete.size) return
    for (const [key, resolve] of complete) resolve(decoded.get(key) ?? new ArrayBuffer(0))
    complete.clear()
    worker.terminate()
  }
  worker.onerror = () => {
    for (const resolve of complete.values()) resolve(new ArrayBuffer(0))
    complete.clear()
    worker.terminate()
  }
  for (const [key, url] of [['4/7/5', westTile], ['4/8/5', eastTile]]) {
    void fetch(url!).then(async (response) => {
      if (!response.ok) throw new Error(`Z4-tegel laden mislukt (${response.status})`)
      const compressed = await response.arrayBuffer()
      if (complete.has(key!)) worker.postMessage({ key, data: compressed }, [compressed])
    }).catch(() => {
      // Een mislukte tegel telt als leeg mee, zodat de andere niet eeuwig wacht.
      decoded.set(key!, new ArrayBuffer(0))
      if (decoded.size < complete.size) return
      for (const [tileKey, resolve] of complete) resolve(decoded.get(tileKey) ?? new ArrayBuffer(0))
      complete.clear()
      worker.terminate()
    })
  }
  addProtocol(protocol, async (request) => ({ data: (await data.get(request.url.slice(`${protocol}://`.length)) ?? new ArrayBuffer(0)).slice(0) }))
  return {
    style: mapStartStyle,
    replace(map) {
      // De startlagen liggen onder de echte lagen; zolang beide bestaan verdubbelt de transparante landcover
      // de tint in al geladen tegels — kort, want de wissel volgt zodra alle zichtbare tegels er zijn.
      for (const layer of map.getStyle().layers) if (layer.id.startsWith(`${mapStartSource}-`)) map.removeLayer(layer.id)
      if (map.getSource(mapStartSource)) map.removeSource(mapStartSource)
    },
    dispose() {
      for (const resolve of complete.values()) resolve(new ArrayBuffer(0))
      complete.clear()
      worker.terminate()
      removeProtocol(protocol)
    },
  }
}
