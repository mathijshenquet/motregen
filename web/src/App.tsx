import { batch, createEffect, createMemo, createSignal, onCleanup, onMount, Show } from 'solid-js'
import maplibregl, { Marker, type GeoJSONSource } from 'maplibre-gl'
import About from './components/About'
import HistogramScrubber from './components/HistogramScrubber'
import LocationSearch from './components/LocationSearch'
import MapClock from './components/MapClock'
import PerfHud from './components/PerfHud'
import ForecastTable, { type SunForm } from './components/ForecastTable'
import { loadBasemapStyle, temperatureLayerBeforeId, type MapTheme } from './core/basemap'
import { CloudEdgeLayer } from './core/cloud-edge-layer'
import type { Grid, Manifest, ManifestChunk, MrfHeader, TimelineFrame } from './core/contract'
import { DayNightLayer } from './core/day-night-layer'

const DAY_NIGHT_ENABLED = false
import { buildHourlyForecast, isPassiveRow, PASSIVE_FORECAST_HOURS } from './core/forecast'
import { FrameBatcher } from './core/frame-batcher'
import { cursorAfterTimelineRefresh, isNewerManifest, reconcileTimelineSeries, scheduleManifestRefresh } from './core/manifest-refresh'
import { constrainView, containView, containZoom, MAP_CONTAIN_BOUNDS } from './core/map-constraint'
import { mapFrameFromGrid } from './core/map-frame'
import { MrfClient, type MotionField } from './core/mrf'
import { selectPairMotion } from './core/motion-selection'
import { nearestPlace } from './core/places'
import { startFrameLoop } from './core/playback'
import { installPerfMonitor, type LoadLayer } from './core/perf'
import { RainLayer } from './core/rain-layer'
import { loadLastSavedPlaceId, loadMapView, resolveStartLocation, storeLastSavedPlaceId, storeMapView } from './core/location-memory'
import { loadSavedPlaces, savedPlaceId, samePlace, storeSavedPlaces, type SavedPlace } from './core/saved-places'
import { sunnyLocations, SUN_ICONS_ENABLED, type FieldBlend, type SunFeatureCollection } from './core/sun'
import { solarElevationSin } from './core/solar'
import { selectTemperaturePlaces, temperatureLabelSpacingPx, temperatureLabels, temperatureLayer, type TemperatureFeatureCollection } from './core/temperature'
import { buildTimeline, frameBlend, seriesValueAt, timelineCursorAtEpoch, timelineEpochAtCursor, timelineHorizonEnd, timelinePlaybackRate } from './core/time-model'
import { formatUv, uvChipLabel } from './core/uv'
import { buildWindTimeline, sameGrid, zipWindFrame, type WindTimelineFrame } from './core/wind'
import { loadWindTuning, storeWindTuning, WindLayer, type WindTuning } from './core/wind-layer'

const manifestUrl = new URL('/data/manifest.json', location.href)
const perf = installPerfMonitor()
const defaultLocation = { lng: 5.18, lat: 52.1, label: 'De Bilt' }
const themes = ['light', 'system', 'dark'] as const
type ThemeChoice = typeof themes[number]
type PointLoadStage = 'initial' | 'direct' | 'window' | 'complete'
type FetchPriority = 'high' | 'low'
type ForecastIndex = 'radiationIndex' | 'uvIndex' | 'temperatureIndex' | 'feelsLikeIndex' | 'humidityIndex' | 'cloudIndex' | 'windUIndex' | 'windVIndex'

