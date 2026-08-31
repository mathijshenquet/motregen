import { createEffect, createMemo, createSignal, For, onCleanup, onMount, Show } from 'solid-js'
import maplibregl, { Marker, type GeoJSONSource } from 'maplibre-gl'
import HistogramScrubber from './components/HistogramScrubber'
import LocationSearch from './components/LocationSearch'
import WeatherIcon from './components/WeatherIcon'
import { loadBasemapStyle, type MapTheme } from './core/basemap'
import type { Field, Grid, Manifest, ManifestChunk, TimelineFrame } from './core/contract'
import { DayNightLayer } from './core/day-night-layer'

const DAY_NIGHT_ENABLED = false
import { buildHourlyForecast } from './core/forecast'
import { mapFrameFromGrid, NETHERLANDS_FLANDERS_BOUNDS, paddedGeographicBounds } from './core/map-frame'
import { MrfClient } from './core/mrf'
import { nearestPlace } from './core/places'
import { RainLayer } from './core/rain-layer'
import { loadSavedPlaces, savedPlaceId, samePlace, storeSavedPlaces, type SavedPlace } from './core/saved-places'
import { sunnyLocations, SUN_ICONS_ENABLED, type FieldBlend, type SunFeatureCollection } from './core/sun'
import { solarElevationSin } from './core/solar'
import { temperatureLabels, type TemperatureFeatureCollection } from './core/temperature'
import { buildTimeline, frameBlend, seriesValueAt } from './core/time-model'
import { uvAdvice } from './core/uv'
import { buildWindTimeline, sameGrid, zipWindFrame, type WindTimelineFrame } from './core/wind'
import { DEFAULT_WIND_TUNING, WindLayer, type WindTuning } from './core/wind-layer'
import { deriveWeatherIcon, summarizeWind } from './core/weather'

const manifestUrl = new URL('/data/manifest.json', location.href)
const defaultLocation = { lng: 5.18, lat: 52.1 }
const mapMovementBounds = paddedGeographicBounds(NETHERLANDS_FLANDERS_BOUNDS, { west: 0.05, south: 0.1, east: 0.15, north: 0.1 })
const themes = ['light', 'system', 'dark'] as const
type ThemeChoice = typeof themes[number]
type TemperatureField = Extract<Field, 'temp_c' | 'feels_like_c'>
const emptyTemperatureData: TemperatureFeatureCollection = { type: 'FeatureCollection', features: [] }
const emptySunData: SunFeatureCollection = { type: 'FeatureCollection', features: [] }

