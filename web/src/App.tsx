import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import maplibregl, { Marker } from 'maplibre-gl'
import type { Grid, Manifest, TimelineFrame } from './core/contract'
import { MrfClient } from './core/mrf'
import { RainLayer } from './core/rain-layer'
import { buildTimeline, frameBlend, regimeLabel } from './core/time-model'

const manifestUrl = new URL('/data/manifest.json', location.href)

export default function App() {
  let mapElement!: HTMLDivElement
  let map: maplibregl.Map | undefined
  let marker: Marker | undefined
  let layer: RainLayer | undefined
  let animation = 0
  const client = new MrfClient(manifestUrl)
  const [manifest, setManifest] = createSignal<Manifest>()
  const timeline = createMemo(() => manifest() ? buildTimeline(manifest()!) : [])
  const [cursor, setCursor] = createSignal(0)
  const [playing, setPlaying] = createSignal(false)
  const [location, setLocation] = createSignal<{ lng: number; lat: number }>()
  const [series, setSeries] = createSignal<Array<number | null>>([])
  const [status, setStatus] = createSignal('Regen laden…')

  onMount(async () => {
    try {
      const response = await fetch(manifestUrl)
      if (!response.ok) throw new Error(`Manifest laden mislukt (${response.status})`)
      const data = await response.json() as Manifest
      const frames = buildTimeline(data)
      if (!frames.length) throw new Error('De tijdlijn is leeg')
      setManifest(data)
      let nowIndex = 0
      for (let index = 0; index < frames.length; index++) if (frames[index]!.epoch <= Date.parse(data.now)) nowIndex = index
      setCursor(nowIndex)
      const header = await client.getHeader(frames[0]!.chunk)
      map = new maplibregl.Map({ container: mapElement, style: 'https://tiles.openfreemap.org/styles/dark', center: [5.3, 52.15], zoom: 6.4, attributionControl: false })
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      map.on('load', () => { layer = new RainLayer(header.grid); map!.addLayer(layer); void showFrame() })
      map.on('click', (event) => pick(event.lngLat.lng, event.lngLat.lat, header.grid))
      setStatus('Tik op de kaart voor jouw locatie')
    } catch (error) { setStatus(error instanceof Error ? error.message : String(error)) }
  })

  onCleanup(() => { cancelAnimationFrame(animation); map?.remove() })

  createEffect(() => { cursor(); if (layer) void showFrame() })
  createEffect(() => { location(); if (timeline().length) void updateSeries() })
  createEffect(() => {
    if (!playing()) { cancelAnimationFrame(animation); return }
    let previous = performance.now()
    const tick = (now: number) => {
      const elapsed = now - previous; previous = now
      setCursor((value) => value >= timeline().length - 1 ? 0 : Math.min(timeline().length - 1, value + elapsed / 650))
      animation = requestAnimationFrame(tick)
    }
    animation = requestAnimationFrame(tick)
  })

  async function showFrame(): Promise<void> {
    const frames = timeline(); if (!frames.length || !layer || !map) return
    const lower = Math.floor(cursor()), upper = Math.min(frames.length - 1, Math.ceil(cursor()))
    const epoch = frames[lower]!.epoch + (frames[upper]!.epoch - frames[lower]!.epoch) * (cursor() - lower)
    const blend = frameBlend(frames, epoch)
    const [left, right] = await Promise.all([load(frames[blend.left]!), load(frames[blend.right]!)])
    layer.setFrames(left, right, blend.mix); map.triggerRepaint()
    for (const near of frames.slice(Math.max(0, lower - 2), upper + 4)) client.prefetch(near.chunk, [near.frameIndex])
  }

  function load(frame: TimelineFrame) { return client.getFrame(frame.chunk, frame.frameIndex) }

  function pick(lng: number, lat: number, grid: Grid): void {
    setLocation({ lng, lat })
    marker?.remove(); marker = new Marker({ color: '#61ddff' }).setLngLat([lng, lat]).addTo(map!)
    void updateSeries(grid)
  }

  async function updateSeries(knownGrid?: Grid): Promise<void> {
    const point = location(), frames = timeline(); if (!point || !frames.length) return
    const header = await client.getHeader(frames[0]!.chunk), grid = knownGrid ?? header.grid
    const [x, y] = project(point.lng, point.lat)
    const column = Math.floor((x - grid.x0) / grid.dx), row = Math.floor((y - grid.y0) / grid.dy)
    if (column < 0 || row < 0 || column >= grid.width || row >= grid.height) { setStatus('Kies een plek binnen het regengebied'); return }
    const values: Array<number | null> = []
    for (const frame of frames) {
      const [bytes, frameHeader] = await Promise.all([load(frame), client.getHeader(frame.chunk)])
      values.push(frameHeader.quant[bytes[row * grid.width + column]!] ?? null)
    }
    setSeries(values); setStatus(`${point.lat.toFixed(3)}° N, ${point.lng.toFixed(3)}° O`)
  }

  function locate(): void {
    if (!navigator.geolocation) { setStatus('Locatie is niet beschikbaar in deze browser'); return }
    setStatus('Locatie bepalen…')
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      map?.flyTo({ center: [coords.longitude, coords.latitude], zoom: 8 })
      void client.getHeader(timeline()[0]!.chunk).then((header) => pick(coords.longitude, coords.latitude, header.grid))
    }, () => setStatus('Locatietoegang geweigerd — tik op de kaart'), { timeout: 10_000 })
  }

  const selected = createMemo(() => timeline()[Math.round(cursor())])
  const intensity = createMemo(() => series()[Math.round(cursor())])
  const graphPoints = createMemo(() => {
    const values = series(), width = 600, height = 120, max = Math.max(1, ...values.map((value) => value ?? 0))
    return values.map((value, index) => `${index / Math.max(1, values.length - 1) * width},${height - Math.sqrt((value ?? 0) / max) * (height - 8)}`).join(' ')
  })

  return <main>
    <header><span class="brand"><img src="/droplet.svg" alt="" />motregen</span><button class="locate" onClick={locate} aria-label="Gebruik mijn locatie">⌖ <span>Mijn locatie</span></button></header>
    <div ref={mapElement} class="map"><div class="source">Bron: KNMI · Kaart: OpenFreeMap</div></div>
    <section class="meter">
      <div><p class="eyebrow">{status()}</p><div class="reading"><strong>{intensity() == null ? '—' : intensity()!.toLocaleString('nl-NL', { maximumFractionDigits: 1 })}</strong><span>mm/u</span></div></div>
      <div class="graph" aria-label="Regenverwachting"><Show when={series().length} fallback={<span>Kies een locatie voor de regengrafiek</span>}><svg viewBox="0 0 600 120" preserveAspectRatio="none"><polyline points={graphPoints()} /><line x1={cursor() / Math.max(1, timeline().length - 1) * 600} x2={cursor() / Math.max(1, timeline().length - 1) * 600} y1="0" y2="120" /></svg></Show></div>
    </section>
    <section class="timeline">
      <div class="time-row"><button onClick={() => setPlaying(!playing())} aria-label={playing() ? 'Pauzeren' : 'Afspelen'}>{playing() ? 'Ⅱ' : '▶'}</button><div><strong>{selected() ? new Date(selected()!.epoch).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</strong><span>{selected() && `${regimeLabel(selected()!.source)} · ${new Date(selected()!.epoch).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })}`}</span></div></div>
      <input type="range" min="0" max={Math.max(0, timeline().length - 1)} step="0.01" value={cursor()} onInput={(event) => setCursor(event.currentTarget.valueAsNumber)} aria-label="Tijd" />
      <div class="segments"><For each={['Verleden', 'Nu', 'Nowcast', 'Model']}>{(label) => <span>{label}</span>}</For></div>
    </section>
  </main>
}

function project(lng: number, lat: number): [number, number] {
  const radius = 6378137
  return [lng * Math.PI / 180 * radius, Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * radius]
}