interface PointLoadState {
  request: number
  point: { lng: number; lat: number }
  rainValues: Array<number | null>
  rainLoaded: Set<number>
  rainQueue: Promise<void>
  direct: Promise<void>
  full?: Promise<void>
  idle?: number
  deepIdle?: number
  rainPublisher?: FrameBatcher
}
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
  let cloudEdgeLayer: CloudEdgeLayer | undefined
  let windGrid: Grid | undefined
  let splashReplayTimer: number | undefined
  let mapViewTimer: number | undefined
  let stopManifestRefresh: (() => void) | undefined
  let shownFrameRequest = 0
  let shownWindRequest = 0
  let shownTemperatureRequest = 0
  let shownSunRequest = 0
  let shownCloudEdgeRequest = 0
  let pointRequest = 0
  let styleRequest = 0
  let appliedMapTheme: MapTheme | undefined
  let temperatureLabelKey = ''
  let sunFeatureKey = ''
  let sunEpochBucket = Number.NaN
  let rainReadyPending = false
  let scrubPrefetch = false
  let logoTapCount = 0
  let lastLogoTap = 0
  let initialPickStarted = false
  let pointLoad: PointLoadState | undefined
  const windFrameCache = new Map<string, Promise<Float32Array>>()
  const media = matchMedia('(prefers-color-scheme: dark)')
  const client = new MrfClient(manifestUrl, perf.loads)
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
  const rainTimelineIndex = createMemo(() => new Map(timeline().map((frame, index) => [`${new URL(frame.chunk.url, manifestUrl).href}#${frame.frameIndex}`, index])))
  // Ieder gedecodeerd regenframe (kaart, prefetch, L0–L2) vult direct zijn balk.
  client.onFrameDecoded = (url, frameIndex, frame) => {
    const state = pointLoad
    const index = rainTimelineIndex().get(`${url}#${frameIndex}`)
    if (!state || state.request !== pointRequest || index === undefined || state.rainLoaded.has(index)) return
    const header = client.getCachedHeader(timeline()[index]!.chunk)
    if (!header) return
    state.rainValues[index] = samplePoint(header, frame, state.point)
    state.rainLoaded.add(index)
    state.rainPublisher?.schedule()
  }
  const [cursor, setCursor] = createSignal(0)
  const [playing, setPlaying] = createSignal(true)
  const [timeHorizonHours, setTimeHorizonHours] = createSignal<number | null>(8)
  const initialSavedPlaces = loadSavedPlaces()
  const initialMapView = loadMapView()
  const startLocation = resolveStartLocation(initialSavedPlaces, loadLastSavedPlaceId(), initialMapView, defaultLocation)
  const [location, setLocation] = createSignal({ lng: startLocation.lng, lat: startLocation.lat })
  const [locationLabel, setLocationLabel] = createSignal(startLocation.label)
  const [savedPlaces, setSavedPlaces] = createSignal<SavedPlace[]>(initialSavedPlaces)
  const [rainSeries, setRainSeries] = createSignal<Array<number | null>>([])
  const [rainLoaded, setRainLoaded] = createSignal<boolean[]>([])
  const [pointSeriesLoading, setPointSeriesLoading] = createSignal(true)
  const [pointLoadStage, setPointLoadStage] = createSignal<PointLoadStage>('initial')
  const [progressiveHistogram, setProgressiveHistogram] = createSignal(new URLSearchParams(window.location.search).get('histogram') !== 'wait')
  const [uvSeries, setUvSeries] = createSignal<Array<number | null>>([])
  const [temperatureSeries, setTemperatureSeries] = createSignal<Array<number | null>>([])
  const [feelsLikeSeries, setFeelsLikeSeries] = createSignal<Array<number | null>>([])
  const [humiditySeries, setHumiditySeries] = createSignal<Array<number | null>>([])
  const [cloudSeries, setCloudSeries] = createSignal<Array<number | null>>([])
  const [windUSeries, setWindUSeries] = createSignal<Array<number | null>>([])
  const [windVSeries, setWindVSeries] = createSignal<Array<number | null>>([])
  const [radiationSeries, setRadiationSeries] = createSignal<Array<number | null>>([])
  // History rows cost bytes the old table never loaded; they stay folded until asked for.
  const [historyRowsWanted, setHistoryRowsWanted] = createSignal(false)
  const [historyOpen, setHistoryOpen] = createSignal(false)
  const [status, setStatus] = createSignal('Regen laden…')
  const [theme, setTheme] = createSignal<ThemeChoice>(storedTheme())
  const [windTuning, setWindTuning] = createSignal<WindTuning>(loadWindTuning())
  const [cloudEdgesEnabled, setCloudEdgesEnabled] = createSignal(false)
  const [mapReady, setMapReady] = createSignal(false)
  const [splashSlowdown, setSplashSlowdown] = createSignal(storedSplashSlowdown())
  const [temperatureSpacing, setTemperatureSpacing] = createSignal<number>()
  const [minimumMapWidthKm, setMinimumMapWidthKm] = createSignal(20)
  const [devMaximumZoom, setDevMaximumZoom] = createSignal(0)
  const [perfVisible, setPerfVisible] = createSignal(new URLSearchParams(window.location.search).get('perf') === '1')
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
      const data = await fetchManifest()
      perf.setManifestGenerated(data.generated)
      const frames = buildTimeline(data)
      if (!frames.length) throw new Error('De tijdlijn is leeg')
      setManifest(data)
      void Promise.all(data.chunks.map((chunk) => client.getHeader(chunk))).catch(() => undefined)
      stopManifestRefresh = scheduleManifestRefresh(refreshManifest, {
        setInterval: (callback, interval) => window.setInterval(callback, interval),
        clearInterval: (handle) => window.clearInterval(handle),
        visibilityState: () => document.visibilityState,
        addVisibilityListener: (callback) => document.addEventListener('visibilitychange', callback),
        removeVisibilityListener: (callback) => document.removeEventListener('visibilitychange', callback),
      })
      let nowIndex = 0
      for (let index = 0; index < frames.length; index++) if (frames[index]!.epoch <= Date.parse(data.now)) nowIndex = index
      setCursor(nowIndex)
      const header = await client.getHeader(frames[0]!.chunk)
      const initialTheme = mapTheme()
      const style = await loadBasemapStyle(initialTheme)
      appliedMapTheme = initialTheme
      const initialView = constrainView(initialMapView ?? containView(MAP_CONTAIN_BOUNDS, mapViewport()), MAP_CONTAIN_BOUNDS, mapViewport())
      map = new maplibregl.Map({
        container: mapElement,
        style,
        center: [initialView.lng, initialView.lat],
        zoom: initialView.zoom,
        transformConstrain: constrainMapView,
        renderWorldCopies: false,
        attributionControl: false,
      })
      applyMapDetailLimit(minimumMapWidthKm())
      applyMapContainLimit()
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right')
      map.on('resize', applyMapContainLimit)
      syncSavedMarkers(savedPlaces())
      map.on('style.load', () => attachMapLayers(header.grid))
      map.on('moveend', rememberMapView)
      map.on('zoomend', () => void showTemperature())
      map.on('click', (event) => pick(event.lngLat.lng, event.lngLat.lat, nearestPlace(event.lngLat.lng, event.lngLat.lat).name))
      if (mapTheme() !== appliedMapTheme) void applyMapTheme(mapTheme())
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  })

  onCleanup(() => {
    window.clearTimeout(splashReplayTimer)
    window.clearTimeout(mapViewTimer)
    stopManifestRefresh?.()
    cancelPointLoad(pointLoad)
    for (const savedMarker of savedMarkers) savedMarker.remove()
    map?.remove()
  })

  async function fetchManifest(cache: RequestCache = 'default'): Promise<Manifest> {
    const response = await fetch(manifestUrl, { cache })
    if (!response.ok) throw new Error(`Manifest laden mislukt (${response.status})`)
    return response.json() as Promise<Manifest>
  }

  async function refreshManifest(): Promise<void> {
    const current = manifest()
    if (!current) return
    try {
      const candidate = await fetchManifest('no-cache')
      if (!isNewerManifest(current, candidate)) return
      applyManifestRefresh(candidate)
    } catch {
      // De atomair gepubliceerde vorige generatie blijft volledig bruikbaar.
    }
  }

  function applyManifestRefresh(nextManifest: Manifest): void {
    const previousRain = timeline()
    const nextRain = buildTimeline(nextManifest)
    if (!nextRain.length) return
    const nextUv = buildTimeline(nextManifest, 'uv')
    const nextTemperature = buildTimeline(nextManifest, 'temp_c')
    const nextFeelsLike = buildTimeline(nextManifest, 'feels_like_c')
    const nextHumidity = buildTimeline(nextManifest, 'rel_humidity')
    const nextCloud = buildTimeline(nextManifest, 'cloud_frac')
    const nextWind = buildWindTimeline(nextManifest)
    const nextWindU = nextWind.map((frame) => frame.u)
    const nextWindV = nextWind.map((frame) => frame.v)
    const previousState = pointLoad
    const previousStage = pointLoadStage()
    const previousRainValues = previousState?.rainValues ?? rainSeries()
    const previousRainLoaded = previousRain.map((_, index) => previousState?.rainLoaded.has(index) ?? rainLoaded()[index] ?? false)
    const rain = reconcileTimelineSeries(previousRain, nextRain, previousRainValues, previousRainLoaded)
    const uv = reconcileTimelineSeries(uvTimeline(), nextUv, uvSeries())
    const temperature = reconcileTimelineSeries(tempTimeline(), nextTemperature, temperatureSeries())
    const feelsLike = reconcileTimelineSeries(feelsLikeTimeline(), nextFeelsLike, feelsLikeSeries())
    const humidity = reconcileTimelineSeries(humidityTimeline(), nextHumidity, humiditySeries())
    const cloud = reconcileTimelineSeries(cloudTimeline(), nextCloud, cloudSeries())
    const windU = reconcileTimelineSeries(windUFrames(), nextWindU, windUSeries())
    const windV = reconcileTimelineSeries(windVFrames(), nextWindV, windVSeries())
    const nextCursor = cursorAfterTimelineRefresh(previousRain, nextRain, cursor())

    cancelPointLoad(previousState)
    const state = previousState ? newPointLoadState(previousState.point, rain.values, rain.loaded) : undefined
    pointLoad = state
    batch(() => {
      setManifest(nextManifest)
      setCursor(nextCursor)
      setRainSeries([...rain.values])
      setRainLoaded(rain.loaded)
      setUvSeries(uv.values)
      setTemperatureSeries(temperature.values)
      setFeelsLikeSeries(feelsLike.values)
      setHumiditySeries(humidity.values)
      setCloudSeries(cloud.values)
      setWindUSeries(windU.values)
      setWindVSeries(windV.values)
    })
    perf.setManifestGenerated(nextManifest.generated)
    void Promise.all(nextManifest.chunks.map((chunk) => client.getHeader(chunk))).catch(() => undefined)
    if (state) resumePointLoadAfterRefresh(state, previousStage)
  }

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

  createEffect(() => perf.loads.mark({ kind: 'stage', stage: pointLoadStage() }))
  createEffect(() => {
    const frames = timeline()
    if (!frames.length) return
    const now = manifest() ? Date.parse(manifest()!.now) : frames[0]!.epoch
    perf.loads.mark({
      kind: 'timeline',
      now,
      horizonEnd: timelineHorizonEnd(frames, now, timeHorizonHours()),
      frames: frames.map((frame) => ({ url: new URL(frame.chunk.url, manifestUrl).href, frameIndex: frame.frameIndex, epoch: frame.epoch, source: frame.source })),
    })
  })

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
    const ready = mapReady()
    dayNightLayer?.setEpoch(epoch)
    if (ready && layer) void showFrame()
    if (!ready) return
    if (windLayer) void showWind()
    if (cloudEdgeLayer) void showCloudEdges()
    if (map) void showTemperature()
    const nextSunBucket = Math.floor(epoch / 300_000)
    if (map && SUN_ICONS_ENABLED && nextSunBucket !== sunEpochBucket) {
      sunEpochBucket = nextSunBucket
      void showSun(epoch)
    }
  })
  createEffect(() => {
    const loadStage = pointLoadStage()
    if (!playing() || !mapReady() || (initialPickStarted && (loadStage === 'initial' || loadStage === 'direct'))) return
    const horizonHours = timeHorizonHours()
    const frames = timeline()
    if (frames.length < 2) return
    const nowEpoch = manifest() ? Date.parse(manifest()!.now) : frames[0]!.epoch
    const lastEpoch = timelineHorizonEnd(frames, nowEpoch, horizonHours)
    const playbackRate = timelinePlaybackRate(frames, nowEpoch, horizonHours)
    let previous = performance.now()
    const stop = startFrameLoop((now) => {
      const elapsed = now - previous
      previous = now
      setCursor((value) => {
        const epoch = timelineEpochAtCursor(frames, value)
        const nextEpoch = epoch + elapsed * playbackRate
        if (!Number.isFinite(nextEpoch) || nextEpoch >= lastEpoch) return 0
        return timelineCursorAtEpoch(frames, nextEpoch)
      })
    }, requestAnimationFrame, cancelAnimationFrame)
    onCleanup(stop)
  })

  function chooseTimeHorizon(hours: number | null): void {
    setTimeHorizonHours(hours)
    const frames = timeline()
    if (!frames.length) return
    const end = timelineHorizonEnd(frames, manifest() ? Date.parse(manifest()!.now) : frames[0]!.epoch, hours)
    setCursor((value) => timelineEpochAtCursor(frames, value) > end ? timelineCursorAtEpoch(frames, end) : value)
  }

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
    cloudEdgeLayer = undefined
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
    if (cloudEdgesEnabled()) void attachCloudEdgeLayer()
    if (SUN_ICONS_ENABLED && (radiationTimeline().length || uvTimeline().length)) attachSunLayer()
    if (hasTemperature()) attachTemperatureLayer()
    attachMapFrame(grid)
    void showFrame()
    if (mapReady()) {
      void showWind()
      void showTemperature()
      sunEpochBucket = Math.floor(selectedEpoch() / 300_000)
      void showSun(selectedEpoch())
    }
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
    const nearbyFrames = frames.slice(Math.max(0, lower - 2), upper + 4)
    const batchPrefetch = scrubPrefetch
    scrubPrefetch = false
    if (batchPrefetch) {
      const nearby = new Map<ManifestChunk, number[]>()
      for (const near of nearbyFrames) nearby.set(near.chunk, [...(nearby.get(near.chunk) ?? []), near.frameIndex])
      for (const [chunk, indexes] of nearby) client.prefetch(chunk, indexes)
      for (const near of nearbyFrames) client.prefetchMotion(near.chunk, [near.frameIndex])
    }
    const [left, right, motion] = await Promise.all([
      load(leftFrame),
      load(rightFrame),
      loadPairMotion(leftFrame, rightFrame).catch(() => undefined),
    ])
    if (request !== shownFrameRequest || !layer || !map) return
    layer.setFrames(left, right, blend.mix, motion, (rightFrame.epoch - leftFrame.epoch) / 60_000)
    if (!mapReady() && !rainReadyPending) {
      const renderedMap = map
      rainReadyPending = true
      renderedMap.once('render', () => {
        rainReadyPending = false
        if (map !== renderedMap) return
        setMapReady(true)
        void attachWindLayer()
        if (!initialPickStarted) {
          initialPickStarted = true
          pick(startLocation.lng, startLocation.lat, startLocation.label)
        }
      })
    }
    map.once('render', () => perf.markRainFrameCommitted())
    map.triggerRepaint()
    // De eerste locatiereeks haalt dezelfde chunks direct in bulk op. Losse,
    // overlappende Range-prefetches maken Chromiums sparse HTTP-cache instabiel.
    if (initialPickStarted && pointLoadStage() !== 'initial' && pointLoadStage() !== 'direct' && playing() && !batchPrefetch) {
      const nearby = new Map<ManifestChunk, number[]>()
      for (const near of nearbyFrames) nearby.set(near.chunk, [...(nearby.get(near.chunk) ?? []), near.frameIndex])
      for (const [chunk, indexes] of nearby) client.prefetch(chunk, indexes)
      for (const near of nearbyFrames) client.prefetchMotion(near.chunk, [near.frameIndex])
    }
  }

  async function loadPairMotion(left: TimelineFrame, right: TimelineFrame): Promise<MotionField | undefined> {
    if (left.epoch >= right.epoch) return undefined
    const [leftHeader, rightHeader] = await Promise.all([client.getHeader(left.chunk), client.getHeader(right.chunk)])
    const selected = selectPairMotion(left, right, (frame) => {
      const header = frame.chunk.url === left.chunk.url ? leftHeader : rightHeader
      return header.frames[frame.frameIndex]?.motion !== undefined
    })
    return selected ? client.getMotion(selected.frame.chunk, selected.frame.frameIndex) : undefined
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

  async function attachWindLayer(): Promise<void> {
    await discoverWindGrid()
    if (!map || !windGrid || !windTimeline().length || map.getLayer('motregen-wind')) return
    windLayer = new WindLayer(windGrid, mapTheme(), windTuning())
    map.addLayer(windLayer, map.getLayer('motregen-rain') ? 'motregen-rain' : undefined)
    await showWind()
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
    const beforeId = temperatureLayerBeforeId(map.getStyle().layers)
    map.addLayer(temperatureLayer(mapTheme()), beforeId)
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
        'text-allow-overlap': true,
        'text-ignore-placement': true,
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
    const frames = feelsLikeTimeline()
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
      const labels = temperatureLabels(left, right, leftHeader, rightHeader, blend.mix, selectTemperaturePlaces(map.getZoom(), temperatureSpacing() ?? temperatureLabelSpacingPx(map.getContainer().clientWidth, map.getContainer().clientHeight)))
      const key = labels.features.map((feature) => `${feature.properties.name}:${feature.properties.label}`).join('|')
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

  async function attachCloudEdgeLayer(): Promise<void> {
    const renderedMap = map
    const first = cloudTimeline()[0]
    if (!renderedMap || !first || !cloudEdgesEnabled() || renderedMap.getLayer('motregen-cloud-edges')) return
    try {
      const header = await client.getHeader(first.chunk)
      if (map !== renderedMap || !cloudEdgesEnabled() || renderedMap.getLayer('motregen-cloud-edges')) return
      const cloudLayer = new CloudEdgeLayer(header.grid)
      const before = renderedMap.getLayer('motregen-sun') ? 'motregen-sun'
        : renderedMap.getLayer('motregen-temperature') ? 'motregen-temperature'
          : undefined
      renderedMap.addLayer(cloudLayer, before)
      cloudEdgeLayer = cloudLayer
      await showCloudEdges()
    } catch {
      cloudEdgeLayer = undefined
    }
  }

  async function showCloudEdges(): Promise<void> {
    if (!cloudEdgeLayer || !map) return
    const request = ++shownCloudEdgeRequest
    try {
      const blend = await loadFieldBlend(cloudTimeline(), selectedEpoch(), 75 * 60_000)
      if (request !== shownCloudEdgeRequest || !blend || !cloudEdgeLayer || !map) return
      if (!sameGrid(blend.leftHeader, blend.rightHeader)) return
      cloudEdgeLayer.setFrames(blend.left, blend.right, blend.leftHeader, blend.rightHeader, blend.mix)
      map.triggerRepaint()
    } catch {
      if (request === shownCloudEdgeRequest) toggleCloudEdges(false)
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
    return timelineEpochAtCursor(frames, cursor())
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
    cancelPointLoad(pointLoad)
    const cachedRain = readCachedPointSeries(client, timeline(), point)
    const cachedForecast = [
      readCachedPointSeries(client, uvTimeline(), point),
      readCachedPointSeries(client, tempTimeline(), point),
      readCachedPointSeries(client, feelsLikeTimeline(), point),
      readCachedPointSeries(client, humidityTimeline(), point),
      readCachedPointSeries(client, cloudTimeline(), point),
      readCachedPointSeries(client, windUFrames(), point),
      readCachedPointSeries(client, windVFrames(), point),
    ]
    const state = newPointLoadState(point, cachedRain.values, cachedRain.loaded)
    const request = state.request
    pointLoad = state
    if (cachedRain.complete && cachedForecast.every((series) => series.complete)) {
      state.full = Promise.resolve()
      setRainSeries([...state.rainValues])
      setRainLoaded(cachedRain.loaded)
      setUvSeries(cachedForecast[0]!.values)
      setTemperatureSeries(cachedForecast[1]!.values)
      setFeelsLikeSeries(cachedForecast[2]!.values)
      setHumiditySeries(cachedForecast[3]!.values)
      setCloudSeries(cachedForecast[4]!.values)
      setWindUSeries(cachedForecast[5]!.values)
      setWindVSeries(cachedForecast[6]!.values)
      setStatus(label)
      setPointSeriesLoading(false)
      setPointLoadStage('complete')
      return
    }
    setStatus(`${label} · verwachting laden…`)
    setPointSeriesLoading(true)
    setPointLoadStage('initial')
    setRainSeries([...state.rainValues])
    setRainLoaded(cachedRain.loaded)
    setUvSeries([])
    setTemperatureSeries([])
    setFeelsLikeSeries([])
    setHumiditySeries([])
    setCloudSeries([])
    setWindUSeries([])
    setWindVSeries([])
    state.direct = (async () => {
      const [uv, temperature, feelsLike, humidity, cloud, windU, windV] = await Promise.all([
        readForecastPointSeries(uvTimeline(), point, 'uvIndex', 'L0'),
        readForecastPointSeries(tempTimeline(), point, 'temperatureIndex', 'L0'),
        readForecastPointSeries(feelsLikeTimeline(), point, 'feelsLikeIndex', 'L0'),
        readForecastPointSeries(humidityTimeline(), point, 'humidityIndex', 'L0'),
        readForecastPointSeries(cloudTimeline(), point, 'cloudIndex', 'L0'),
        readForecastPointSeries(windUFrames(), point, 'windUIndex', 'L0'),
        readForecastPointSeries(windVFrames(), point, 'windVIndex', 'L0'),
        enqueueRain(state, directRainIndexes(timeline(), manifest() ? Date.parse(manifest()!.now) : 0), 'high', 'L0', 'locatie'),
      ])
      if (request !== pointRequest) return
      setUvSeries(uv)
      setTemperatureSeries(temperature)
      setFeelsLikeSeries(feelsLike)
      setHumiditySeries(humidity)
      setCloudSeries(cloud)
      setWindUSeries(windU)
      setWindVSeries(windV)
      setStatus(label)
      setPointSeriesLoading(false)
      setPointLoadStage('direct')
    })()
    scheduleRainWindow(state)
    try {
      await state.direct
    } catch {
      if (request === pointRequest) {
        setStatus(`${label} · verwachting kon niet worden geladen`)
        setPointSeriesLoading(false)
      }
    }
  }

  function newPointLoadState(
    point: { lng: number; lat: number },
    rainValues: Array<number | null>,
    rainLoaded: boolean[],
  ): PointLoadState {
    const state: PointLoadState = {
      request: ++pointRequest,
      point,
      rainValues,
      rainLoaded: new Set(rainLoaded.flatMap((loaded, index) => loaded ? [index] : [])),
      rainQueue: Promise.resolve(),
      direct: Promise.resolve(),
    }
    state.rainPublisher = new FrameBatcher(() => publishRain(state))
    return state
  }

  function resumePointLoadAfterRefresh(state: PointLoadState, previousStage: PointLoadStage): void {
    state.direct = (async () => {
      const [uv, temperature, feelsLike, humidity, cloud, windU, windV] = await Promise.all([
        readForecastPointSeries(uvTimeline(), state.point, 'uvIndex', 'refresh'),
        readForecastPointSeries(tempTimeline(), state.point, 'temperatureIndex', 'refresh'),
        readForecastPointSeries(feelsLikeTimeline(), state.point, 'feelsLikeIndex', 'refresh'),
        readForecastPointSeries(humidityTimeline(), state.point, 'humidityIndex', 'refresh'),
        readForecastPointSeries(cloudTimeline(), state.point, 'cloudIndex', 'refresh'),
        readForecastPointSeries(windUFrames(), state.point, 'windUIndex', 'refresh'),
        readForecastPointSeries(windVFrames(), state.point, 'windVIndex', 'refresh'),
        enqueueRain(state, directRainIndexes(timeline(), manifest() ? Date.parse(manifest()!.now) : 0), 'low', 'refresh', 'manifest'),
      ])
      if (state.request !== pointRequest) return
      if (previousStage !== 'complete') {
        setUvSeries(uv)
        setTemperatureSeries(temperature)
        setFeelsLikeSeries(feelsLike)
        setHumiditySeries(humidity)
        setCloudSeries(cloud)
        setWindUSeries(windU)
        setWindVSeries(windV)
      }
    })()
    if (previousStage === 'complete') {
      void completePointSeries(state, 'low', 'refresh')
      return
    }
    if (previousStage === 'window') {
      void state.direct.then(async () => {
        await enqueueRain(state, visibleRainIndexes(), 'low', 'refresh', 'manifest')
        if (state.request !== pointRequest || state.full) return
        scheduleDeepIdle(state)
      }).catch(() => undefined)
      return
    }
    scheduleRainWindow(state)
  }

  async function loadHistoryRows(): Promise<void> {
    if (historyRowsWanted()) return
    setHistoryRowsWanted(true)
    const state = pointLoad
    if (!state) return
    await state.direct.catch(() => undefined)
    if (state.request !== pointRequest) return
    const [uv, temperature, feelsLike, humidity, cloud, windU, windV] = await Promise.all([
      readForecastPointSeries(uvTimeline(), state.point, 'uvIndex', 'L2'),
      readForecastPointSeries(tempTimeline(), state.point, 'temperatureIndex', 'L2'),
      readForecastPointSeries(feelsLikeTimeline(), state.point, 'feelsLikeIndex', 'L2'),
      readForecastPointSeries(humidityTimeline(), state.point, 'humidityIndex', 'L2'),
      readForecastPointSeries(cloudTimeline(), state.point, 'cloudIndex', 'L2'),
      readForecastPointSeries(windUFrames(), state.point, 'windUIndex', 'L2'),
      readForecastPointSeries(windVFrames(), state.point, 'windVIndex', 'L2'),
    ])
    if (state.request !== pointRequest) return
    const merge = (next: Array<number | null>) => (previous: Array<number | null>) =>
      Array.from({ length: Math.max(previous.length, next.length) }, (_, index) => next[index] ?? previous[index] ?? null)
    batch(() => {
      setUvSeries(merge(uv))
      setTemperatureSeries(merge(temperature))
      setFeelsLikeSeries(merge(feelsLike))
      setHumiditySeries(merge(humidity))
      setCloudSeries(merge(cloud))
      setWindUSeries(merge(windU))
      setWindVSeries(merge(windV))
    })
  }

  function readForecastPointSeries(frames: TimelineFrame[], point: { lng: number; lat: number }, key: ForecastIndex, layer: LoadLayer): Promise<Array<number | null>> {
    const now = manifestNow()
    const history = historyRowsWanted()
    const indexes = forecast().flatMap((row) => row[key] == null || !isPassiveRow(row, now) || (row.kind === 'past' && !history) ? [] : [row[key]])
    return frames.length ? readPointSeries(frames, point, indexes, 'high', undefined, undefined, layer).catch(() => []) : Promise.resolve([])
  }

  async function readPointSeries(
    frames: TimelineFrame[],
    point: { lng: number; lat: number },
    indexes = frames.map((_, index) => index),
    priority: FetchPriority = 'high',
    values = new Array<number | null>(frames.length).fill(null),
    progress?: (values: Array<number | null>, loaded: number[]) => void,
    layer: LoadLayer = 'map',
  ): Promise<Array<number | null>> {
    const [x, y] = project(point.lng, point.lat)
    const chunks = new Map<ManifestChunk, Array<{ position: number; frameIndex: number }>>()
    for (const position of [...new Set(indexes)]) {
      const frame = frames[position]!
      if (!frame) continue
      const entries = chunks.get(frame.chunk) ?? []
      entries.push({ position, frameIndex: frame.frameIndex })
      chunks.set(frame.chunk, entries)
    }
    await Promise.all([...chunks].map(async ([chunk, entries]) => {
      const header = await client.getHeader(chunk)
      const column = Math.floor((x - header.grid.x0) / header.grid.dx)
      const row = Math.floor((y - header.grid.y0) / header.grid.dy)
      const inside = column >= 0 && row >= 0 && column < header.grid.width && row < header.grid.height
      const positions = new Map<number, number[]>()
      for (const entry of entries) positions.set(entry.frameIndex, [...(positions.get(entry.frameIndex) ?? []), entry.position])
      await client.getFrames(chunk, entries.map((entry) => entry.frameIndex), priority, (frameIndex, decoded) => {
        const loaded = positions.get(frameIndex) ?? []
        if (inside) for (const position of loaded) values[position] = header.quant[decoded[row * header.grid.width + column]!] ?? null
        progress?.(values, loaded)
      }, layer)
    }))
    return values
  }

  function enqueueRain(state: PointLoadState, indexes: number[], priority: FetchPriority, layer: LoadLayer, reason: string): Promise<void> {
    perf.loads.mark({ kind: 'schedule', layer, field: 'rain_rate', indexes, reason })
    const task = state.rainQueue.then(async () => {
      const missing = indexes.filter((index) => !state.rainLoaded.has(index))
      if (!missing.length || state.request !== pointRequest) return
      perf.loads.mark({ kind: 'start', layer, field: 'rain_rate', indexes: missing })
      await readPointSeries(timeline(), state.point, missing, priority, state.rainValues, (_, loaded) => {
        for (const index of loaded) state.rainLoaded.add(index)
        if (state.request === pointRequest) state.rainPublisher?.schedule()
      }, layer)
      if (state.request === pointRequest) state.rainPublisher?.flush()
    })
    state.rainQueue = task.catch(() => undefined)
    return task
  }

  // L1 = het hele zichtbare histogrambereik, direct na de locatiekeuze en
  // dichtst-bij-nu eerst; alleen wat buiten de horizon valt wacht op L2.
  function scheduleRainWindow(state: PointLoadState): void {
    void (async () => {
      await enqueueRain(state, visibleRainIndexes(), 'low', 'L1', 'zichtbaar bereik')
      await state.direct
      if (state.request !== pointRequest || state.full) return
      setPointLoadStage('window')
      scheduleDeepIdle(state)
    })().catch(() => {
      if (state.request === pointRequest) setStatus(`${locationLabel()} · regenvenster kon niet worden geladen`)
    })
  }

  function scheduleDeepIdle(state: PointLoadState): void {
    state.deepIdle = window.setTimeout(() => {
      state.idle = scheduleIdle(() => { void completePointSeries(state, 'low', 'L2', 'diepe idle') }, 5_000)
    }, 30_000)
  }

  function visibleRainIndexes(): number[] {
    const frames = timeline()
    if (!frames.length) return []
    const now = manifest() ? Date.parse(manifest()!.now) : frames[0]!.epoch
    const end = timelineHorizonEnd(frames, now, timeHorizonHours())
    return frames
      .flatMap((frame, index) => index === 0 || (frames[index - 1]!.epoch + frame.epoch) / 2 < end ? [index] : [])
      .sort((left, right) => Math.abs(frames[left]!.epoch - now) - Math.abs(frames[right]!.epoch - now))
  }

  function completePointSeries(state = pointLoad, priority: FetchPriority = 'high', layer: LoadLayer = 'L2', reason = 'intentie'): Promise<void> | undefined {
    if (!state || state.request !== pointRequest) return undefined
    if (state.full) return state.full
    window.clearTimeout(state.deepIdle)
    state.full = (async () => {
      await state.direct
      const [uv, temperature, feelsLike, humidity, cloud, windU, windV] = await Promise.all([
        readPointSeries(uvTimeline(), state.point, undefined, priority, undefined, undefined, layer),
        readPointSeries(tempTimeline(), state.point, undefined, priority, undefined, undefined, layer),
        readPointSeries(feelsLikeTimeline(), state.point, undefined, priority, undefined, undefined, layer),
        readPointSeries(humidityTimeline(), state.point, undefined, priority, undefined, undefined, layer),
        readPointSeries(cloudTimeline(), state.point, undefined, priority, undefined, undefined, layer),
        readPointSeries(windUFrames(), state.point, undefined, priority, undefined, undefined, layer),
        readPointSeries(windVFrames(), state.point, undefined, priority, undefined, undefined, layer),
        enqueueRain(state, timeline().map((_, index) => index), priority, layer, reason),
      ])
      if (state.request !== pointRequest) return
      setUvSeries(uv)
      setTemperatureSeries(temperature)
      setFeelsLikeSeries(feelsLike)
      setHumiditySeries(humidity)
      setCloudSeries(cloud)
      setWindUSeries(windU)
      setWindVSeries(windV)
      setPointLoadStage('complete')
    })().catch(() => {
      if (state.request === pointRequest) setStatus(`${locationLabel()} · volledige reeks kon niet worden geladen`)
    })
    return state.full
  }

  function cancelPointLoad(state: PointLoadState | undefined): void {
    if (!state) return
    if (state.idle !== undefined) cancelIdle(state.idle)
    window.clearTimeout(state.deepIdle)
    state.rainPublisher?.cancel()
  }

  function publishRain(state: PointLoadState): void {
    if (state.request !== pointRequest) return
    setRainSeries([...state.rainValues])
    setRainLoaded(state.rainValues.map((_, index) => state.rainLoaded.has(index)))
    perf.loads.mark({ kind: 'rain', loaded: [...state.rainLoaded], total: state.rainValues.length })
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

  function chooseSaved(place: SavedPlace): void {
    storeLastSavedPlaceId(place.id)
    pick(place.lng, place.lat, place.name)
  }

  function rememberMapView(): void {
    window.clearTimeout(mapViewTimer)
    mapViewTimer = window.setTimeout(() => {
      if (!map) return
      const center = map.getCenter()
      storeMapView({ lng: center.lng, lat: center.lat, zoom: map.getZoom() })
    }, 500)
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
        chooseSaved(place)
      })
      savedMarkers.push(new Marker({ element, anchor: 'center' }).setLngLat([place.lng, place.lat]).addTo(map))
    }
  }

  function cycleTheme(): void {
    setTheme((current) => themes[(themes.indexOf(current) + 1) % themes.length]!)
  }

  function tuneWind(tuning: WindTuning): void {
    setWindTuning(tuning)
    storeWindTuning(tuning)
  }

  function tuneMapDetail(minimumWidthKm: number): void {
    setMinimumMapWidthKm(minimumWidthKm)
    applyMapDetailLimit(minimumWidthKm)
  }

  function toggleCloudEdges(enabled: boolean): void {
    setCloudEdgesEnabled(enabled)
    if (!enabled) {
      if (map?.getLayer('motregen-cloud-edges')) map.removeLayer('motregen-cloud-edges')
      cloudEdgeLayer = undefined
      return
    }
    void attachCloudEdgeLayer()
  }

  function mapViewport(): { width: number; height: number } {
    return { width: mapElement.clientWidth, height: mapElement.clientHeight }
  }

  // Vervangt maxBounds (dat altijd cover afdwingt): per as contain of cover, zie map-constraint.
  function constrainMapView(center: maplibregl.LngLat, zoom: number): { center: maplibregl.LngLat; zoom: number } {
    const view = constrainView({ lng: center.lng, lat: center.lat, zoom }, MAP_CONTAIN_BOUNDS, mapViewport(), map?.getMaxZoom())
    return { center: new maplibregl.LngLat(view.lng, view.lat), zoom: view.zoom }
  }

  function applyMapContainLimit(): void {
    if (!map) return
    const minimumZoom = containZoom(MAP_CONTAIN_BOUNDS, mapViewport())
    if (Number.isFinite(minimumZoom)) map.setMinZoom(Math.min(Math.max(minimumZoom, -2), map.getMaxZoom()))
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

  function scrub(cursor: number): void {
    perf.markScrubInput()
    scrubPrefetch = true
    void completePointSeries(pointLoad, 'high')
    setCursor(cursor)
  }

  function tapLogo(): void {
    const now = performance.now()
    logoTapCount = now - lastLogoTap <= 700 ? logoTapCount + 1 : 1
    lastLogoTap = now
    if (logoTapCount === 3) {
      logoTapCount = 0
      setPerfVisible((visible) => !visible)
    }
  }

  const manifestNow = () => manifest() ? Date.parse(manifest()!.now) : 0
  const forecast = createMemo(() => buildHourlyForecast({
    rain: timeline(),
    uv: uvTimeline(),
    radiation: radiationTimeline(),
    temperature: tempTimeline(),
    feelsLike: feelsLikeTimeline(),
    humidity: humidityTimeline(),
    cloud: cloudTimeline(),
    windU: windUFrames(),
    windV: windVFrames(),
  }, manifest() ? Date.parse(manifest()!.now) : 0))
  // PO-smaaktest: ?zon=markering zet zon op/onder in de uurcel i.p.v. als tussenrij.
  const sunForm: SunForm = new URLSearchParams(window.location.search).get('zon') === 'markering' ? 'marker' : 'row'
  let radiationRequest = 0
  createEffect(() => {
    const point = location()
    const frames = radiationTimeline()
    const all = pointLoadStage() === 'complete'
    const now = manifestNow()
    const indexes = forecast().flatMap((row) => {
      if (row.kind === 'past' || (!all && !isPassiveRow(row, now))) return []
      if (solarElevationSin(row.epoch, point.lng, point.lat) <= 0) return []
      return [row.radiationIndex, row.radiationNextIndex].filter((index): index is number => index != null)
    })
    const request = ++radiationRequest
    if (!indexes.length) return
    void readPointSeries(frames, point, indexes, 'low', undefined, undefined, 'L0').then((values) => {
      if (request === radiationRequest) setRadiationSeries(values)
    }).catch(() => undefined)
  })
  const cursorUv = createMemo(() => seriesValueAt(uvTimeline(), uvSeries(), selectedEpoch(), 30 * 60_000))
  const cursorUvChip = createMemo(() => uvChipLabel(cursorUv()))
  const hasTemperature = createMemo(() => feelsLikeTimeline().length > 0)
  const hasWeatherIcons = createMemo(() => cloudTimeline().length > 0)
  const hasHumidity = createMemo(() => humidityTimeline().length > 0)
  const hasWind = createMemo(() => windUFrames().length > 0 && windVFrames().length > 0)
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
      <button type="button" class="map-brand brand" onClick={tapLogo} aria-label="motregen.nl"><img src="/droplet.svg" alt="" /><strong>motregen.nl</strong></button>
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
        onSelectSaved={chooseSaved}
      />
      <Show when={devMode && windTimeline().length}>
        <details class="wind-debug" open>
          <summary>Wind debug</summary>
          <label class="debug-toggle"><span>Wolkrand</span><input type="checkbox" checked={cloudEdgesEnabled()} onChange={(event) => toggleCloudEdges(event.currentTarget.checked)} /><output>{cloudEdgesEnabled() ? 'Aan' : 'Uit'}</output></label>
          <label class="debug-toggle"><span>Grafiek vult</span><input type="checkbox" checked={progressiveHistogram()} onChange={(event) => setProgressiveHistogram(event.currentTarget.checked)} /><output>{progressiveHistogram() ? 'Skeleton' : 'Wachten'}</output></label>
          <label><span>Min. breedte</span><input type="range" min="5" max="100" step="5" value={minimumMapWidthKm()} onInput={(event) => tuneMapDetail(event.currentTarget.valueAsNumber)} /><output>{minimumMapWidthKm()} km</output></label>
          <p class="wind-debug-note">Maximale kaartzoom: {devMaximumZoom().toFixed(1)}</p>
          <label><span>Temp-afstand</span><input type="range" min="40" max="200" step="4" value={temperatureSpacing() ?? (map ? temperatureLabelSpacingPx(map.getContainer().clientWidth, map.getContainer().clientHeight) : 96)} onInput={(event) => { setTemperatureSpacing(event.currentTarget.valueAsNumber); void showTemperature() }} /><output>{temperatureSpacing() === undefined ? 'auto' : `${temperatureSpacing()} px`}</output></label>
          <label><span>Splash ×</span><input type="range" min="1" max="8" step="0.5" value={splashSlowdown()} onInput={(event) => setSplashSlowdown(event.currentTarget.valueAsNumber)} /><output>{splashSlowdown().toLocaleString('nl-NL', { maximumFractionDigits: 1 })}×</output></label>
          <button class="wind-debug-replay" onClick={replaySplash}>Herhaal splash</button>
        </details>
      </Show>
      <MapClock mapEpoch={selectedEpoch()} now={manifestNow()} />
      <About />
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
        loaded={rainLoaded()}
        cursor={cursor()}
        now={manifest() ? Date.parse(manifest()!.now) : 0}
        playing={playing()}
        horizonHours={timeHorizonHours()}
        loading={pointSeriesLoading() || (!progressiveHistogram() && pointLoadStage() !== 'complete')}
        loadStage={pointLoadStage()}
        locationLabel={status()}
        onCursor={scrub}
        onHorizonHours={chooseTimeHorizon}
        onIntent={() => { void completePointSeries(pointLoad, 'high') }}
        onPlaying={setPlaying}
      />
      <section class="forecast-panel">
        <div class="table-scroll">
          <ForecastTable
            rows={forecast()}
            series={{
              rain: rainSeries(), rainLoaded: rainLoaded(), uv: uvSeries(), radiation: radiationSeries(), temperature: temperatureSeries(),
              feelsLike: feelsLikeSeries(), humidity: humiditySeries(), cloud: cloudSeries(), windU: windUSeries(), windV: windVSeries(),
            }}
            location={location()}
            columns={{ weather: hasWeatherIcons(), uv: uvTimeline().length > 0 || radiationTimeline().length > 0, temperature: hasTemperature(), humidity: hasHumidity(), wind: hasWind() }}
            loadedUntil={pointLoadStage() === 'complete' ? Number.POSITIVE_INFINITY : manifestNow() + PASSIVE_FORECAST_HOURS * 3_600_000}
            historyOpen={historyOpen()}
            historyLoaded={historyRowsWanted() || pointLoadStage() === 'complete'}
            onNeedRows={() => { void completePointSeries(pointLoad, 'high') }}
            onOpenHistory={() => {
              setHistoryOpen((open) => !open)
              void loadHistoryRows()
            }}
            sunForm={sunForm}
          />
        </div>
      </section>
    </aside>
    <Show when={perfVisible()}><PerfHud monitor={perf} windTuning={windTuning()} onWindTuning={tuneWind} /></Show>
  </main>
}

function storedTheme(): ThemeChoice {
  const stored = localStorage.getItem('motregen-theme')
  return stored === 'light' || stored === 'system' || stored === 'dark' ? stored : 'light'
}

function readCachedPointSeries(
  client: MrfClient,
  frames: TimelineFrame[],
  point: { lng: number; lat: number },
): { values: Array<number | null>; loaded: boolean[]; complete: boolean } {
  const values = new Array<number | null>(frames.length).fill(null)
  const loaded = frames.map(() => false)
  for (let index = 0; index < frames.length; index++) {
    const timelineFrame = frames[index]!
    const header = client.getCachedHeader(timelineFrame.chunk)
    const frame = client.getCachedFrame(timelineFrame.chunk, timelineFrame.frameIndex)
    if (!header || !frame) continue
    loaded[index] = true
    values[index] = samplePoint(header, frame, point)
  }
  return { values, loaded, complete: loaded.every(Boolean) }
}

function samplePoint(header: MrfHeader, frame: Uint8Array, point: { lng: number; lat: number }): number | null {
  const [x, y] = project(point.lng, point.lat)
  const column = Math.floor((x - header.grid.x0) / header.grid.dx)
  const row = Math.floor((y - header.grid.y0) / header.grid.dy)
  if (column < 0 || row < 0 || column >= header.grid.width || row >= header.grid.height) return null
  return header.quant[frame[row * header.grid.width + column]!] ?? null
}
function directRainIndexes(frames: TimelineFrame[], now: number): number[] {
  if (!frames.length) return []
  const blend = frameBlend(frames, now)
  return [...new Set([blend.left, blend.right])]
}

function scheduleIdle(callback: () => void, timeout: number): number {
  const requestIdle = (window as unknown as { requestIdleCallback?: (callback: () => void, options: { timeout: number }) => number }).requestIdleCallback
  if (requestIdle) return requestIdle.call(window, callback, { timeout })
  return window.setTimeout(callback, 50)
}

function cancelIdle(handle: number): void {
  const cancel = (window as unknown as { cancelIdleCallback?: (handle: number) => void }).cancelIdleCallback
  if (cancel) cancel.call(window, handle)
  else window.clearTimeout(handle)
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