export default function App() {
  const devMode = new URLSearchParams(window.location.search).has('dev')
  let mapElement!: HTMLDivElement
  let splashElement!: HTMLDivElement
  let map: maplibregl.Map | undefined
  let marker: Marker | undefined
  let savedMarkers: Marker[] = []
  let dayNightLayer: DayNightLayer | undefined
  let layer: RainLayer | undefined
  let windLayer: WindLayer | undefined
  let windGrid: Grid | undefined
  let animation = 0
  let splashReplayTimer: number | undefined
  let shownFrameRequest = 0
  let shownWindRequest = 0
  let shownTemperatureRequest = 0
  let shownSunRequest = 0
  let pointRequest = 0
  let styleRequest = 0
  let appliedMapTheme: MapTheme | undefined
  let temperatureLabelKey = ''
  let sunFeatureKey = ''
  let sunEpochBucket = Number.NaN
  let rainReadyPending = false
  const windFrameCache = new Map<string, Promise<Float32Array>>()
  const media = matchMedia('(prefers-color-scheme: dark)')
  const client = new MrfClient(manifestUrl)
  const [manifest, setManifest] = createSignal<Manifest>()
  const timeline = createMemo(() => manifest() ? buildTimeline(manifest()!) : [])
  const radiationTimeline = createMemo(() => manifest() ? buildTimeline(manifest()!, 'radiation') : [])
  const uvTimeline = createMemo(() => manifest() ? buildTimeline(manifest()!, 'uv') : [])
  const tempTimeline = createMemo(() => manifest() ? buildTimeline(manifest()!, 'temp_c') : [])
  const feelsLikeTimeline = createMemo(() => manifest() ? buildTimeline(manifest()!, 'feels_like_c') : [])
  const humidityTimeline = createMemo(() => manifest() ? buildTimeline(manifest()!, 'rel_humidity') : [])
  const cloudTimeline = createMemo(() => manifest() ? buildTimeline(manifest()!, 'cloud_frac') : [])
  const windTimeline = createMemo(() => manifest() ? buildWindTimeline(manifest()!) : [])
  const windUFrames = createMemo(() => windTimeline().map((frame) => frame.u))
  const windVFrames = createMemo(() => windTimeline().map((frame) => frame.v))
  const [cursor, setCursor] = createSignal(0)
  const [playing, setPlaying] = createSignal(true)
  const [location, setLocation] = createSignal(defaultLocation)
  const [locationLabel, setLocationLabel] = createSignal('De Bilt')
  const [savedPlaces, setSavedPlaces] = createSignal<SavedPlace[]>(loadSavedPlaces())
  const [rainSeries, setRainSeries] = createSignal<Array<number | null>>([])
  const [pointSeriesLoading, setPointSeriesLoading] = createSignal(true)
  const [uvSeries, setUvSeries] = createSignal<Array<number | null>>([])
  const [temperatureSeries, setTemperatureSeries] = createSignal<Array<number | null>>([])
  const [feelsLikeSeries, setFeelsLikeSeries] = createSignal<Array<number | null>>([])
  const [humiditySeries, setHumiditySeries] = createSignal<Array<number | null>>([])
  const [cloudSeries, setCloudSeries] = createSignal<Array<number | null>>([])
  const [windUSeries, setWindUSeries] = createSignal<Array<number | null>>([])
  const [windVSeries, setWindVSeries] = createSignal<Array<number | null>>([])
  const [status, setStatus] = createSignal('Regen laden…')
  const [theme, setTheme] = createSignal<ThemeChoice>(storedTheme())
  const [temperatureField, setTemperatureField] = createSignal<TemperatureField>('feels_like_c')
  const [windTuning, setWindTuning] = createSignal<WindTuning>({ ...DEFAULT_WIND_TUNING })
  const [mapReady, setMapReady] = createSignal(false)
  const [splashSlowdown, setSplashSlowdown] = createSignal(storedSplashSlowdown())
  const [minimumMapWidthKm, setMinimumMapWidthKm] = createSignal(20)
  const [devMaximumZoom, setDevMaximumZoom] = createSignal(0)
  const [systemDark, setSystemDark] = createSignal(media.matches)
  const mapTheme = createMemo<MapTheme>(() => theme() === 'system' ? systemDark() ? 'dark' : 'light' : theme() as MapTheme)
  const splashStyle = createMemo(() => {
    const factor = splashSlowdown()
    return `--splash-reveal-duration:${1_200 * factor}ms;--splash-mark-duration:${300 * factor}ms;--splash-outer-delay:${600 * factor}ms;--splash-outer-duration:${600 * factor}ms`
  })

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
      const [style] = await Promise.all([
        loadBasemapStyle(initialTheme),
        discoverWindGrid(),
      ])
      appliedMapTheme = initialTheme
      map = new maplibregl.Map({
        container: mapElement,
        style,
        center: [5.3, 52.15],
        zoom: 6.4,
        maxBounds: mapMovementBounds,
        renderWorldCopies: false,
        attributionControl: false,
      })
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      applyMapDetailLimit(minimumMapWidthKm())
      syncSavedMarkers(savedPlaces())
      map.on('style.load', () => attachMapLayers(header.grid))
      map.on('click', (event) => pick(event.lngLat.lng, event.lngLat.lat, nearestPlace(event.lngLat.lng, event.lngLat.lat).name))
      pick(defaultLocation.lng, defaultLocation.lat, 'De Bilt')
      if (mapTheme() !== appliedMapTheme) void applyMapTheme(mapTheme())
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  })

  onCleanup(() => {
    cancelAnimationFrame(animation)
    window.clearTimeout(splashReplayTimer)
    for (const savedMarker of savedMarkers) savedMarker.remove()
    map?.remove()
  })

  createEffect(() => {
    const choice = theme()
    const effective = mapTheme()
    localStorage.setItem('motregen-theme', choice)
    document.documentElement.dataset.theme = effective
    document.documentElement.style.colorScheme = effective
    windLayer?.setTheme(effective)
    if (map && effective !== appliedMapTheme) void applyMapTheme(effective)
  })

  createEffect(() => localStorage.setItem('motregen-splash-slowdown', String(splashSlowdown())))

  createEffect(() => {
    const places = savedPlaces()
    storeSavedPlaces(places)
    syncSavedMarkers(places)
  })

  createEffect(() => {
    const tuning = windTuning()
    windLayer?.setTuning(tuning)
  })

  createEffect(() => {
    const epoch = selectedEpoch()
    temperatureField()
    dayNightLayer?.setEpoch(epoch)
    if (layer) void showFrame()
    if (windLayer) void showWind()
    if (map) void showTemperature()
    const nextSunBucket = Math.floor(epoch / 300_000)
    if (map && SUN_ICONS_ENABLED && nextSunBucket !== sunEpochBucket) {
      sunEpochBucket = nextSunBucket
      void showSun(epoch)
    }
  })
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

  function attachMapLayers(grid: Grid): void {
    if (!map || map.getLayer('motregen-rain')) return
    // uitgezet op PO-verzoek (MIP-4 ronde 7): tinting-implementatie voldoet
    // niet (en stond in dark mode verkeerd om); later iets beters of weglaten
    if (DAY_NIGHT_ENABLED) {
      dayNightLayer = new DayNightLayer(mapTheme())
      map.addLayer(dayNightLayer)
      dayNightLayer.setEpoch(selectedEpoch())
    }
    if (windGrid && windTimeline().length) {
      windLayer = new WindLayer(windGrid, mapTheme(), windTuning())
      map.addLayer(windLayer)
    }
    layer = new RainLayer(grid)
    map.addLayer(layer)
    if (SUN_ICONS_ENABLED && (radiationTimeline().length || uvTimeline().length)) attachSunLayer()
    if (hasTemperature()) attachTemperatureLayer()
    attachMapFrame(grid)
    void showFrame()
    void showWind()
    void showTemperature()
    sunEpochBucket = Math.floor(selectedEpoch() / 300_000)
    void showSun(selectedEpoch())
  }

  function attachMapFrame(grid: Grid): void {
    if (!map || map.getLayer('motregen-grid-frame')) return
    const frame = mapFrameFromGrid(grid)
    map.addSource('motregen-grid-frame', { type: 'geojson', data: frame.mask })
    const dark = mapTheme() === 'dark'
    map.addLayer({
      id: 'motregen-grid-outside',
      type: 'fill',
      source: 'motregen-grid-frame',
      paint: {
        'fill-color': dark ? '#071319' : '#84969b',
        'fill-opacity': dark ? 0.58 : 0.48,
      },
    })
    map.addLayer({
      id: 'motregen-grid-frame-shadow',
      type: 'line',
      source: 'motregen-grid-frame',
      paint: {
        'line-color': dark ? '#02080b' : '#30454c',
        'line-opacity': 0.45,
        'line-width': 7,
        'line-blur': 2,
      },
    })
    map.addLayer({
      id: 'motregen-grid-frame',
      type: 'line',
      source: 'motregen-grid-frame',
      paint: {
        'line-color': dark ? '#8da6af' : '#405b64',
        'line-opacity': 0.85,
        'line-width': 1.5,
      },
    })
  }

  async function showFrame(): Promise<void> {
    const frames = timeline()
    if (!frames.length || !layer || !map) return
    const request = ++shownFrameRequest
    const lower = Math.floor(cursor()), upper = Math.min(frames.length - 1, Math.ceil(cursor()))
    const epoch = frames[lower]!.epoch + (frames[upper]!.epoch - frames[lower]!.epoch) * (cursor() - lower)
    const blend = frameBlend(frames, epoch)
    const leftFrame = frames[blend.left]!, rightFrame = frames[blend.right]!
    const motionApplies = leftFrame.chunk.url === rightFrame.chunk.url && rightFrame.frameIndex === leftFrame.frameIndex + 1
    const [left, right, motion] = await Promise.all([
      load(leftFrame),
      load(rightFrame),
      motionApplies ? client.getMotion(rightFrame.chunk, rightFrame.frameIndex).catch(() => undefined) : undefined,
    ])
    if (request !== shownFrameRequest || !layer || !map) return
    layer.setFrames(left, right, blend.mix, motion, (rightFrame.epoch - leftFrame.epoch) / 60_000)
    if (!mapReady() && !rainReadyPending) {
      const renderedMap = map
      rainReadyPending = true
      renderedMap.once('render', () => {
        rainReadyPending = false
        if (map === renderedMap) setMapReady(true)
      })
    }
    map.triggerRepaint()
    for (const near of frames.slice(Math.max(0, lower - 2), upper + 4)) {
      client.prefetch(near.chunk, [near.frameIndex])
      client.prefetchMotion(near.chunk, [near.frameIndex])
    }
  }

  async function discoverWindGrid(): Promise<void> {
    const first = windTimeline()[0]
    if (!first) return
    try {
      const [uHeader, vHeader] = await Promise.all([client.getHeader(first.u.chunk), client.getHeader(first.v.chunk)])
      if (sameGrid(uHeader, vHeader)) windGrid = uHeader.grid
    } catch {
      windGrid = undefined
    }
  }

  async function showWind(): Promise<void> {
    const frames = windTimeline()
    if (!frames.length || !windLayer || !map) return
    const request = ++shownWindRequest
    const blend = frameBlend(windUFrames(), selectedEpoch())
    try {
      const [left, right] = await Promise.all([loadWind(frames[blend.left]!), loadWind(frames[blend.right]!)])
      if (request !== shownWindRequest || !windLayer || !map) return
      windLayer.setFrames(left, right, blend.mix)
      map.triggerRepaint()
    } catch {
      if (request === shownWindRequest && map.getLayer('motregen-wind')) map.removeLayer('motregen-wind')
      windLayer = undefined
    }
  }

  async function loadWind(frame: WindTimelineFrame): Promise<Float32Array> {
    const key = `${frame.u.chunk.url}#${frame.u.frameIndex}|${frame.v.chunk.url}#${frame.v.frameIndex}`
    let pending = windFrameCache.get(key)
    if (!pending) {
      pending = Promise.all([
        load(frame.u),
        load(frame.v),
        client.getHeader(frame.u.chunk),
        client.getHeader(frame.v.chunk),
      ]).then(([u, v, uHeader, vHeader]) => zipWindFrame(u, v, uHeader, vHeader))
      windFrameCache.set(key, pending)
      void pending.catch(() => windFrameCache.delete(key))
    }
    return pending
  }

  function attachTemperatureLayer(): void {
    if (!map || map.getLayer('motregen-temperature')) return
    temperatureLabelKey = ''
    map.addSource('motregen-temperature', { type: 'geojson', data: emptyTemperatureData })
    const dark = mapTheme() === 'dark'
    map.addLayer({
      id: 'motregen-temperature',
      type: 'symbol',
      source: 'motregen-temperature',
      layout: {
        'text-field': ['get', 'label'],
        'text-size': ['interpolate', ['linear'], ['zoom'], 5, 11, 8, 14],
        'text-font': ['Noto Sans Regular'],
        'text-allow-overlap': true,
        'text-padding': 3,
      },
      paint: {
        'text-color': dark ? '#f3fbfd' : '#102630',
        'text-halo-color': dark ? '#102027' : '#ffffff',
        'text-halo-width': 2,
        'text-halo-blur': 0.6,
      },
    })
  }

  function attachSunLayer(): void {
    if (!map || map.getLayer('motregen-sun')) return
    sunFeatureKey = ''
    map.addSource('motregen-sun', { type: 'geojson', data: emptySunData })
    const dark = mapTheme() === 'dark'
    map.addLayer({
      id: 'motregen-sun',
      type: 'symbol',
      source: 'motregen-sun',
      layout: {
        'text-field': '☀',
        'text-size': ['interpolate', ['linear'], ['zoom'], 5, 15, 8, 20],
        'text-font': ['Noto Sans Regular'],
        'text-offset': [0, -1.25],
        'text-allow-overlap': false,
        'text-padding': 10,
      },
      paint: {
        'text-color': dark ? '#ffd978' : '#e7a900',
        'text-opacity': ['get', 'opacity'],
        'text-halo-color': dark ? '#233139' : '#fffdf2',
        'text-halo-width': 1.6,
        'text-halo-blur': 0.45,
      },
    })
  }

  async function showTemperature(): Promise<void> {
    const frames = activeTemperatureTimeline()
    if (!frames.length || !map?.getSource('motregen-temperature')) return
    const request = ++shownTemperatureRequest
    const blend = frameBlend(frames, selectedEpoch())
    try {
      const leftFrame = frames[blend.left]!, rightFrame = frames[blend.right]!
      const [left, right, leftHeader, rightHeader] = await Promise.all([
        load(leftFrame), load(rightFrame), client.getHeader(leftFrame.chunk), client.getHeader(rightFrame.chunk),
      ])
      if (request !== shownTemperatureRequest || !map) return
      const source = map.getSource('motregen-temperature') as GeoJSONSource | undefined
      const labels = temperatureLabels(left, right, leftHeader, rightHeader, blend.mix)
      const key = labels.features.map((feature) => feature.properties.label).join('|')
      if (key !== temperatureLabelKey) {
        temperatureLabelKey = key
        source?.setData(labels)
      }
    } catch {
      const source = map?.getSource('motregen-temperature') as GeoJSONSource | undefined
      temperatureLabelKey = ''
      source?.setData(emptyTemperatureData)
    }
  }

  async function showSun(epoch: number): Promise<void> {
    if (!map?.getSource('motregen-sun')) return
    const request = ++shownSunRequest
    try {
      const [radiation, uv] = await Promise.all([
        loadFieldBlend(radiationTimeline(), epoch, 75 * 60_000),
        loadFieldBlend(uvTimeline(), epoch, 30 * 60_000),
      ])
      if (request !== shownSunRequest || !map) return
      const data = sunnyLocations(epoch, radiation, uv)
      const key = data.features.map((feature) => `${feature.properties.name}:${feature.properties.opacity.toFixed(2)}`).join('|')
      if (key !== sunFeatureKey) {
        sunFeatureKey = key
        const source = map.getSource('motregen-sun') as GeoJSONSource | undefined
        source?.setData(data)
      }
    } catch {
      if (request !== shownSunRequest) return
      sunFeatureKey = ''
      const source = map?.getSource('motregen-sun') as GeoJSONSource | undefined
      source?.setData(emptySunData)
    }
  }

  async function loadFieldBlend(frames: TimelineFrame[], epoch: number, edgeTolerance: number): Promise<FieldBlend | undefined> {
    if (!frames.length || epoch < frames[0]!.epoch - edgeTolerance || epoch > frames.at(-1)!.epoch + edgeTolerance) return undefined
    const blend = frameBlend(frames, epoch)
    const leftFrame = frames[blend.left]!
    const rightFrame = frames[blend.right]!
    const [left, right, leftHeader, rightHeader] = await Promise.all([
      load(leftFrame), load(rightFrame), client.getHeader(leftFrame.chunk), client.getHeader(rightFrame.chunk),
    ])
    return { left, right, leftHeader, rightHeader, mix: blend.mix }
  }

  function selectedEpoch(): number {
    const frames = timeline()
    if (!frames.length) return 0
    const lower = Math.floor(cursor()), upper = Math.min(frames.length - 1, Math.ceil(cursor()))
    return frames[lower]!.epoch + (frames[upper]!.epoch - frames[lower]!.epoch) * (cursor() - lower)
  }

  function load(frame: TimelineFrame): Promise<Uint8Array> {
    return client.getFrame(frame.chunk, frame.frameIndex)
  }

  function pick(lng: number, lat: number, label: string): void {
    const point = { lng, lat }
    setLocation(point)
    setLocationLabel(label)
    marker?.remove()
    if (map) marker = new Marker({ color: '#1688ad' }).setLngLat([lng, lat]).addTo(map)
    void updatePointSeries(point, label)
  }

  async function updatePointSeries(point: { lng: number; lat: number }, label: string): Promise<void> {
    const request = ++pointRequest
    setStatus(`${label} · verwachting laden…`)
    setPointSeriesLoading(true)
    setRainSeries([])
    setUvSeries([])
    setTemperatureSeries([])
    setFeelsLikeSeries([])
    setHumiditySeries([])
    setCloudSeries([])
    setWindUSeries([])
    setWindVSeries([])
    try {
      const [rain, uv, temperature, feelsLike, humidity, cloud, windU, windV] = await Promise.all([
        readPointSeries(timeline(), point),
        readOptionalPointSeries(uvTimeline(), point),
        readOptionalPointSeries(tempTimeline(), point),
        readOptionalPointSeries(feelsLikeTimeline(), point),
        readOptionalPointSeries(humidityTimeline(), point),
        readOptionalPointSeries(cloudTimeline(), point),
        readOptionalPointSeries(windUFrames(), point),
        readOptionalPointSeries(windVFrames(), point),
      ])
      if (request !== pointRequest) return
      setRainSeries(rain)
      setUvSeries(uv)
      setTemperatureSeries(temperature)
      setFeelsLikeSeries(feelsLike)
      setHumiditySeries(humidity)
      setCloudSeries(cloud)
      setWindUSeries(windU)
      setWindVSeries(windV)
      setStatus(label)
      setPointSeriesLoading(false)
    } catch {
      if (request === pointRequest) {
        setStatus(`${label} · verwachting kon niet worden geladen`)
        setPointSeriesLoading(false)
      }
    }
  }

  function readOptionalPointSeries(frames: TimelineFrame[], point: { lng: number; lat: number }): Promise<Array<number | null>> {
    return frames.length ? readPointSeries(frames, point).catch(() => []) : Promise.resolve([])
  }

  async function readPointSeries(frames: TimelineFrame[], point: { lng: number; lat: number }): Promise<Array<number | null>> {
    const [x, y] = project(point.lng, point.lat)
    const values = new Array<number | null>(frames.length).fill(null)
    const chunks = new Map<ManifestChunk, Array<{ position: number; frameIndex: number }>>()
    for (let position = 0; position < frames.length; position++) {
      const frame = frames[position]!
      const entries = chunks.get(frame.chunk) ?? []
      entries.push({ position, frameIndex: frame.frameIndex })
      chunks.set(frame.chunk, entries)
    }
    await Promise.all([...chunks].map(async ([chunk, entries]) => {
      const [decoded, header] = await Promise.all([
        client.getFrames(chunk, entries.map((entry) => entry.frameIndex)),
        client.getHeader(chunk),
      ])
      const column = Math.floor((x - header.grid.x0) / header.grid.dx)
      const row = Math.floor((y - header.grid.y0) / header.grid.dy)
      if (column < 0 || row < 0 || column >= header.grid.width || row >= header.grid.height) return
      for (let index = 0; index < entries.length; index++) {
        values[entries[index]!.position] = header.quant[decoded[index]![row * header.grid.width + column]!] ?? null
      }
    }))
    return values
  }

  function locate(): void {
    if (!navigator.geolocation) { setStatus('Locatie is niet beschikbaar in deze browser'); return }
    setStatus('Locatie bepalen…')
    navigator.geolocation.getCurrentPosition(({ coords }) => {
      map?.easeTo({ center: [coords.longitude, coords.latitude], duration: 450 })
      pick(coords.longitude, coords.latitude, 'Mijn locatie')
    }, () => setStatus('Locatietoegang geweigerd — tik op de kaart'), { timeout: 10_000 })
  }

  function chooseSearch(point: { lng: number; lat: number }, label: string): void {
    map?.easeTo({ center: [point.lng, point.lat], duration: 450 })
    pick(point.lng, point.lat, label)
  }

  function saveCurrentPlace(name: string): void {
    const point = location()
    const sourceLabel = locationLabel()
    const saved: SavedPlace = { id: savedPlaceId(point.lng, point.lat), name, sourceLabel, ...point }
    setSavedPlaces((places) => [saved, ...places.filter((place) => !samePlace(place, point))].slice(0, 20))
    setLocationLabel(name)
  }

  function removeSavedPlace(id: string): void {
    setSavedPlaces((places) => places.filter((place) => place.id !== id))
  }

  function syncSavedMarkers(places: SavedPlace[]): void {
    for (const savedMarker of savedMarkers) savedMarker.remove()
    savedMarkers = []
    if (!map) return
    for (const place of places) {
      const element = document.createElement('button')
      element.type = 'button'
      element.className = 'saved-place-marker'
      element.textContent = '★'
      element.title = place.name
      element.setAttribute('aria-label', `${place.name} bekijken`)
      element.addEventListener('pointerdown', (event) => event.stopPropagation())
      element.addEventListener('click', (event) => {
        event.stopPropagation()
        chooseSearch(place, place.name)
      })
      savedMarkers.push(new Marker({ element, anchor: 'center' }).setLngLat([place.lng, place.lat]).addTo(map))
    }
  }

  function cycleTheme(): void {
    setTheme((current) => themes[(themes.indexOf(current) + 1) % themes.length]!)
  }

  function tuneWind<Key extends keyof WindTuning>(key: Key, value: WindTuning[Key]): void {
    setWindTuning((current) => ({ ...current, [key]: value }))
  }

  function tuneMapDetail(minimumWidthKm: number): void {
    setMinimumMapWidthKm(minimumWidthKm)
    applyMapDetailLimit(minimumWidthKm)
  }

  function applyMapDetailLimit(minimumWidthKm: number): void {
    if (!map) return
    const latitude = map.getCenter().lat
    const circumferenceKm = 40_075.017 * Math.cos(latitude * Math.PI / 180)
    const maximumZoom = Math.log2(circumferenceKm * map.getContainer().clientWidth / (512 * minimumWidthKm))
    map.setMaxZoom(maximumZoom)
    setDevMaximumZoom(maximumZoom)
  }

  function replaySplash(): void {
    window.clearTimeout(splashReplayTimer)
    setMapReady(false)
    for (const animation of splashElement.getAnimations({ subtree: true })) animation.cancel()
    void splashElement.offsetWidth
    splashReplayTimer = window.setTimeout(() => setMapReady(true), 1_000)
  }

  const forecast = createMemo(() => buildHourlyForecast({
    rain: timeline(),
    uv: uvTimeline(),
    temperature: tempTimeline(),
    feelsLike: feelsLikeTimeline(),
    humidity: humidityTimeline(),
    cloud: cloudTimeline(),
    windU: windUFrames(),
    windV: windVFrames(),
  }, manifest() ? Date.parse(manifest()!.now) : 0))
  const cursorUv = createMemo(() => seriesValueAt(uvTimeline(), uvSeries(), selectedEpoch(), 30 * 60_000))
  const cursorUvChip = createMemo(() => uvChipLabel(cursorUv()))
  const hasTemperature = createMemo(() => tempTimeline().length > 0 || feelsLikeTimeline().length > 0)
  const hasBothTemperatures = createMemo(() => tempTimeline().length > 0 && feelsLikeTimeline().length > 0)
  const hasWeatherIcons = createMemo(() => cloudTimeline().length > 0)
  const hasWeatherColumn = createMemo(() => hasWeatherIcons() || uvTimeline().length > 0)
  const hasHumidity = createMemo(() => humidityTimeline().length > 0)
  const hasWind = createMemo(() => windUFrames().length > 0 && windVFrames().length > 0)
  const activeTemperatureField = createMemo<TemperatureField>(() => {
    if (temperatureField() === 'feels_like_c' && feelsLikeTimeline().length) return 'feels_like_c'
    if (temperatureField() === 'temp_c' && tempTimeline().length) return 'temp_c'
    return feelsLikeTimeline().length ? 'feels_like_c' : 'temp_c'
  })
  const activeTemperatureTimeline = createMemo(() => {
    return activeTemperatureField() === 'feels_like_c' ? feelsLikeTimeline() : tempTimeline()
  })
  const themeMeta = createMemo(() => theme() === 'light'
    ? { icon: '☀', label: 'Licht', next: 'systeem' }
    : theme() === 'system'
      ? { icon: '◐', label: 'Systeem', next: 'donker' }
      : { icon: '☾', label: 'Donker', next: 'licht' })

  return <main class="app-shell">
    <section class="map-shell" aria-label="Regenkaart van Nederland">
      <div ref={mapElement} class="map" />
      <div ref={splashElement} class="map-splash" classList={{ ready: mapReady() }} style={splashStyle()} aria-hidden={mapReady()}>
        <div class="map-splash-veil" />
        <div class="map-splash-mark">
          <img src="/droplet.svg" alt="" />
          <strong>motregen.nl</strong>
        </div>
      </div>
      <div class="map-brand" aria-label="motregen.nl"><img src="/droplet.svg" alt="" /><strong>motregen.nl</strong></div>
      <button class="round-action theme-button mobile-map-theme" onClick={cycleTheme} aria-label={`Thema: ${themeMeta().label}. Klik voor ${themeMeta().next}`} title={`Thema: ${themeMeta().label}`}>
        <span aria-hidden="true">{themeMeta().icon}</span>
      </button>
      <LocationSearch
        location={location()}
        locationLabel={locationLabel()}
        savedPlaces={savedPlaces()}
        onLocate={locate}
        onRemove={removeSavedPlace}
        onSave={saveCurrentPlace}
        onSelect={chooseSearch}
      />
      <Show when={hasBothTemperatures()}>
        <div class="temperature-switch" role="group" aria-label="Temperatuurlaag">
          <button classList={{ active: temperatureField() === 'temp_c' }} onClick={() => setTemperatureField('temp_c')}>Temperatuur</button>
          <button classList={{ active: temperatureField() === 'feels_like_c' }} onClick={() => setTemperatureField('feels_like_c')}>Gevoel</button>
        </div>
      </Show>
      <Show when={devMode && windTimeline().length}>
        <details class="wind-debug" open>
          <summary>Wind debug</summary>
          <label><span>Zichtbaar</span><input type="range" min="0" max="3" step="0.1" value={windTuning().visibility} onInput={(event) => tuneWind('visibility', event.currentTarget.valueAsNumber)} /><output>{windTuning().visibility.toFixed(1)}</output></label>
          <label><span>Dikte</span><input type="range" min="1" max="5" step="0.25" value={windTuning().thickness} onInput={(event) => tuneWind('thickness', event.currentTarget.valueAsNumber)} /><output>{windTuning().thickness.toLocaleString('nl-NL', { maximumFractionDigits: 2 })} px</output></label>
          <label><span>Dichtheid</span><input type="range" min="100" max="1600" step="20" value={windTuning().particlesPerMegapixel} onInput={(event) => tuneWind('particlesPerMegapixel', event.currentTarget.valueAsNumber)} /><output>{windTuning().particlesPerMegapixel}</output></label>
          <label><span>Deeltjes</span><input type="range" min="0.1" max="1" step="0.05" value={windTuning().particleOpacity} onInput={(event) => tuneWind('particleOpacity', event.currentTarget.valueAsNumber)} /><output>{windTuning().particleOpacity.toFixed(2)}</output></label>
          <label><span>Trailduur</span><input type="range" min="0.9" max="0.99" step="0.001" value={windTuning().trailFade} onInput={(event) => tuneWind('trailFade', event.currentTarget.valueAsNumber)} /><output>{windTuning().trailFade.toFixed(3)}</output></label>
          <label><span>Dekking</span><input type="range" min="0.1" max="1" step="0.05" value={windTuning().trailOpacity} onInput={(event) => tuneWind('trailOpacity', event.currentTarget.valueAsNumber)} /><output>{windTuning().trailOpacity.toFixed(2)}</output></label>
          <label><span>Min. breedte</span><input type="range" min="5" max="100" step="5" value={minimumMapWidthKm()} onInput={(event) => tuneMapDetail(event.currentTarget.valueAsNumber)} /><output>{minimumMapWidthKm()} km</output></label>
          <p class="wind-debug-note">Maximale kaartzoom: {devMaximumZoom().toFixed(1)}</p>
          <label><span>Splash ×</span><input type="range" min="1" max="8" step="0.5" value={splashSlowdown()} onInput={(event) => setSplashSlowdown(event.currentTarget.valueAsNumber)} /><output>{splashSlowdown().toLocaleString('nl-NL', { maximumFractionDigits: 1 })}×</output></label>
          <button class="wind-debug-replay" onClick={replaySplash}>Herhaal splash</button>
        </details>
      </Show>
      <div class="source">Bron: KNMI · Kaart: OpenFreeMap</div>
    </section>
    <aside class="dashboard">
      <nav class="sidebar-nav" aria-label="Instellingen en locatie">
        <Show when={cursorUvChip()}>{(label) => <span class="uv-chip sidebar-uv-chip" title="Insmeren aanbevolen"><span aria-hidden="true">☀</span><span class="uv-long">{label()}</span><span class="uv-short">UV {formatUv(cursorUv())}</span></span>}</Show>
        <div class="sidebar-actions">
          <button class="round-action theme-button sidebar-theme" onClick={cycleTheme} aria-label={`Thema: ${themeMeta().label}. Klik voor ${themeMeta().next}`} title={`Thema: ${themeMeta().label}`}>
            <span aria-hidden="true">{themeMeta().icon}</span><small>{themeMeta().label}</small>
          </button>
        </div>
      </nav>
      <HistogramScrubber
        timeline={timeline()}
        values={rainSeries()}
        cursor={cursor()}
        now={manifest() ? Date.parse(manifest()!.now) : 0}
        playing={playing()}
        loading={pointSeriesLoading()}
        locationLabel={status()}
        onCursor={setCursor}
        onPlaying={setPlaying}
      />
      <section class="forecast-panel">
        <div class="section-heading"><div><p class="eyebrow">Vooruitblik</p><h2>Komende 24 uur</h2></div><span>{location() ? 'Per uur' : ''}</span></div>
        <div class="table-scroll">
          <table>
            <thead><tr>
              <th>Uur</th>
              <Show when={hasWeatherColumn()}><th class="weather-heading">Weer</th></Show>
              <Show when={hasTemperature()}><th>{activeTemperatureField() === 'feels_like_c' ? 'Gevoel' : 'Temp.'}</th></Show>
              <Show when={hasHumidity()}><th>RV</th></Show>
              <Show when={hasWind()}><th>Wind</th></Show>
              <th>Regen</th>
            </tr></thead>
            <tbody><For each={forecast()}>{(row) => {
              const rain = () => row.rainIndex == null ? null : rainSeries()[row.rainIndex]
              const uv = () => row.uvIndex == null ? null : uvSeries()[row.uvIndex]
              const cloud = () => row.cloudIndex == null ? null : cloudSeries()[row.cloudIndex]
              const temperature = () => activeTemperatureField() === 'feels_like_c'
                ? row.feelsLikeIndex == null ? null : feelsLikeSeries()[row.feelsLikeIndex]
                : row.temperatureIndex == null ? null : temperatureSeries()[row.temperatureIndex]
              const humidity = () => row.humidityIndex == null ? null : humiditySeries()[row.humidityIndex]
              const wind = () => summarizeWind(
                row.windUIndex == null ? null : windUSeries()[row.windUIndex] ?? null,
                row.windVIndex == null ? null : windVSeries()[row.windVIndex] ?? null,
              )
              const icon = () => deriveWeatherIcon(rain() ?? null, cloud() ?? null, solarElevationSin(row.epoch, location().lng, location().lat) > 0)
              const advice = () => uvChipLabel(uv())
              return <tr>
                <td><strong>{new Date(row.epoch).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</strong><span>{new Date(row.epoch).toLocaleDateString('nl-NL', { weekday: 'short' })}</span></td>
                <Show when={hasWeatherColumn()}><td class="weather-cell"><Show when={icon()}>{(model) => <WeatherIcon model={model()} />}</Show><Show when={advice()}>{(label) => <span class="uv-chip table-uv-chip" title={label()}>UV {formatUv(uv())}</span>}</Show></td></Show>
                <Show when={hasTemperature()}><td class="temperature-cell">{formatTemperature(temperature())}</td></Show>
                <Show when={hasHumidity()}><td>{formatHumidity(humidity())}</td></Show>
                <Show when={hasWind()}><td class="wind-cell"><Show when={wind()} fallback="—">{(value) => <span title={`${value().speed.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} m/s`}>{value().direction} · {value().beaufort} Bft</span>}</Show></td></Show>
                <td>{formatRain(rain())}<small> mm/u</small></td>
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

function storedSplashSlowdown(): number {
  const stored = localStorage.getItem('motregen-splash-slowdown')
  if (stored === null) return 1.5
  const value = Number(stored)
  return Number.isFinite(value) ? Math.max(1, Math.min(8, value)) : 1.5
}

function project(lng: number, lat: number): [number, number] {
  const radius = 6378137
  return [lng * Math.PI / 180 * radius, Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * radius]
}

function formatRain(value: number | null | undefined): string {
  return value == null ? '—' : value.toLocaleString('nl-NL', { maximumFractionDigits: value < 1 ? 2 : 1 })
}

function formatTemperature(value: number | null | undefined): string {
  return value == null ? '—' : `${Math.round(value)}°`
}

function formatHumidity(value: number | null | undefined): string {
  return value == null ? '—' : `${Math.round(value)}%`
}

function formatUv(value: number | null | undefined): string {
  return value == null ? '—' : value.toLocaleString('nl-NL', { maximumFractionDigits: 1 })
}

function uvChipLabel(value: number | null | undefined): string | null {
  const advice = uvAdvice(value)
  return advice ? `Insmeren · UV ${formatUv(advice.value)} ${advice.strength}` : null
}
