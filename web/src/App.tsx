import { batch, createEffect, createMemo, createSignal, onCleanup, onMount, Show } from 'solid-js'
import maplibregl, { Marker, type GeoJSONSource } from 'maplibre-gl'
import About, { type ThemeChoice } from './components/About'
import HistogramScrubber from './components/HistogramScrubber'
import { INLINE_ICON, Star, Sun } from './components/icons'
import LocationSearch from './components/LocationSearch'
import Freshness from './components/Freshness'
import PerfHud from './components/PerfHud'
import type { IsolineCounters } from './core/perf'
import ForecastTable from './components/ForecastTable'
import UvBar, { uvBarLabel } from './components/UvBar'
import DevPanel from './components/DevPanel'
import { loadBasemapStyle, temperatureLayerBeforeId, type MapTheme } from './core/basemap'
import { chunkField, type Grid, type Manifest, type ManifestChunk, type MrfHeader, type TimelineFrame } from './core/contract'
import { DayNightLayer } from './core/day-night-layer'

const DAY_NIGHT_ENABLED = false
import { buildHourlyForecast, isPassiveRow, PASSIVE_FORECAST_HOURS } from './core/forecast'
import { contextOpacity, FOCUS_DIM, FocusMode, mapSaturation, type FocusKind, windFocusIntensity } from './core/focus-mode'
import { FrameBatcher } from './core/frame-batcher'
import { latestRadarEpoch, type RefreshState } from './core/freshness'
import { blendFrames, blurField, DEFAULT_ISOLINE_TUNING, ISOBAR_STEP_HPA, ISOLINE_BLUR, ISOLINE_EDGE_FADE_MS, ISOLINE_FILL_OPACITY, ISOLINE_GRADIENT, ISOLINE_RING_KM, ISOLINE_WINDOW, isolineColor, IsolineWorker, type IsolineFeatureCollection, type IsolineKind, type IsolineTuning } from './core/isolines'
import { IsolineLabels } from './core/isoline-labels'
import { sliceWeights } from './core/isoline-spline'
import { TraceCore } from './core/isoline-tracer'
import { prepareField, type PreparedField } from './core/isoline-field'
import { hexColor, IsolineLayer, isolineLayerIndices, type IsolineStyle } from './core/isoline-layer'
import { cursorAfterTimelineRefresh, isNewerManifest, nextManifestRefreshDelay, reconcileTimelineSeries, scheduleManifestRefresh } from './core/manifest-refresh'
import { constrainView, containView, containZoom, MAP_CONTAIN_BOUNDS, type Viewport } from './core/map-constraint'
import { mapFrameFromGrid, NETHERLANDS_FLANDERS_BOUNDS } from './core/map-frame'
import { MrfClient, type MotionField } from './core/mrf'
import { selectPairMotion } from './core/motion-selection'
import { nearestPlace } from './core/places'
import { startFrameLoop } from './core/playback'
import { installPerfMonitor, type LoadLayer } from './core/perf'
import { RainLayer } from './core/rain-layer'
import { LayerOverlay } from './core/overlay-canvas'
import { grantedStartFix, loadLastSavedPlaceId, loadMapView, resolveStartLocation, storeLastSavedPlaceId, storeMapView } from './core/location-memory'
import { attachPinNavigation, PAN_ZOOM_ONLY, PIN_EDGE_MARGIN, restrictMapGestures } from './core/pin-navigation'
import { loadSavedPlaces, savedPlaceId, samePlace, storeSavedPlaces, type SavedPlace } from './core/saved-places'
import { sunnyLocations, SUN_ICONS_ENABLED, type FieldBlend, type SunFeatureCollection } from './core/sun'
import { solarElevationSin } from './core/solar'
import { bandColor, paletteRange, paletteStops, type PaletteRange } from './core/temperature-palette'
import { selectTemperaturePlaces, temperatureLabelSpacingPx, temperatureLabels, temperatureLayer, type TemperatureFeatureCollection } from './core/temperature'
import { buildTimeline, frameBlend, seriesValueAt, timelineCoverage, timelineCursorAtEpoch, timelineEpochAtCursor, timelineHorizonEnd, timelinePlaybackRate } from './core/time-model'
import { formatUv, uvChipLabel, uvLevel, uvReading } from './core/uv'
import { WIND_UNITS, type WindUnit } from './core/weather'
import { buildWindTimeline, sameGrid, zipWindFrame, type WindTimelineFrame } from './core/wind'
import { DEFAULT_WIND_TUNING, loadWindTuning, storeWindTuning, WIND_MAX_FPS, WIND_PARAMETERS, WindLayer, type WindTuning } from './core/wind-layer'
import { clearTuningStorage } from './core/dev-settings'
import { CLOUD_LAYERS, type CloudLayer } from './core/cloud-section'
import { browserUsageEnvironment, createUsageTracker, installUsageBeacon, sessionManifestUrls } from './core/usage'

const manifestUrl = new URL('/data/manifest.json', location.href)
const manifestRequestUrl = sessionManifestUrls(manifestUrl)
const perf = installPerfMonitor()
const defaultLocation = { lng: 5.18, lat: 52.1, label: 'De Bilt' }
type PointLoadStage = 'initial' | 'direct' | 'window' | 'complete'
type FetchPriority = 'high' | 'low'
type ForecastIndex = 'radiationIndex' | 'uvIndex' | 'temperatureIndex' | 'feelsLikeIndex' | 'humidityIndex' | 'cloudIndex' | 'windUIndex' | 'windVIndex' | 'gustIndex'

interface IsolineSetConfig {
  kind: IsolineKind
  layerId: string
  timeline: () => TimelineFrame[]
  /** Focuswaarde 0–1 van de bijbehorende modus; `active` is focus > 0. */
  focus: () => number
  active: () => boolean
  step: () => number
  style: () => IsolineStyle
  labelFade: () => [number, number] | undefined
  coverage: () => number
  setCount: (count: number) => void
}

/** Isolijnlaag, labels en caches van één veld: gevoelstemperatuur of luchtdruk (U35). */
interface IsolineSet extends IsolineSetConfig {
  worker?: IsolineWorker
  layer?: IsolineLayer
  overlay?: LayerOverlay
  layerKey: string
  labels?: IsolineLabels
  labelRounds: number
  fields: Array<PreparedField | undefined>
  time: number
  /** Frame+stap van de getoonde labelgeometrie. */
  key: string
  shownRequest: number
  prepared: Map<string, Promise<{ grid: Grid; field: PreparedField }>>
  labelCache: Map<string, Promise<IsolineFeatureCollection | undefined>>
}

function isolineSet(config: IsolineSetConfig): IsolineSet {
  return { ...config, layerKey: '', labelRounds: 0, fields: [], time: 0, key: '', shownRequest: 0, prepared: new Map(), labelCache: new Map() }
}

/** Luchtdruk laadt pas bij de eerste windfocus (U35): ook zijn headers horen niet in de cold start. */
function eagerHeader(chunk: ManifestChunk): boolean {
  return chunkField(chunk) !== 'pressure_hpa'
}

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

// Terugglijden aan het eind van een afspeelrondje (PO 2026-09-25 live, U34).
const PLAYBACK_REWIND_MS = 700

