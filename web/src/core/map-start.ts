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
    if (!['landcover', 'water', 'boundary'].includes(layer['source-layer'] ?? '')) continue
    layers.push({ ...layer, id: `${mapStartSource}-${layer.id}`, source: mapStartSource })
  }
  return {
    ...style,
    sources: { ...style.sources, [mapStartSource]: { type: 'vector', tiles: [`${protocol}://{z}/{x}/{y}`], minzoom: 4, maxzoom: 4, bounds: [-22.5, 40.979898, 22.5, 55.776573] } },
    layers: [...style.layers.filter((layer) => layer.type === 'background'), ...layers, ...style.layers.filter((layer) => layer.type !== 'background')],
  }
}

export function createMapStart(): { style: typeof mapStartStyle; playbackReady: () => void; replace: (map: MapLibreMap) => void; dispose: () => void } | undefined {
  if (import.meta.env.VITE_MAP_START === 'off' && new URLSearchParams(location.search).has('dev')) return undefined
  let ready = !(import.meta.env.VITE_MAP_START === 'after-play' && new URLSearchParams(location.search).has('dev'))
  let worker: Worker | undefined
  const data = new Map<string, Promise<ArrayBuffer>>()
  const complete = new Map<string, (data: ArrayBuffer) => void>()
  const waiting = new Map<string, ArrayBuffer>()
  for (const key of ['4/7/5', '4/8/5']) data.set(key, new Promise((resolve) => complete.set(key, resolve)))
  function stop(): void {
    for (const resolve of complete.values()) resolve(new ArrayBuffer(0))
    complete.clear()
    waiting.clear()
    worker?.terminate()
    worker = undefined
  }
  function startWorker(): Worker {
    if (worker) return worker
    worker = new Worker(new URL('./map-start.worker.ts', import.meta.url), { type: 'module' })
    worker.onmessage = (event: MessageEvent<{ key: string; data: ArrayBuffer }>) => {
      complete.get(event.data.key)?.(event.data.data)
      complete.delete(event.data.key)
      if (!complete.size) { worker?.terminate(); worker = undefined }
    }
    worker.onerror = stop
    return worker
  }
  if (ready) startWorker()
  for (const [key, url] of [['4/7/5', westTile], ['4/8/5', eastTile]]) {
    void fetch(url!).then(async (response) => {
      if (!response.ok) throw new Error(`Z4-tegel laden mislukt (${response.status})`)
      const compressed = await response.arrayBuffer()
      if (!complete.has(key!)) return
      if (ready) startWorker().postMessage({ key, data: compressed }, [compressed])
      else waiting.set(key!, compressed)
    }).catch(() => {
      complete.get(key!)?.(new ArrayBuffer(0))
      complete.delete(key!)
      if (!complete.size) stop()
    })
  }
  addProtocol(protocol, async (request) => ({ data: (await data.get(request.url.slice(`${protocol}://`.length)) ?? new ArrayBuffer(0)).slice(0) }))
  return {
    style: mapStartStyle,
    playbackReady() {
      ready = true
      for (const [key, compressed] of waiting) {
        if (complete.has(key)) startWorker().postMessage({ key, data: compressed }, [compressed])
      }
      waiting.clear()
    },
    replace(map) {
      // Transparante landcover over dezelfde echte lagen verdubbelt de tint. Wissel vóór de volgende paint.
      for (const layer of map.getStyle().layers) if (layer.id.startsWith(`${mapStartSource}-`)) map.removeLayer(layer.id)
      if (map.getSource(mapStartSource)) map.removeSource(mapStartSource)
      stop()
    },
    dispose() {
      stop()
      removeProtocol(protocol)
    },
  }
}
