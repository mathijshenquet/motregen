import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import maplibregl, { Marker } from 'maplibre-gl'
import HistogramScrubber from './components/HistogramScrubber'
import LocationSearch from './components/LocationSearch'
import { loadBasemapStyle, type MapTheme } from './core/basemap'
import type { Grid, Manifest, TimelineFrame } from './core/contract'
import { buildHourlyForecast } from './core/forecast'
import { MrfClient } from './core/mrf'
import { RainLayer } from './core/rain-layer'
import { buildTimeline, frameBlend } from './core/time-model'

const manifestUrl = new URL('/data/manifest.json', location.href)
const defaultLocation = { lng: 5.18, lat: 52.1 }
const themes = ['light', 'system', 'dark'] as const
type ThemeChoice = typeof themes[number]

export default function App() {
  let mapElement!: HTMLDivElement
  let map: maplibregl.Map | undefined
  let marker: Marker | undefined
  let layer: RainLayer | undefined
  let animation = 0
  let shownFrameRequest = 0
  let pointRequest = 0
  let styleRequest = 0
  let appliedMapTheme: MapTheme | undefined
  const media = matchMedia('(prefers-color-scheme: dark)')
  const client = new MrfClient(manifestUrl)
  const [manifest, setManifest] = createSignal<Manifest>()
  const timeline = createMemo(() => manifest() ? buildTimeline(manifest()!) : [])
  const radiationTimeline = createMemo(() => manifest() ? buildTimeline(manifest()!, 'radiation') : [])
  const [cursor, setCursor] = createSignal(0)
  const [playing, setPlaying] = createSignal(false)
  const [location, setLocation] = createSignal(defaultLocation)
  const [rainSeries, setRainSeries] = createSignal<Array<number | null>>([])
  const [radiationSeries, setRadiationSeries] = createSignal<Array<number | null>>([])
  const [status, setStatus] = createSignal('Regen laden…')
  const [theme, setTheme] = createSignal<ThemeChoice>(storedTheme())
  const [systemDark, setSystemDark] = createSignal(media.matches)
  const mapTheme = createMemo<MapTheme>(() => theme() === 'system' ? systemDark() ? 'dark' : 'light' : theme() as MapTheme)

  onMount(async () => {
    const mediaChanged = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    media.addEventListener('change', mediaChanged)
    onCleanup(() => media.removeEventListener('change', mediaChanged))
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
      const initialTheme = mapTheme()
      const style = await loadBasemapStyle(initialTheme)
      appliedMapTheme = initialTheme
      map = new maplibregl.Map({
        container: mapElement,
        style,
        center: [5.3, 52.15],
        zoom: 6.4,
        attributionControl: false,
      })
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      map.on('style.load', () => attachRainLayer(header.grid))
      map.on('click', (event) => pick(event.lngLat.lng, event.lngLat.lat, `${event.lngLat.lat.toFixed(3)}° N, ${event.lngLat.lng.toFixed(3)}° O`))
      pick(defaultLocation.lng, defaultLocation.lat, 'De Bilt')
      if (mapTheme() !== appliedMapTheme) void applyMapTheme(mapTheme())
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  })

  onCleanup(() => { cancelAnimationFrame(animation); map?.remove() })

  createEffect(() => {
    const choice = theme()
    const effective = mapTheme()
    localStorage.setItem('motregen-theme', choice)
    document.documentElement.dataset.theme = effective
    document.documentElement.style.colorScheme = effective
    if (map && effective !== appliedMapTheme) void applyMapTheme(effective)
  })

  createEffect(() => { cursor(); if (layer) void showFrame() })
  createEffect(() => {
    if (!playing()) { cancelAnimationFrame(animation); return }
    let previous = performance.now()
    const tick = (now: number) => {
      const elapsed = now - previous
      previous = now
      setCursor((value) => value >= timeline().length - 1 ? 0 : Math.min(timeline().length - 1, value + elapsed / 650))
      animation = requestAnimationFrame(tick)
    }
    animation = requestAnimationFrame(tick)
  })

  async function applyMapTheme(nextTheme: MapTheme): Promise<void> {
    const request = ++styleRequest
    try {
      const style = await loadBasemapStyle(nextTheme)
      if (!map || request !== styleRequest) return
      appliedMapTheme = nextTheme
      map.setStyle(style)
    } catch {
      setStatus('De kaartstijl kon niet worden gewisseld')
    }
  }

  function attachRainLayer(grid: Grid): void {
    if (!map || map.getLayer('motregen-rain')) return
    layer = new RainLayer(grid)
    map.addLayer(layer)
    void showFrame()
  }

  async function showFrame(): Promise<void> {
    const frames = timeline()
    if (!frames.length || !layer || !map) return
    const request = ++shownFrameRequest
    const lower = Math.floor(cursor()), upper = Math.min(frames.length - 1, Math.ceil(cursor()))
    const epoch = frames[lower]!.epoch + (frames[upper]!.epoch - frames[lower]!.epoch) * (cursor() - lower)
    const blend = frameBlend(frames, epoch)
    const [left, right] = await Promise.all([load(frames[blend.left]!), load(frames[blend.right]!)])
    if (request !== shownFrameRequest || !layer || !map) return
    layer.setFrames(left, right, blend.mix)
    map.triggerRepaint()
    for (const near of frames.slice(Math.max(0, lower - 2), upper + 4)) client.prefetch(near.chunk, [near.frameIndex])
  }

  function load(frame: TimelineFrame): Promise<Uint8Array> {
    return client.getFrame(frame.chunk, frame.frameIndex)
  }

  function pick(lng: number, lat: number, label: string): void {
    const point = { lng, lat }
    setLocation(point)
    marker?.remove()
    if (map) marker = new Marker({ color: '#1688ad' }).setLngLat([lng, lat]).addTo(map)
    void updatePointSeries(point, label)
  }

  async function updatePointSeries(point: { lng: number; lat: number }, label: string): Promise<void> {
    const request = ++pointRequest
    setStatus(`${label} · verwachting laden…`)
    try {
      const [rain, radiation] = await Promise.all([
        readPointSeries(timeline(), point),
        readPointSeries(radiationTimeline(), point),
      ])
      if (request !== pointRequest) return
      setRainSeries(rain)
      setRadiationSeries(radiation)
      setStatus(label)
    } catch {
      if (request === pointRequest) setStatus(`${label} · verwachting kon niet worden geladen`)
    }
  }

  async function readPointSeries(frames: TimelineFrame[], point: { lng: number; lat: number }): Promise<Array<number | null>> {
    const [x, y] = project(point.lng, point.lat)
    return Promise.all(frames.map(async (frame) => {
      const [bytes, header] = await Promise.all([load(frame), client.getHeader(frame.chunk)])
      const column = Math.floor((x - header.grid.x0) / header.grid.dx)
      const row = Math.floor((y - header.grid.y0) / header.grid.dy)
      if (column < 0 || row < 0 || column >= header.grid.width || row >= header.grid.height) return null
      return header.quant[bytes[row * header.grid.width + column]!] ?? null
    }))
  }

  function locate(): void {
    if (!navigator.geolocation) { setStatus('Locatie is niet beschikbaar in deze browser'); return }
    setStatus('Locatie bepalen…')
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      map?.flyTo({ center: [coords.longitude, coords.latitude], zoom: 9 })
      pick(coords.longitude, coords.latitude, 'Mijn locatie')
    }, () => setStatus('Locatietoegang geweigerd — tik op de kaart'), { timeout: 10_000 })
  }

  function chooseSearch(point: { lng: number; lat: number }, label: string): void {
    map?.flyTo({ center: [point.lng, point.lat], zoom: 9 })
    pick(point.lng, point.lat, label)
  }

  function cycleTheme(): void {
    setTheme((current) => themes[(themes.indexOf(current) + 1) % themes.length]!)
  }

  const intensity = createMemo(() => rainSeries()[Math.round(cursor())])
  const forecast = createMemo(() => buildHourlyForecast(timeline(), radiationTimeline(), manifest() ? Date.parse(manifest()!.now) : 0))
  const hasRadiation = createMemo(() => radiationTimeline().length > 0)
  const themeMeta = createMemo(() => theme() === 'light'
    ? { icon: '☀', label: 'Licht', next: 'systeem' }
    : theme() === 'system'
      ? { icon: '◐', label: 'Systeem', next: 'donker' }
      : { icon: '☾', label: 'Donker', next: 'licht' })

  return <main class="app-shell">
    <header class="topbar">
      <span class="brand"><img src="/droplet.svg" alt="" />motregen</span>
      <div class="header-actions">
        <button class="round-action theme-button" onClick={cycleTheme} aria-label={`Thema: ${themeMeta().label}. Klik voor ${themeMeta().next}`} title={`Thema: ${themeMeta().label}`}>
          <span aria-hidden="true">{themeMeta().icon}</span><small>{themeMeta().label}</small>
        </button>
        <button class="round-action locate" onClick={locate} aria-label="Gebruik mijn locatie"><span aria-hidden="true">⌖</span><small>Mijn locatie</small></button>
      </div>
    </header>
    <section class="map-shell" aria-label="Regenkaart van Nederland">
      <div ref={mapElement} class="map" />
      <LocationSearch onSelect={chooseSearch} />
      <div class="source">Bron: KNMI · Kaart: OpenFreeMap</div>
    </section>
    <aside class="dashboard">
      <section class="current-weather">
        <div>
          <p class="eyebrow">{status()}</p>
          <div class="reading"><strong>{formatRain(intensity())}</strong><span>mm/u</span></div>
        </div>
        <div class="current-summary">
          <span class="rain-symbol" aria-hidden="true">●</span>
          <span>{rainDescription(intensity())}</span>
        </div>
      </section>
      <HistogramScrubber
        timeline={timeline()}
        values={rainSeries()}
        cursor={cursor()}
        now={manifest() ? Date.parse(manifest()!.now) : 0}
        playing={playing()}
        onCursor={setCursor}
        onPlaying={setPlaying}
      />
      <section class="forecast-panel">
        <div class="section-heading"><div><p class="eyebrow">Vooruitblik</p><h2>Komende 24 uur</h2></div><span>{location() ? 'Per uur' : ''}</span></div>
        <div class="table-scroll">
          <table>
            <thead><tr><th>Uur</th><th>Regen</th><Show when={hasRadiation()}><th>Zon</th></Show></tr></thead>
            <tbody><For each={forecast()}>{(row) => {
              const rain = () => row.rainIndex == null ? null : rainSeries()[row.rainIndex]
              const radiation = () => row.radiationIndex == null ? null : radiationSeries()[row.radiationIndex]
              return <tr>
                <td><strong>{new Date(row.epoch).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</strong><span>{new Date(row.epoch).toLocaleDateString('nl-NL', { weekday: 'short' })}</span></td>
                <td>{formatRain(rain())}<small> mm/u</small></td>
                <Show when={hasRadiation()}><td class="sun-cell"><span class="sun-icon" style={{ opacity: String(sunOpacity(radiation())) }} aria-hidden="true">☀</span>{formatRadiation(radiation())}<small> W/m²</small></td></Show>
              </tr>
            }}</For></tbody>
          </table>
        </div>
      </section>
    </aside>
  </main>
}

function storedTheme(): ThemeChoice {
  const stored = localStorage.getItem('motregen-theme')
  return stored === 'light' || stored === 'system' || stored === 'dark' ? stored : 'light'
}

function project(lng: number, lat: number): [number, number] {
  const radius = 6378137
  return [lng * Math.PI / 180 * radius, Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * radius]
}

function formatRain(value: number | null | undefined): string {
  return value == null ? '—' : value.toLocaleString('nl-NL', { maximumFractionDigits: value < 1 ? 2 : 1 })
}

function formatRadiation(value: number | null | undefined): string {
  return value == null ? '—' : Math.round(value).toLocaleString('nl-NL')
}

function sunOpacity(value: number | null | undefined): number {
  return value == null ? 0.18 : Math.max(0.22, Math.min(1, value / 700))
}

function rainDescription(value: number | null | undefined): string {
  if (value == null) return 'Geen meetpunt'
  if (value < 0.1) return 'Droog'
  if (value < 1) return 'Lichte regen'
  if (value < 5) return 'Regen'
  if (value < 15) return 'Stevige regen'
  return 'Zware bui'
}