export default function App() {
  const devMode = new URLSearchParams(window.location.search).has('dev')
  let mapElement!: HTMLDivElement
  let splashElement!: HTMLDivElement
  let map: maplibregl.Map | undefined
  let marker: Marker | undefined
  let detachPinNavigation: (() => void) | undefined
  let savedMarkers: Marker[] = []
  const savedPlaceStar = <Star class="saved-place-star" size={28} strokeWidth={2} fill="currentColor" /> as SVGSVGElement
  let dayNightLayer: DayNightLayer | undefined
  let layer: RainLayer | undefined
  // Regen en wind tekenen op eigen canvassen boven de kaart (U8c): hun animatie laat MapLibre
  // niet elke frame basiskaart, symboolplaatsing en isolijnen opnieuw renderen.
  let rainOverlay: LayerOverlay | undefined
  let windOverlay: LayerOverlay | undefined
  let windLayer: WindLayer | undefined
  let windGrid: Grid | undefined
  let splashReplayTimer: number | undefined
  let mapViewTimer: number | undefined
  let stopManifestRefresh: (() => void) | undefined
  let shownFrameRequest = 0
  let shownWindRequest = 0
  let shownTemperatureRequest = 0
  let shownSunRequest = 0
  let mapRepaints = 0
  const isolineCounters = (): IsolineCounters => ({
    ...temperatureIsolines.layer?.stats,
    repaints: mapRepaints,
    rainUploads: layer?.uploads ?? 0,
    rainDraws: rainOverlay?.draws ?? 0,
    isolineDraws: temperatureIsolines.overlay?.draws ?? 0,
    windDraws: windOverlay?.draws ?? 0,
    labelRounds: temperatureIsolines.labelRounds,
    labels: temperatureIsolines.labels?.count ?? 0,
    sliceTime: temperatureIsolines.layer ? temperatureIsolines.time : undefined,
    coverage: isolineCoverage(),
    paletteRange: temperatureRange(),
  })
  // e2e-meetpunt: exacte schermprojectie van de kaart (marker-positiechecks zonder herberekening).
  ;(window as unknown as { __motregenProject: (lng: number, lat: number) => { x: number; y: number } | undefined }).__motregenProject = (lng, lat) => map?.project([lng, lat])
  // Camera voor de e2e van pin-navigatie en pan/zoom-only (U26).
  ;(window as unknown as { __motregenCamera: () => object | undefined }).__motregenCamera = () => map && {
    ...map.getCenter(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch(), location: location(),
  }
  // Meetpunt voor de kostenmeting (track-LOGs U8b/U8c): repaints, contour-passes, blits, label-rondes.
  ;(window as unknown as { __motregenIsolines: () => object }).__motregenIsolines = () => ({
    ...isolineCounters(),
    fillCoverage: () => temperatureIsolines.layer?.fillCoverage() ?? 0,
    field: (index: number) => temperatureIsolines.layer && temperatureIsolines.fields[index] ? { grid: temperatureIsolines.layer.grid, field: temperatureIsolines.fields[index] } : undefined,
    // Tracer-kosten zonder worker-overhead: dezelfde code als de worker, op de main thread.
    traceBench: (runs: number) => {
      const { layer: isolineLayer, fields, time } = temperatureIsolines
      if (!isolineLayer) return undefined
      const core = new TraceCore(isolineLayer.grid, isolineLayer.depth)
      fields.forEach((field, index) => core.setLayer(index, field))
      const { step } = isolineTuning()
      const times: number[] = []
      for (let run = 0; run < runs; run++) {
        const started = performance.now()
        core.trace({ time, window: ISOLINE_WINDOW, step, toleranceCells: 0.05, ringKm: ISOLINE_RING_KM })
        times.push(performance.now() - started)
      }
      return times.map((time) => Math.round(time * 10) / 10)
    },
  })
  let pointRequest = 0
  let styleRequest = 0
  let appliedMapTheme: MapTheme | undefined
  let temperatureLabelKey = ''
  let sunFeatureKey = ''
  let sunEpochBucket = Number.NaN
  let rainReadyPending = false
  let scrubPrefetch = false
  let initialPickStarted = false
  let pointLoad: PointLoadState | undefined
  const windFrameCache = new Map<string, Promise<Float32Array>>()
  const media = matchMedia('(prefers-color-scheme: dark)')
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  const client = new MrfClient(manifestUrl, perf.loads)
  const [manifest, setManifest] = createSignal<Manifest>()
  const [manifestRefresh, setManifestRefresh] = createSignal<RefreshState>()
  const timeline = createMemo(() => manifest() ? buildTimeline(manifest()!) : [])
  const radiationTimeline = createMemo(() => manifest() ? buildTimeline(manifest()!, 'radiation') : [])
  const uvTimeline = createMemo(() => manifest() ? buildTimeline(manifest()!, 'uv') : [])
  const uvClearTimeline = createMemo(() => manifest() ? buildTimeline(manifest()!, 'uv_clear') : [])
  const tempTimeline = createMemo(() => manifest() ? buildTimeline(manifest()!, 'temp_c') : [])
  const feelsLikeTimeline = createMemo(() => manifest() ? buildTimeline(manifest()!, 'feels_like_c') : [])
  const humidityTimeline = createMemo(() => manifest() ? buildTimeline(manifest()!, 'rel_humidity') : [])
  const cloudTimeline = createMemo(() => manifest() ? buildTimeline(manifest()!, 'cloud_frac') : [])
  const gustTimeline = createMemo(() => manifest() ? buildTimeline(manifest()!, 'gust_ms') : [])
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
  // Afspeelhorizon; de tijdsbereikknoppen zijn weg (U34), de scrubber scrolt door de hele tijdlijn.
  const [timeHorizonHours] = createSignal<number | null>(8)
  const initialSavedPlaces = loadSavedPlaces()
  const initialMapView = loadMapView()
  let startLocation = resolveStartLocation(initialSavedPlaces, loadLastSavedPlaceId(), initialMapView, defaultLocation)
  let startFromFix = false
  const [location, setLocation] = createSignal({ lng: startLocation.lng, lat: startLocation.lat })
  const [locationLabel, setLocationLabel] = createSignal(startLocation.label)
  // Verleende locatietoestemming gaat vóór de onthouden plaats (U26); tot de fix er is staat die er.
  void grantedStartFix({ permissions: navigator.permissions, geolocation: navigator.geolocation }, MAP_CONTAIN_BOUNDS).then((fix) => {
    if (!fix) return
    const current = location()
    if (current.lng !== startLocation.lng || current.lat !== startLocation.lat) return
    if (!initialPickStarted) {
      startLocation = fix
      startFromFix = true
      setLocation({ lng: fix.lng, lat: fix.lat })
      setLocationLabel(fix.label)
      return
    }
    pick(fix.lng, fix.lat, fix.label)
    revealPoint(fix.lng, fix.lat)
  })
  const [savedPlaces, setSavedPlaces] = createSignal<SavedPlace[]>(initialSavedPlaces)
  const [rainSeries, setRainSeries] = createSignal<Array<number | null>>([])
  const [rainLoaded, setRainLoaded] = createSignal<boolean[]>([])
  const [pointSeriesLoading, setPointSeriesLoading] = createSignal(true)
  const [pointLoadStage, setPointLoadStage] = createSignal<PointLoadStage>('initial')
  const [uvSeries, setUvSeries] = createSignal<Array<number | null>>([])
  const [temperatureSeries, setTemperatureSeries] = createSignal<Array<number | null>>([])
  const [feelsLikeSeries, setFeelsLikeSeries] = createSignal<Array<number | null>>([])
  const [humiditySeries, setHumiditySeries] = createSignal<Array<number | null>>([])
  const [cloudSeries, setCloudSeries] = createSignal<Array<number | null>>([])
  const [windUSeries, setWindUSeries] = createSignal<Array<number | null>>([])
  const [windVSeries, setWindVSeries] = createSignal<Array<number | null>>([])
  const [gustSeries, setGustSeries] = createSignal<Array<number | null>>([])
  const [radiationSeries, setRadiationSeries] = createSignal<Array<number | null>>([])
  const [uvClearSeries, setUvClearSeries] = createSignal<Array<number | null>>([])
  // History rows cost bytes the old table never loaded; they stay folded until asked for.
  const [historyRowsWanted, setHistoryRowsWanted] = createSignal(false)
  const [historyOpen, setHistoryOpen] = createSignal(false)
  // Desktop: historie staat in de tabel boven de nu-rij; touch houdt de uitklaprij (scrollen in een
  // eigen tabelscroller onder de sticky scrubber werkt daar niet prettig).
  const inlineHistoryMedia = matchMedia('(min-width: 960px) and (pointer: fine)')
  const [historyInline, setHistoryInline] = createSignal(inlineHistoryMedia.matches)
  const [status, setStatus] = createSignal('Regen laden…')
  const [theme, setTheme] = createSignal<ThemeChoice>(storedTheme())
  const [windUnit, setWindUnit] = createSignal<WindUnit>(storedWindUnit())
  const usage = createUsageTracker(browserUsageEnvironment(), theme(), windUnit())
  onCleanup(installUsageBeacon(usage, document, window))
  const [usageBody, setUsageBody] = createSignal(JSON.stringify(usage.sessionBody()))
  if (devMode) {
    usage.onChange = () => setUsageBody(JSON.stringify(usage.sessionBody()))
    // De duurbak loopt vanzelf door; alleen onder ?dev.
    const usageTicker = window.setInterval(usage.onChange, 5_000)
    onCleanup(() => window.clearInterval(usageTicker))
  }
  const [windTuning, setWindTuning] = createSignal<WindTuning>(loadWindTuning())
  const [isolineTuning, setIsolineTuning] = createSignal<IsolineTuning>({ ...DEFAULT_ISOLINE_TUNING })
  const [temperatureRange, setTemperatureRange] = createSignal<PaletteRange | undefined>()
  let temperatureRangeKey = ''
  const [focus, setFocus] = createSignal(0)
  const [windFocus, setWindFocus] = createSignal(0)
  const [focusPinned, setFocusPinned] = createSignal<FocusKind>()
  const [isolineCount, setIsolineCount] = createSignal(0)
  const focusMode = new FocusMode<FocusKind>(['temperature', 'wind'], (mode, value) => (mode === 'wind' ? setWindFocus : setFocus)(value),
    () => reducedMotion.matches)
  const [isobarCount, setIsobarCount] = createSignal(0)
  const isolineCoverage = createMemo(() => timelineCoverage(feelsLikeTimeline(), selectedEpoch(), ISOLINE_EDGE_FADE_MS))
  const pressureTimeline = createMemo(() => manifest() ? buildTimeline(manifest()!, 'pressure_hpa') : [])
  const isobarCoverage = createMemo(() => timelineCoverage(pressureTimeline(), selectedEpoch(), ISOLINE_EDGE_FADE_MS))
  const temperatureIsolines = isolineSet({
    kind: 'temperature', layerId: 'motregen-isolines', timeline: feelsLikeTimeline, focus, active: createMemo(() => focus() > 0),
    step: () => isolineTuning().step, style: isolineStyle, labelFade, coverage: isolineCoverage, setCount: setIsolineCount,
  })
  // Isobaren (U35): pas bij de eerste windfocus opgehaald, dus de cold start blijft gelijk.
  const pressureIsolines = isolineSet({
    kind: 'pressure', layerId: 'motregen-isobars', timeline: pressureTimeline, focus: windFocus, active: createMemo(() => windFocus() > 0),
    step: () => ISOBAR_STEP_HPA, style: isobarStyle, labelFade: () => undefined, coverage: isobarCoverage, setCount: setIsobarCount,
  })
  const isolineSets = [temperatureIsolines, pressureIsolines]
  const focusedWindTuning = createMemo(() => ({
    ...windTuning(),
    intensity: windFocusIntensity(windTuning().intensity, windFocus()),
    visibility: WIND_PARAMETERS.visibility * contextOpacity(focus(), FOCUS_DIM),
  }))
  const [mapReady, setMapReady] = createSignal(false)
  const [resetNotice, setResetNotice] = createSignal(false)
  let resetNoticeTimer: number | undefined
  const [perfVisible, setPerfVisible] = createSignal(false)
  const [systemDark, setSystemDark] = createSignal(media.matches)
  const mapTheme = createMemo<MapTheme>(() => theme() === 'system' ? systemDark() ? 'dark' : 'light' : theme() as MapTheme)

  onMount(async () => {
    const mediaChanged = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    media.addEventListener('change', mediaChanged)
    onCleanup(() => media.removeEventListener('change', mediaChanged))
    const inlineHistoryChanged = (event: MediaQueryListEvent) => setHistoryInline(event.matches)
    inlineHistoryMedia.addEventListener('change', inlineHistoryChanged)
    onCleanup(() => inlineHistoryMedia.removeEventListener('change', inlineHistoryChanged))
    try {
      const data = await fetchManifest()
      perf.setManifestGenerated(data.generated)
      setManifestRefresh({ checkedAt: Date.now() })
      const frames = buildTimeline(data)
      if (!frames.length) throw new Error('De tijdlijn is leeg')
      setManifest(data)
      void Promise.all(data.chunks.filter(eagerHeader).map((chunk) => client.getHeader(chunk))).catch(() => undefined)
      stopManifestRefresh = scheduleManifestRefresh(refreshManifest, {
        setTimeout: (callback, delay) => window.setTimeout(callback, delay),
        clearTimeout: (handle) => window.clearTimeout(handle),
        visibilityState: () => document.visibilityState,
        addVisibilityListener: (callback) => document.addEventListener('visibilitychange', callback),
        removeVisibilityListener: (callback) => document.removeEventListener('visibilitychange', callback),
      }, () => {
        const current = manifest()
        return nextManifestRefreshDelay(Date.now(), current && latestRadarEpoch(current))
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
        ...PAN_ZOOM_ONLY,
        // Een gewijzigde symbooltekst is voor MapLibre een nieuw symbool: met fade flitst 16°→17°
        // weg en weer in. Zonder fade wisselt het label in place (U8b).
        fadeDuration: 0,
        renderWorldCopies: false,
        attributionControl: false,
      })
      restrictMapGestures(map, window.matchMedia('(pointer: coarse)').matches)
      applyMapDetailLimit()
      applyMapContainLimit()
      map.on('resize', applyMapContainLimit)
      syncSavedMarkers(savedPlaces())
      map.on('style.load', () => attachMapLayers(header.grid))
      map.on('render', () => { mapRepaints++ })
      map.on('moveend', rememberMapView)
      map.on('zoomend', () => void showTemperature())
      map.on('moveend', () => { for (const set of isolineSets) { set.labels?.requestSpawn(); updateIsolineLabels(set) } })
      map.on('click', (event) => {
        usage.mark('pin')
        pick(event.lngLat.lng, event.lngLat.lat, nearestPlace(event.lngLat.lng, event.lngLat.lat).name)
      })
      if (mapTheme() !== appliedMapTheme) void applyMapTheme(mapTheme())
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  })

  onCleanup(() => {
    window.clearTimeout(splashReplayTimer)
    window.clearTimeout(resetNoticeTimer)
    window.clearTimeout(mapViewTimer)
    stopManifestRefresh?.()
    focusMode.dispose()
    detachPinNavigation?.()
    for (const set of isolineSets) { set.worker?.dispose(); set.labels?.clear() }
    cancelPointLoad(pointLoad)
    for (const savedMarker of savedMarkers) savedMarker.remove()
    rainOverlay?.remove()
    windOverlay?.remove()
    for (const set of isolineSets) set.overlay?.remove()
    map?.remove()
  })

  async function fetchManifest(cache: RequestCache = 'default'): Promise<Manifest> {
    const response = await fetch(manifestRequestUrl(), { cache })
    if (!response.ok) throw new Error(`Manifest laden mislukt (${response.status})`)
    return response.json() as Promise<Manifest>
  }

  async function refreshManifest(): Promise<void> {
    const current = manifest()
    if (!current) return
    try {
      const candidate = await fetchManifest('no-cache')
      setManifestRefresh({ checkedAt: Date.now() })
      if (!isNewerManifest(current, candidate)) return
      applyManifestRefresh(candidate)
    } catch {
      // De atomair gepubliceerde vorige generatie blijft volledig bruikbaar,
      // maar de gebruiker moet zien dat ze niet meer ververst.
      setManifestRefresh((previous) => ({ checkedAt: previous?.checkedAt ?? 0, failedAt: Date.now() }))
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
    const nextGust = buildTimeline(nextManifest, 'gust_ms')
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
    const gust = reconcileTimelineSeries(gustTimeline(), nextGust, gustSeries())
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
      setGustSeries(gust.values)
    })
    perf.setManifestGenerated(nextManifest.generated)
    void Promise.all(nextManifest.chunks.filter(eagerHeader).map((chunk) => client.getHeader(chunk))).catch(() => undefined)
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
    const tuning = focusedWindTuning()
    windLayer?.setTuning(tuning)
  })

  createEffect(() => applyFocus(focus()))
  createEffect(() => applyMapSaturation(mapSaturation(focus())))
  for (const set of isolineSets) {
    createEffect(() => applyIsolineOpacity(set))

    createEffect(() => {
      selectedEpoch()
      set.step()
      if (set.active() && mapReady()) { void showIsolineField(set); void showIsolines(set); return }
      // Pas na de uitfade leegmaken, zodat een volgende hover geen verouderde labels laat invaden.
      if (set.key) {
        set.key = ''
        set.shownRequest++
        set.labels?.clear()
        set.setCount(0)
      }
    })

    createEffect(() => set.labels?.setFade(set.labelFade()))

    createEffect(() => {
      // Buiten de optional chain: ook zonder laag moet het effect het paletbereik volgen.
      const style = set.style()
      set.layer?.setStyle(style)
    })
  }

  createEffect(() => {
    const epoch = selectedEpoch()
    const ready = mapReady()
    dayNightLayer?.setEpoch(epoch)
    if (ready && layer) void showFrame()
    if (!ready) return
    if (windLayer) void showWind()
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
    // Aan het eind van een rondje glijdt de tijdlijn terug naar het begin i.p.v. in één frame te springen:
    // in de schuivende scrubber (U34) oogde die sprong als "de tijdlijn springt telkens terug".
    let rewind: { from: number; startedAt: number } | undefined
    const stop = startFrameLoop((now) => {
      const elapsed = now - previous
      // Zelfde grens als de windcanvas: op 120 Hz-schermen elke tweede vsync overslaan.
      if (elapsed < 1_000 / WIND_MAX_FPS - 4) return
      previous = now
      if (rewind) {
        const progress = Math.min(1, (now - rewind.startedAt) / PLAYBACK_REWIND_MS)
        const eased = progress < 0.5 ? 2 * progress ** 2 : 1 - (2 - 2 * progress) ** 2 / 2
        setCursor(timelineCursorAtEpoch(frames, rewind.from + (frames[0]!.epoch - rewind.from) * eased))
        if (progress >= 1) rewind = undefined
        return
      }
      const epoch = timelineEpochAtCursor(frames, cursor())
      // Door de gebruiker voorbij de afspeelhorizon gescrold: stoppen, niet terugspringen naar het begin.
      if (!(epoch < lastEpoch)) { setPlaying(false); return }
      const nextEpoch = epoch + elapsed * playbackRate
      if (!Number.isFinite(nextEpoch) || nextEpoch >= lastEpoch) { rewind = { from: epoch, startedAt: now }; return }
      setCursor(timelineCursorAtEpoch(frames, nextEpoch))
    }, requestAnimationFrame, cancelAnimationFrame)
    onCleanup(stop)
  })

  // Zolang het versheidspaneel open is staat de klok stil (PO 2026-09-25 live).
  let playingBeforeFreshness = false
  function pauseForFreshness(): void {
    usage.mark('fresh')
    playingBeforeFreshness = playing()
    setPlaying(false)
  }
  function resumeAfterFreshness(): void {
    if (playingBeforeFreshness) setPlaying(true)
    playingBeforeFreshness = false
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
    if (!map || map.getLayer('motregen-grid-outside')) return
    // uitgezet op PO-verzoek (MIP-4 ronde 7): tinting-implementatie voldoet
    // niet (en stond in dark mode verkeerd om); later iets beters of weglaten
    if (DAY_NIGHT_ENABLED) {
      dayNightLayer = new DayNightLayer(mapTheme())
      map.addLayer(dayNightLayer)
      dayNightLayer.setEpoch(selectedEpoch())
    }
    // Overlays overleven een stijlwissel; de terugval als kaartlaag moet opnieuw in de stijl.
    if (windGrid && windTimeline().length && !windLayer) mountWind(windGrid)
    else if (windLayer && !windOverlay && !map.getLayer(windLayer.id)) map.addLayer(windLayer)
    if (!layer) mountRain(grid)
    else if (!rainOverlay && !map.getLayer(layer.id)) map.addLayer(layer)
    if (SUN_ICONS_ENABLED && (radiationTimeline().length || uvTimeline().length)) attachSunLayer()
    if (hasTemperature()) attachTemperatureLayer()
    attachMapFrame(grid)
    applyFocus(focus())
    // Na een stijlwissel met vastgezette focus loopt het isolijn-effect niet vanzelf opnieuw.
    for (const set of isolineSets) if (set.active() && mapReady()) { void showIsolineField(set); void showIsolines(set) }
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
    const afterRainDraw = (callback: () => void) => rainOverlay ? rainOverlay.once(callback) : map!.once('render', callback)
    if (!mapReady() && !rainReadyPending) {
      const renderedMap = map
      rainReadyPending = true
      afterRainDraw(() => {
        rainReadyPending = false
        if (map !== renderedMap) return
        setMapReady(true)
        void attachWindLayer()
        if (!initialPickStarted) {
          initialPickStarted = true
          pick(startLocation.lng, startLocation.lat, startLocation.label)
          if (startFromFix) revealPoint(startLocation.lng, startLocation.lat)
        }
      })
    }
    afterRainDraw(() => perf.markRainFrameCommitted())
    if (!rainOverlay) map.triggerRepaint()
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
    if (!map || !windGrid || !windTimeline().length || windLayer) return
    mountWind(windGrid)
    await showWind()
  }

  function mountRain(grid: Grid): void {
    if (!map) return
    layer = new RainLayer(grid)
    try {
      rainOverlay = new LayerOverlay(map, layer, windOverlay?.canvas ?? map.getCanvas(), () => WIND_MAX_FPS)
    } catch {
      rainOverlay = undefined
      map.addLayer(layer)
    }
  }

  function mountWind(grid: Grid): void {
    if (!map) return
    const wind = new WindLayer(grid, mapTheme(), focusedWindTuning())
    windLayer = wind
    try {
      // Boven kaart en isolijnen, onder de regen, zoals vroeger in de lagenstapel.
      windOverlay = new LayerOverlay(map, wind, topIsolineCanvas() ?? map.getCanvas(), () => wind.maxFps)
    } catch {
      windOverlay = undefined
      map.addLayer(wind, map.getLayer('motregen-rain') ? 'motregen-rain' : undefined)
    }
  }

  /**
   * Eigen canvas direct boven de kaart (onder wind en regen): een tijdstap tekent dan alleen de
   * contour-snede, zonder MapLibre-render en symboolplaatsing, dus vloeiend op de fps-grens.
   */
  function mountIsolines(set: IsolineSet, target: maplibregl.Map, isolines: IsolineLayer): void {
    try {
      set.overlay = new LayerOverlay(target, isolines, target.getCanvas(), () => WIND_MAX_FPS)
    } catch {
      set.overlay = undefined
      target.addLayer(isolines, 'motregen-temperature')
    }
  }

  /** De bovenste isolijncanvas: de wind moet boven beide isolijnlagen liggen. */
  function topIsolineCanvas(): HTMLCanvasElement | undefined {
    let top: HTMLCanvasElement | undefined
    for (const set of isolineSets) {
      const canvas = set.overlay?.canvas
      if (canvas && (!top || top.compareDocumentPosition(canvas) & Node.DOCUMENT_POSITION_FOLLOWING)) top = canvas
    }
    return top
  }

  function unmountIsolines(set: IsolineSet): void {
    if (set.overlay) set.overlay.remove()
    else if (set.layer && map?.getLayer(set.layer.id)) map.removeLayer(set.layer.id)
    set.layer?.dispose()
    set.overlay = undefined
    set.layer = undefined
  }

  function unmountWind(): void {
    if (windOverlay) windOverlay.remove()
    else if (windLayer && map?.getLayer(windLayer.id)) map.removeLayer(windLayer.id)
    windOverlay = undefined
    windLayer = undefined
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
      if (windOverlay) windOverlay.triggerRepaint()
      else map.triggerRepaint()
    } catch {
      if (request === shownWindRequest) unmountWind()
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
    for (const set of isolineSets) {
      set.key = ''
      unmountIsolines(set)
      set.labels?.clear()
      set.labels = undefined
    }
    map.addLayer(temperatureLayer(mapTheme()), beforeId)
  }

  function applyFocus(value: number): void {
    if (!map) return
    const context = contextOpacity(value, FOCUS_DIM)
    layer?.setOpacity(context)
    rainOverlay?.triggerRepaint()
    if (map.getLayer('motregen-sun')) map.setPaintProperty('motregen-sun', 'text-opacity', ['*', ['get', 'opacity'], context])
    applyIsolineOpacity(temperatureIsolines)
    if (map.getLayer('motregen-temperature')) {
      // In focus dragen de lijnen de waarde; de stadslabels faden uit en geven hun plek vrij
      // (ignore-placement).
      map.setPaintProperty('motregen-temperature', 'text-opacity', 1 - value)
      map.setLayoutProperty('motregen-temperature', 'text-ignore-placement', value >= 0.5)
    }
    map.triggerRepaint()
  }

  /**
   * Compositorfilter op MapLibre's eigen canvas: geen restyle en geen kaartrender, de overlays
   * (eigen canvassen) blijven verzadigd. Per frame uit de focus-tween, dus reduced motion springt
   * mee. Op 1 geen filter, zodat buiten focus geen filterlaag bestaat.
   */
  function applyMapSaturation(value: number): void {
    const shell = mapElement?.parentElement
    if (!shell) return
    shell.style.setProperty('--map-saturation', value.toFixed(3))
    shell.classList.toggle('map-desaturated', value < 1)
  }

  /**
   * Buiten de uurframes van de gevoelstemperatuur (historie vóór de run, na de horizon) zou de
   * snede op het randframe bevriezen terwijl regen en wind doorlopen; daar faden de lijnen weg.
   */
  function applyIsolineOpacity(set: IsolineSet): void {
    const visible = set.focus() * set.coverage()
    set.layer?.setOpacity(visible)
    set.labels?.setOpacity(visible)
  }

  /** Labels vervagen mee met hun lijn. */
  function labelFade(): [number, number] | undefined {
    return isolineTuning().fade === 'gradiënt' ? ISOLINE_GRADIENT : undefined
  }

  function isolineStyle(): IsolineStyle {
    const { step, fillStyle, fade } = isolineTuning()
    const range = temperatureRange()
    return { step, fill: ISOLINE_FILL_OPACITY, fillSmooth: fillStyle === 'verloop', palette: range && paletteStops(range), color: hexColor(isolineColor(mapTheme())), gradientFade: fade === 'gradiënt' }
  }

  /** Isobaren: één egale lijnkleur, geen vulling en geen vervaging, zoals op een weerkaart (PO U35). */
  function isobarStyle(): IsolineStyle {
    return { step: ISOBAR_STEP_HPA, fill: 0, color: hexColor(isolineColor(mapTheme(), 'pressure')), gradientFade: false }
  }

  function preparedIsolineField(set: IsolineSet, frame: TimelineFrame): Promise<{ grid: Grid; field: PreparedField }> {
    const preparedIsolineFields = set.prepared
    const key = `${frame.chunk.url}#${frame.frameIndex}`
    let prepared = preparedIsolineFields.get(key)
    if (!prepared) {
      prepared = Promise.all([load(frame), client.getHeader(frame.chunk)]).then(([data, header]) => {
        const { grid } = header
        return { grid, field: prepareField(blurField(blendFrames([{ data, quant: header.quant, weight: 1 }], grid.width, grid.height), ISOLINE_BLUR)) }
      })
      prepared.catch(() => preparedIsolineFields.delete(key))
      preparedIsolineFields.set(key, prepared)
      if (preparedIsolineFields.size > 16) preparedIsolineFields.delete(preparedIsolineFields.keys().next().value!)
    }
    return prepared
  }

  /**
   * Lijnen: de snede door het uurvolume staat op de GPU; hier alleen de tijd zetten en
   * ontbrekende uurlagen (één keer per uurframe) uploaden. Geen werk zonder wijziging.
   */
  /**
   * Paletbereik: min/max van de gevoelstemperatuur over de uurframes die de tabel sowieso laadt
   * (t/m +18 u), dus geen extra bytes. Eén keer per run: scrubben verschuift de kleuren niet.
   * Alleen cellen binnen het kaartkader (NL + Vlaanderen): het rooster reikt tot ver in Duitsland,
   * waar zon en nacht het bereik op 25-09 van 9–17 °C naar 1–30 °C rekten.
   */
  async function updateTemperatureRange(): Promise<void> {
    const frames = feelsLikeTimeline()
    const key = [...new Set(frames.map((frame) => frame.chunk.url))].join('|')
    if (!frames.length || key === temperatureRangeKey) return
    temperatureRangeKey = key
    const now = manifestNow()
    const chunks = new Map<ManifestChunk, number[]>()
    for (const row of forecast()) {
      const frame = row.feelsLikeIndex == null || row.kind === 'past' || !isPassiveRow(row, now) ? undefined : frames[row.feelsLikeIndex]
      if (frame) chunks.set(frame.chunk, [...(chunks.get(frame.chunk) ?? []), frame.frameIndex])
    }
    let min = Infinity, max = -Infinity
    try {
      await Promise.all([...chunks].map(async ([chunk, frameIndexes]) => {
        const header = await client.getHeader(chunk)
        const { grid } = header
        const { west, south, east, north } = NETHERLANDS_FLANDERS_BOUNDS
        const [x0, y0] = project(west, north), [x1, y1] = project(east, south)
        const clampColumn = (x: number) => Math.max(0, Math.min(grid.width - 1, Math.floor((x - grid.x0) / grid.dx)))
        const clampRow = (y: number) => Math.max(0, Math.min(grid.height - 1, Math.floor((y - grid.y0) / grid.dy)))
        const [left, right] = [clampColumn(x0), clampColumn(x1)].sort((a, b) => a - b)
        const [top, bottom] = [clampRow(y0), clampRow(y1)].sort((a, b) => a - b)
        const seen = new Uint8Array(256)
        for (const decoded of await client.getFrames(chunk, frameIndexes, 'low', undefined, 'L2')) {
          for (let row = top!; row <= bottom!; row++) for (let column = left!; column <= right!; column++) seen[decoded[row * grid.width + column]!] = 1
        }
        for (let code = 0; code < 256; code++) {
          const value = seen[code] ? header.quant[code] : null
          if (value == null) continue
          min = Math.min(min, value)
          max = Math.max(max, value)
        }
      }))
    } catch {
      if (key === temperatureRangeKey) temperatureRangeKey = ''
      return
    }
    if (key === temperatureRangeKey) setTemperatureRange(paletteRange(min, max))
  }

  /** Kleurbalk van de vulling: één blok per band van het bereik. */
  const temperatureLegend = createMemo(() => {
    const range = temperatureRange()
    if (!range) return undefined
    const { step } = isolineTuning()
    const stops = paletteStops(range)
    const bands: string[] = []
    for (let band = Math.floor(range.low / step); band < Math.ceil(range.high / step); band++) {
      bands.push(`rgb(${bandColor(band, step, stops).map((channel) => Math.round(channel * 255)).join(' ')})`)
    }
    return { ...range, bands }
  })

  async function showIsolineField(set: IsolineSet): Promise<void> {
    if (set.kind === 'temperature') void updateTemperatureRange()
    const frames = set.timeline()
    const renderedMap = map
    if (!frames.length || !renderedMap?.getLayer('motregen-temperature')) return
    const blend = frameBlend(frames, selectedEpoch())
    const time = blend.left + blend.mix
    set.time = time
    // De diepte van het volume ligt vast per laag; welke run in welke uurlaag zit regelt
    // setFrameKeys per index (manifest-refresh).
    const key = String(frames.length)
    if (set.layer && set.layerKey !== key) unmountIsolines(set)
    const required = isolineLayerIndices(time, frames.length, ISOLINE_WINDOW)
    // Tijdens afspelen alvast de volgende uurlaag, zodat de snede nooit op een upload wacht.
    const wanted = playing() ? [...required, Math.min(frames.length - 1, Math.floor(time) + 3)] : required
    try {
      if (!set.layer) {
        const { grid } = await preparedIsolineField(set, frames[required[0]!]!)
        if (map !== renderedMap || set.layer || !renderedMap.getLayer('motregen-temperature')) return
        const created = new IsolineLayer(grid, frames.length, set.style(), set.layerId)
        set.layer = created
        set.layerKey = key
        set.fields = []
        set.labels?.clear()
        set.labels = new IsolineLabels(renderedMap, grid, mapTheme(), () => reducedMotion.matches, set.kind)
        set.labels.setFade(set.labelFade())
        set.key = ''
        // Labels schuiven mee op exact de snede die de lijnen net kregen (zelfde cadans).
        created.onPass = () => updateIsolineLabels(set)
        mountIsolines(set, renderedMap, created)
        applyIsolineOpacity(set)
        void showIsolines(set)
      }
      const layer = set.layer
      const frameKeys = frames.map((frame) => `${frame.chunk.url}#${frame.frameIndex}`)
      for (const index of layer.setFrameKeys(frameKeys)) set.fields[index] = undefined
      layer.setTime(time)
      await Promise.all(wanted.filter((index) => !layer.hasLayer(index)).map(async (index) => {
        const prepared = await preparedIsolineField(set, frames[index]!)
        if (layer !== set.layer || layer.frameKey(index) !== frameKeys[index] || !sameGrid(prepared, { grid: layer.grid })) return
        set.fields[index] = prepared.field
        layer.setLayer(index, prepared.field)
      }))
    } catch {
      // Een ontbrekend uurframe laat de vorige snede staan; de volgende tijdstap probeert opnieuw.
    }
  }

  /**
   * Labels: contourgeometrie per uurframe éénmalig in de worker (gecachet per frame+stap), en
   * het label volgt het dichtstbijzijnde uur. Afspelen kost zo één ronde per uur, rust nul.
   */
  async function showIsolines(set: IsolineSet): Promise<void> {
    const frames = set.timeline()
    if (!frames.length || !set.labels) return
    const request = ++set.shownRequest
    const step = set.step()
    const blend = frameBlend(frames, selectedEpoch())
    const frame = frames[blend.mix < 0.5 ? blend.left : blend.right]!
    const key = `${frame.chunk.url}#${frame.frameIndex}|${step}`
    if (key === set.key) return
    const isolineLabelCache = set.labelCache
    try {
      let labels = isolineLabelCache.get(key)
      if (!labels) {
        const [data, header] = await Promise.all([load(frame), client.getHeader(frame.chunk)])
        set.worker ??= new IsolineWorker()
        set.labelRounds++
        labels = set.worker.compute({ frames: [{ data, quant: header.quant, weight: 1 }], grid: header.grid, step, kind: set.kind })
        isolineLabelCache.set(key, labels)
        if (isolineLabelCache.size > 24) isolineLabelCache.delete(isolineLabelCache.keys().next().value!)
      }
      const data = await labels
      if (!data) isolineLabelCache.delete(key)
      if (!data || request !== set.shownRequest || !set.labels) return
      set.key = key
      set.labels.setLines(data, step)
      set.setCount(data.features.length)
      updateIsolineLabels(set)
    } catch {
      if (request === set.shownRequest) set.key = ''
    }
  }

  function updateIsolineLabels(set: IsolineSet): void {
    const { layer, labels } = set
    if (!labels || !layer || !set.active()) return
    // Op de getekende snede, niet de scrubbertijd: anders liggen labels (en hun ringfade) naast de lijn.
    const weights = sliceWeights(layer.sliceTime, layer.depth, ISOLINE_WINDOW)
    const fields = weights.map(({ index }) => set.fields[index])
    if (fields.some((field) => !field)) return
    labels.update({ width: layer.grid.width, height: layer.grid.height, fields: fields as PreparedField[], weights: weights.map(({ weight }) => weight) }, layer.rings)
  }

  /** Vastzetten sluit de andere modus uit; opnieuw tikken op dezelfde kop maakt los. */
  function toggleFocusPin(mode: FocusKind): void {
    const previous = focusPinned()
    if (previous) focusMode.set(previous, 'pinned', false)
    const pinned = previous === mode ? undefined : mode
    setFocusPinned(pinned)
    if (pinned) focusMode.set(pinned, 'pinned', true)
    if (pinned === 'wind' || pinned === 'temperature') usage.mark(pinned === 'wind' ? 'pinWind' : 'pinFeel')
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
        'text-opacity': ['*', ['get', 'opacity'], contextOpacity(focus(), FOCUS_DIM)],
        'text-opacity-transition': { duration: 0 },
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
      const labels = temperatureLabels(left, right, leftHeader, rightHeader, blend.mix, selectTemperaturePlaces(map.getZoom(), temperatureLabelSpacingPx(map.getContainer().clientWidth, map.getContainer().clientHeight)))
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
    if (map && !marker) {
      marker = new Marker({ color: '#1688ad' }).setLngLat([lng, lat]).addTo(map)
      detachPinNavigation = attachPinNavigation({
        map,
        marker,
        viewport: mapViewport,
        onDrop: (dropped) => {
          usage.mark('pin')
          pick(dropped.lng, dropped.lat, nearestPlace(dropped.lng, dropped.lat).name)
        },
        onDoubleTap: () => usage.mark('pin'),
      })
    }
    marker?.setLngLat([lng, lat])
    void updatePointSeries(point, label)
  }

  /** Centreer alleen als het punt anders buiten (of in de rand van) het vrije kaartvlak valt. */
  function revealPoint(lng: number, lat: number): void {
    if (!map) return
    const { width, height, insets } = mapViewport()
    const { x, y } = map.project([lng, lat])
    const margin = PIN_EDGE_MARGIN
    if (x >= margin && x <= width - margin && y >= (insets?.top ?? 0) + margin && y <= height - margin) return
    map.easeTo({ center: [lng, lat], duration: 450 })
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
      readCachedPointSeries(client, gustTimeline(), point),
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
      setGustSeries(cachedForecast[7]!.values)
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
    setGustSeries([])
    state.direct = (async () => {
      const [uv, temperature, feelsLike, humidity, cloud, windU, windV, gust] = await Promise.all([
        readForecastPointSeries(uvTimeline(), point, 'uvIndex', 'L0'),
        readForecastPointSeries(tempTimeline(), point, 'temperatureIndex', 'L0'),
        readForecastPointSeries(feelsLikeTimeline(), point, 'feelsLikeIndex', 'L0'),
        readForecastPointSeries(humidityTimeline(), point, 'humidityIndex', 'L0'),
        readForecastPointSeries(cloudTimeline(), point, 'cloudIndex', 'L0'),
        readForecastPointSeries(windUFrames(), point, 'windUIndex', 'L0'),
        readForecastPointSeries(windVFrames(), point, 'windVIndex', 'L0'),
        readForecastPointSeries(gustTimeline(), point, 'gustIndex', 'L0'),
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
      setGustSeries(gust)
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
      const [uv, temperature, feelsLike, humidity, cloud, windU, windV, gust] = await Promise.all([
        readForecastPointSeries(uvTimeline(), state.point, 'uvIndex', 'refresh'),
        readForecastPointSeries(tempTimeline(), state.point, 'temperatureIndex', 'refresh'),
        readForecastPointSeries(feelsLikeTimeline(), state.point, 'feelsLikeIndex', 'refresh'),
        readForecastPointSeries(humidityTimeline(), state.point, 'humidityIndex', 'refresh'),
        readForecastPointSeries(cloudTimeline(), state.point, 'cloudIndex', 'refresh'),
        readForecastPointSeries(windUFrames(), state.point, 'windUIndex', 'refresh'),
        readForecastPointSeries(windVFrames(), state.point, 'windVIndex', 'refresh'),
        readForecastPointSeries(gustTimeline(), state.point, 'gustIndex', 'refresh'),
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
        setGustSeries(gust)
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
    const [uv, temperature, feelsLike, humidity, cloud, windU, windV, gust] = await Promise.all([
      readForecastPointSeries(uvTimeline(), state.point, 'uvIndex', 'L2'),
      readForecastPointSeries(tempTimeline(), state.point, 'temperatureIndex', 'L2'),
      readForecastPointSeries(feelsLikeTimeline(), state.point, 'feelsLikeIndex', 'L2'),
      readForecastPointSeries(humidityTimeline(), state.point, 'humidityIndex', 'L2'),
      readForecastPointSeries(cloudTimeline(), state.point, 'cloudIndex', 'L2'),
      readForecastPointSeries(windUFrames(), state.point, 'windUIndex', 'L2'),
      readForecastPointSeries(windVFrames(), state.point, 'windVIndex', 'L2'),
      readForecastPointSeries(gustTimeline(), state.point, 'gustIndex', 'L2'),
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
      setGustSeries(merge(gust))
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
      const [uv, temperature, feelsLike, humidity, cloud, windU, windV, gust] = await Promise.all([
        readPointSeries(uvTimeline(), state.point, undefined, priority, undefined, undefined, layer),
        readPointSeries(tempTimeline(), state.point, undefined, priority, undefined, undefined, layer),
        readPointSeries(feelsLikeTimeline(), state.point, undefined, priority, undefined, undefined, layer),
        readPointSeries(humidityTimeline(), state.point, undefined, priority, undefined, undefined, layer),
        readPointSeries(cloudTimeline(), state.point, undefined, priority, undefined, undefined, layer),
        readPointSeries(windUFrames(), state.point, undefined, priority, undefined, undefined, layer),
        readPointSeries(windVFrames(), state.point, undefined, priority, undefined, undefined, layer),
        readPointSeries(gustTimeline(), state.point, undefined, priority, undefined, undefined, layer),
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
      setGustSeries(gust)
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
      usage.mark('geo')
      map?.easeTo({ center: [coords.longitude, coords.latitude], duration: 450 })
      pick(coords.longitude, coords.latitude, 'Mijn locatie')
    }, () => setStatus('Locatietoegang geweigerd — tik op de kaart'), { timeout: 10_000 })
  }

  function chooseSearch(point: { lng: number; lat: number }, label: string): void {
    usage.mark('search')
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
    usage.mark('fav')
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
      element.append(savedPlaceStar.cloneNode(true))
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

  function tuneWind(tuning: WindTuning): void {
    setWindTuning(tuning)
    storeWindTuning(tuning)
  }

  let topInset: { size: string; top: number } | undefined
  function mapViewport(): Viewport {
    const width = mapElement.clientWidth
    const height = mapElement.clientHeight
    const size = `${width}x${height}`
    if (topInset?.size !== size) {
      topInset = { size, top: topOverlayInset() }
      mapElement.dataset.insetTop = String(topInset.top)
    }
    return { width, height, insets: { top: topInset.top, right: 0, bottom: 0, left: 0 } }
  }

  // De klok hangt midden aan de bovenrand (U21/U22), dus de Waddenkust moet eronder vandaan; de
  // zoekpil telt alleen mee als hij over de halve breedte ligt. Het merk rechtsboven dekt een hoek.
  function topOverlayInset(): number {
    const shell = mapElement.getBoundingClientRect()
    const overlays = [mapElement.parentElement?.querySelector('.map-clock'), mapElement.parentElement?.querySelector('.search-field')]
    let bottom = shell.top
    for (const overlay of overlays) {
      const box = overlay?.getBoundingClientRect()
      if (box && (overlay!.matches('.map-clock') || box.width >= shell.width / 2)) bottom = Math.max(bottom, box.bottom)
    }
    return Math.max(0, Math.round(bottom - shell.top + 4))
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

  function applyMapDetailLimit(): void {
    if (!map) return
    const latitude = map.getCenter().lat
    const circumferenceKm = 40_075.017 * Math.cos(latitude * Math.PI / 180)
    map.setMaxZoom(Math.log2(circumferenceKm * map.getContainer().clientWidth / (512 * MINIMUM_MAP_WIDTH_KM)))
  }

  /** ?dev: alle tuning-/debugwaarden terug naar default, zonder reload; favorieten, locatie, kaartview en thema blijven. */
  function resetAllSettings(): void {
    clearTuningStorage()
    batch(() => {
      setWindTuning({ ...DEFAULT_WIND_TUNING })
      setIsolineTuning({ ...DEFAULT_ISOLINE_TUNING })
      const pinned = focusPinned()
      if (pinned) toggleFocusPin(pinned)
    })
    window.clearTimeout(resetNoticeTimer)
    setResetNotice(true)
    resetNoticeTimer = window.setTimeout(() => setResetNotice(false), 2_500)
  }

  function replaySplash(): void {
    window.clearTimeout(splashReplayTimer)
    setMapReady(false)
    for (const animation of splashElement.getAnimations({ subtree: true })) animation.cancel()
    void splashElement.offsetWidth
    splashReplayTimer = window.setTimeout(() => setMapReady(true), 1_000)
  }

  function scrub(cursor: number): void {
    usage.mark('scrub')
    perf.markScrubInput()
    scrubPrefetch = true
    void completePointSeries(pointLoad, 'high')
    setCursor(cursor)
  }

  const manifestNow = () => manifest() ? Date.parse(manifest()!.now) : 0
  const forecast = createMemo(() => buildHourlyForecast({
    rain: timeline(),
    uv: uvTimeline(),
    uvClear: uvClearTimeline(),
    radiation: radiationTimeline(),
    temperature: tempTimeline(),
    feelsLike: feelsLikeTimeline(),
    humidity: humidityTimeline(),
    cloud: cloudTimeline(),
    windU: windUFrames(),
    windV: windVFrames(),
    gust: gustTimeline(),
  }, manifest() ? Date.parse(manifest()!.now) : 0))
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
  // Heldere-hemel-UV reist als eigen veld mee; net als de straling alleen de uurframes van de tabelrijen
  // (alle kwartieren decoderen zou de gedeelde framecache van 512 uit de puntreeksen drukken). De bytes
  // komen wel als één payload-Range binnen: losse frame-Ranges op dit kleine bestand kwamen warm opnieuw
  // over (perf.spec warm = 0 B). Pas na de initial-fase, om de eerste puntreeks niet te vertragen.
  let uvClearRequest = 0
  createEffect(() => {
    const point = location()
    const frames = uvClearTimeline()
    const stage = pointLoadStage()
    const all = stage === 'complete'
    const history = historyRowsWanted()
    const now = manifestNow()
    const indexes = forecast().flatMap((row) =>
      row.uvClearIndex == null || (!all && !isPassiveRow(row, now)) || (row.kind === 'past' && !history) ||
        solarElevationSin(row.epoch, point.lng, point.lat) <= 0 ? [] : [row.uvClearIndex])
    const request = ++uvClearRequest
    if (stage === 'initial' || !indexes.length) return
    void (async () => {
      await Promise.all([...new Set(indexes.map((index) => frames[index]!.chunk))].map((chunk) => client.fetchPayload(chunk)))
      const values = await readPointSeries(frames, point, indexes, 'low', undefined, undefined, 'L0')
      if (request === uvClearRequest) setUvClearSeries(values)
    })().catch(() => undefined)
  })
  // Wolkenlagen (U37; sinds U34 de eigen modus Wolken en de tabelkolom): pas na de initial-fase laden
  // (de eerste regenreeks gaat voor), als hele payload per chunk (16 km-raster, klein), lage prioriteit.
  const cloudsMayLoad = createMemo(() => pointLoadStage() !== 'initial')
  const cloudTimelines = createMemo(() => Object.fromEntries(CLOUD_LAYERS.map((layer) =>
    [layer, manifest() ? buildTimeline(manifest()!, `cloud_${layer}`) : []])) as Record<CloudLayer, TimelineFrame[]>)
  const [cloudValues, setCloudValues] = createSignal<Record<CloudLayer, Array<number | null>>>({ high: [], mid: [], low: [] })
  let cloudRequest = 0
  createEffect(() => {
    const point = location()
    const timelines = cloudTimelines()
    const request = ++cloudRequest
    if (!cloudsMayLoad()) return
    void Promise.all(CLOUD_LAYERS.map(async (layer) => {
      const frames = timelines[layer]
      await Promise.all([...new Set(frames.map((frame) => frame.chunk))].map((chunk) => client.fetchPayload(chunk)))
      return [layer, await readPointSeries(frames, point, undefined, 'low', undefined, undefined, 'L0')] as const
    })).then((layers) => {
      if (request === cloudRequest) setCloudValues(Object.fromEntries(layers) as Record<CloudLayer, Array<number | null>>)
    }).catch(() => undefined)
  })
  const cursorUv = createMemo(() => seriesValueAt(uvTimeline(), uvSeries(), selectedEpoch(), 30 * 60_000))
  const cursorUvReading = createMemo(() => {
    const point = location()
    const epoch = selectedEpoch()
    const row = forecast().find((candidate) => Math.abs(candidate.epoch - epoch) <= 30 * 60_000)
    const clear = row?.uvClearIndex == null ? null : uvClearSeries()[row.uvClearIndex] ?? null
    return uvReading(epoch, cursorUv(), clear, null, null, (at) => solarElevationSin(at, point.lng, point.lat), false)
  })
  const cursorUvChip = createMemo(() => uvChipLabel(cursorUv()))
  const hasTemperature = createMemo(() => feelsLikeTimeline().length > 0)
  const hasWeatherIcons = createMemo(() => cloudTimeline().length > 0)
  const hasHumidity = createMemo(() => humidityTimeline().length > 0)
  const hasWind = createMemo(() => windUFrames().length > 0 && windVFrames().length > 0)

  return <main class="app-shell">
    <section class="map-shell" aria-label="Regenkaart van Nederland" data-focus={focus().toFixed(2)} data-wind-focus={windFocus().toFixed(2)} data-wind-intensity={focusedWindTuning().intensity.toFixed(2)} data-isolines={isolineCount()} data-isobars={isobarCount()}>
      <div ref={mapElement} class="map" />
      <div ref={splashElement} class="map-splash" classList={{ ready: mapReady() }} aria-hidden={mapReady()}>
        <div class="map-splash-veil" />
        <div class="map-splash-mark">
          <img src="/droplet.svg" alt="" />
          <strong>motregen.nl</strong>
        </div>
      </div>
      <About theme={theme()} onTheme={(choice) => { usage.setTheme(choice); setTheme(choice) }}
        windUnit={windUnit()} onWindUnit={(unit) => { usage.setUnit(unit); setWindUnit(unit); localStorage.setItem('motregen-wind-unit', unit) }} onOpen={() => usage.mark('about')} onTripleTap={() => setPerfVisible((visible) => !visible)} sourcePrefix={
        <Show when={focus() > 0 && temperatureLegend()}>
          {(legend) => <span class="temperature-legend" style={{ opacity: focus() }} role="img" aria-label={`Kleurschaal gevoelstemperatuur ${legend().low} tot ${legend().high} graden`}>
            <span>{legend().low}°</span>
            <span class="temperature-legend-bar">{legend().bands.map((color) => <i style={{ background: color }} />)}</span>
            <span>{legend().high}°</span>
          </span>}
        </Show>
      } />
      <LocationSearch
        location={location()}
        mapCenter={() => map?.getCenter() ?? location()}
        locationLabel={locationLabel()}
        savedPlaces={savedPlaces()}
        onLocate={locate}
        onRemove={removeSavedPlace}
        onSave={saveCurrentPlace}
        onSelect={chooseSearch}
        onSelectSaved={chooseSaved}
      />
      <Show when={devMode}>
        <DevPanel
          isolineTuning={isolineTuning()}
          onIsolineTuning={(patch) => setIsolineTuning((current) => ({ ...current, ...patch }))}
          windTuning={windTuning()}
          onWindTuning={tuneWind}
          perfVisible={perfVisible()}
          onPerfVisible={setPerfVisible}
          onReplaySplash={replaySplash}
          onReset={resetAllSettings}
          resetNotice={resetNotice()}
          usageBody={usageBody()}
        />
      </Show>
      <Freshness mapEpoch={selectedEpoch()} mapFrame={timeline()[Math.round(cursor())]} manifest={manifest()} refresh={manifestRefresh()} onRefresh={refreshManifest} onOpen={pauseForFreshness} onClose={resumeAfterFreshness} />
    </section>
    <aside class="dashboard">
      <Show when={cursorUvChip()}>{(label) => <div class="sidebar-nav">
        <span class="uv-chip sidebar-uv-chip" data-level={uvLevel(cursorUv()!).key} title={cursorUvReading() ? `Insmeren aanbevolen · ${uvBarLabel(cursorUvReading()!)}` : 'Insmeren aanbevolen'}><Sun {...INLINE_ICON} /><span class="uv-long">{label()}</span><span class="uv-short">UV {formatUv(cursorUv())}</span><UvBar reading={cursorUvReading()} bare /></span>
      </div>}</Show>
      <HistogramScrubber
        timeline={timeline()}
        values={rainSeries()}
        loaded={rainLoaded()}
        cursor={cursor()}
        now={manifest() ? Date.parse(manifest()!.now) : 0}
        playing={playing()}
        loading={pointSeriesLoading()}
        loadStage={pointLoadStage()}
        locationLabel={status()}
        onCursor={scrub}
        onIntent={() => { void completePointSeries(pointLoad, 'high') }}
        onPlaying={setPlaying}
        onPlayPressed={() => usage.mark('play')}
        clouds={focusPinned() === 'clouds' ? { timeline: cloudTimelines(), values: cloudValues() } : undefined}
        cloudCover={focusPinned() ? undefined : { timeline: cloudTimeline(), values: cloudSeries() }}
      />
      <section class="forecast-panel">
        <div class="table-scroll">
          <ForecastTable
            rows={forecast()}
            series={{
              rain: rainSeries(), uv: uvSeries(), uvClear: uvClearSeries(), radiation: radiationSeries(), temperature: temperatureSeries(),
              feelsLike: feelsLikeSeries(), humidity: humiditySeries(), cloud: cloudSeries(), windU: windUSeries(), windV: windVSeries(), gust: gustSeries(),
            }}
            location={location()}
            windUnit={windUnit()}
            columns={{ weather: hasWeatherIcons(), uv: uvTimeline().length > 0 || radiationTimeline().length > 0, temperature: hasTemperature(), humidity: hasHumidity(), clouds: cloudTimelines().low.length > 0, wind: hasWind() }}
            cloudLayers={(epoch) => {
              const values = cloudValues()
              const timelines = cloudTimelines()
              const at = (layer: CloudLayer) => seriesValueAt(timelines[layer], values[layer], epoch, 30 * 60_000)
              return { high: at('high'), mid: at('mid'), low: at('low') }
            }}
            loadedUntil={pointLoadStage() === 'complete' ? Number.POSITIVE_INFINITY : manifestNow() + PASSIVE_FORECAST_HOURS * 3_600_000}
            historyInline={historyInline()}
            historyOpen={historyOpen()}
            historyLoaded={historyRowsWanted() || pointLoadStage() === 'complete'}
            onNeedRows={() => { void completePointSeries(pointLoad, 'high') }}
            onNeedHistory={() => { void loadHistoryRows() }}
            onOpenHistory={() => {
              if (!historyOpen()) usage.mark('history')
              setHistoryOpen((open) => !open)
              void loadHistoryRows()
            }}
            focus={{ pinned: focusPinned(), onTogglePin: toggleFocusPin, onFocus: (mode, source, active) => {
              if (mode === 'temperature' && source === 'table' && active) usage.mark('hover')
              focusMode.set(mode, source, active)
            } }}
          />
        </div>
      </section>
    </aside>
    <Show when={perfVisible()}><PerfHud monitor={perf} isolines={isolineCounters} windStats={() => windLayer?.windProfile()} /></Show>
  </main>
}

function storedWindUnit(): WindUnit {
  const stored = localStorage.getItem('motregen-wind-unit')
  return WIND_UNITS.find((unit) => unit === stored) ?? 'bft'
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

// Zoomgrens: nooit minder dan deze breedte in beeld (Min. breedte, T3g; knop weg in U30).
const MINIMUM_MAP_WIDTH_KM = 20

function project(lng: number, lat: number): [number, number] {
  const radius = 6378137
  return [lng * Math.PI / 180 * radius, Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * radius]
}

