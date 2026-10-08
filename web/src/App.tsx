import { batch, createEffect, createMemo, createSignal, onCleanup, onMount, Show, untrack, type Accessor, type Setter } from 'solid-js'
import maplibregl, { Marker, type GeoJSONSource } from 'maplibre-gl'
import { registerSW } from 'virtual:pwa-register'
import About, { type ThemeChoice } from './components/About'
import HistogramScrubber from './components/HistogramScrubber'
import { INLINE_ICON, Star, Sun } from './components/icons'
import LocationSearch from './components/LocationSearch'
import Freshness from './components/Freshness'
import ClockFace from './components/ClockFace'
import { formatTime, formatWeekdayShort } from './core/locale'
import PerfHud from './components/PerfHud'
import type { IsolineCounters } from './core/perf'
import ForecastTable from './components/ForecastTable'
import UvBar, { uvBarLabel } from './components/UvBar'
import DevPanel from './components/DevPanel'
import { loadBasemapStyle, temperatureLayerBeforeId, type MapTheme } from './core/basemap'
import { chunkField, type Grid, type Manifest, type ManifestChunk, type MrfHeader, type TimelineFrame } from './core/contract'
import { DayNightLayer } from './core/day-night-layer'

const DAY_NIGHT_ENABLED = false
import { buildHourlyForecast, hourDarkness, isPassiveRow, PASSIVE_FORECAST_HOURS, skyRadiationRows, type HourSky } from './core/forecast'
import { contextOpacity, DEFAULT_FOCUS_MODE, FOCUS_DIM, FocusMode, mapSaturation, rainFocusOpacity, type FocusKind, windFocusIntensity } from './core/focus-mode'
import { FrameBatcher } from './core/frame-batcher'
import { latestRadarEpoch, type RefreshState } from './core/freshness'
import { adaptiveIsobarStep, PRESSURE_EXTREMUM_KM, pressureExtrema, blendFrames, blurField, DEFAULT_ISOLINE_TUNING, fieldRangeInView, ISOBAR_STEP_HPA, isolineBlurPasses, isolineFrameWeights, type WeightedFrame, ISOLINE_EDGE_FADE_MS, ISOLINE_FILL_OPACITY, ISOLINE_GRADIENT, ISOLINE_RING_KM, ISOLINE_WINDOW, isolineColor, IsolineWorker, type IsolineFeatureCollection, type IsolineKind, type IsolineTuning } from './core/isolines'
import { IsolineLabels } from './core/isoline-labels'
import { sliceWeights } from './core/isoline-spline'
import { TraceCore } from './core/isoline-tracer'
import { prepareField, type PreparedField } from './core/isoline-field'
import { hexColor, IsolineLayer, isolineLayerIndices, type IsolineStyle } from './core/isoline-layer'
import { cursorAfterTimelineRefresh, isNewerManifest, nextManifestRefreshDelay, reconcileTimelineSeries, scheduleManifestRefresh } from './core/manifest-refresh'
import { constrainView, containView, containZoom, MAP_CONTAIN_BOUNDS, type Viewport } from './core/map-constraint'
import { mapFrameFromGrid, NETHERLANDS_FLANDERS_BOUNDS } from './core/map-frame'
import { browserDeviceHints, decodeBudget } from './core/decode-budget'
import { MrfClient, type MotionField } from './core/mrf'
import { selectPairMotion } from './core/motion-selection'
import { nearestPlace } from './core/places'
import { startFrameLoop } from './core/playback'
import { clampPlaybackCursor, playbackReach } from './core/playback-gate'
import { configurePerfMode, consumeColdProfile, installPerfMonitor, measurePerfPhase, PERF_COLD_STORAGE_KEY, PERF_STORAGE_KEY, perfPhasesEnabled, recordPerfPhase, type LoadLayer } from './core/perf'
import type { ProfileRecording } from './core/profile-recorder'
import { RainLayer } from './core/rain-layer'
import { LayerOverlay } from './core/overlay-canvas'
import { grantedStartFix, loadLastSavedPlaceId, loadMapView, resolveStartLocation, storeLastSavedPlaceId, storeMapView } from './core/location-memory'
import { attachPinNavigation, PAN_ZOOM_ONLY, PIN_EDGE_MARGIN, restrictMapGestures } from './core/pin-navigation'
import { loadSavedPlaces, savedPlaceId, samePlace, storeSavedPlaces, type SavedPlace } from './core/saved-places'
import { sunnyLocations, SUN_ICONS_ENABLED, type FieldBlend, type SunFeatureCollection } from './core/sun'
import { isSunUp, solarElevationSin } from './core/solar'
import { paletteRange, paletteStops, type PaletteRange } from './core/temperature-palette'
import { selectTemperaturePlaces, temperatureLabelSpacingPx, temperatureLabels, temperatureLayer, type TemperatureFeatureCollection } from './core/temperature'
import { buildTimeline, epochInWindow, frameBlend, scrubberViewWindow, seriesValueAt, timelineCoverage, timelineCursorAtEpoch, timelineEpochAtCursor, timelineHorizonEnd, timelineIndexesInWindow, timelinePlaybackRate, type EpochWindow } from './core/time-model'
import { formatUv, uvChipLabel, uvLevel, uvReading } from './core/uv'
import { WIND_UNITS, type WindUnit } from './core/weather'
import { buildWindTimeline, sameGrid, zipWindFrame, type WindTimelineFrame } from './core/wind'
import { DEFAULT_WIND_TUNING, loadWindTuning, MOBILE_WIND_LEVELS, storeWindTuning, WIND_MAX_FPS, WIND_PARAMETERS, WindLayer, type MobileWindLevel, type WindTuning } from './core/wind-layer'
import { clearTuningStorage } from './core/dev-settings'
import { watchIdle } from './core/activity'
import { CLOUD_LAYERS, type CloudLayer } from './core/cloud-section'
import { browserUsageEnvironment, createUsageTracker, installUsageBeacon, sessionManifestUrls } from './core/usage'
import { copyText } from './core/clipboard'
import { resolveLocation, suggestLocations } from './core/geocoder'
import { applyPresetParams, cursorForPresetEpoch, modeForActiveFocus, modeForFocus, parsePresets, shareUrl } from './core/presets'
import { applyTelegramColors, type TelegramWebApp } from './core/telegram'
import { loadExpressive, storeExpressive } from './core/expressive'
import { READY_WINDOW_MS, windowReady } from './core/window-ready'
import { visibleSlotStates } from './core/screen-truth'
import type { Intent } from './core/intent'

const manifestUrl = new URL('/data/manifest.json', location.href)
const manifestRequestUrl = sessionManifestUrls(manifestUrl)
const profileMode = configurePerfMode(new URL(location.href), localStorage)
const coldProfileRequested = consumeColdProfile(localStorage)
const perf = installPerfMonitor()
perf.setDetailedEnabled(profileMode)
const defaultLocation = { lng: 5.18, lat: 52.1, label: 'De Bilt' }
// Intent (MIP-20): velden die de kaart of de scrubber in een van de modi tekent; de straling hoort
// erbij omdat ze de hemel achter de scrubber kleurt (U62). Na deze rust geldt de scrubber als stilstaand.
const SHOWN_FIELDS: ReadonlySet<string> = new Set(['rain_rate', 'motion', 'uv', 'uv_clear', 'radiation', 'cloud_low', 'cloud_mid', 'cloud_high', 'cloud_frac', 'wind_u_ms', 'wind_v_ms', 'gust_ms', 'pressure_hpa', 'feels_like_c', 'temp_c'])
const SCRUB_REST_MS = 250
// Duur van de tween waarmee de tabelpiep onder de kaart naar het cursoruur schuift.
const TABLE_FOLLOW_MS = 220
// Puntreeksen komen per frame binnen; elke publicatie loopt door scrubber, tabel en hemel. Per animatieframe
// publiceren gaf tijdens het laden lange frames van ~0,8 s per seconde (prof:capture mobile-4g 2026-10-07);
// vier keer per seconde vult de grafiek nog zichtbaar aan.
const SERIES_PUBLISH_INTERVAL_MS = 250
type PointLoadStage = 'initial' | 'direct' | 'window' | 'complete'
type FetchPriority = 'high' | 'low'
type ForecastIndex = 'radiationIndex' | 'uvIndex' | 'temperatureIndex' | 'feelsLikeIndex' | 'cloudIndex' | 'windUIndex' | 'windVIndex' | 'gustIndex'
type TableSeriesKey = Exclude<ForecastIndex, 'radiationIndex'>

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
  /** Frame-identiteiten van de tijdlijn, één keer per tijdlijn opgebouwd i.p.v. per afspeeltik. */
  frameKeys: { frames: TimelineFrame[]; keys: string[] }
  labelCache: Map<string, Promise<IsolineFeatureCollection | undefined>>
}

function isolineSet(config: IsolineSetConfig): IsolineSet {
  return { ...config, layerKey: '', labelRounds: 0, fields: [], time: 0, key: '', shownRequest: 0, prepared: new Map(), frameKeys: { frames: [], keys: [] }, labelCache: new Map() }
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
  /** Tabelreeksen die nog laden, met de tijdlijn waarop hun indexen slaan; zie publishLoadedSeries. */
  loading: Map<TableSeriesKey, { frames: TimelineFrame[]; values: Array<number | null> }>
  seriesPublisher?: FrameBatcher
}
const emptyTemperatureData: TemperatureFeatureCollection = { type: 'FeatureCollection', features: [] }
const emptySunData: SunFeatureCollection = { type: 'FeatureCollection', features: [] }

// Bewolkingssluier (PO 2026-09-25 live, U34): dekking loopt op van 15 % naar 95 % bewolking; de stap
// voedt alleen de (onzichtbare) contourpas.
const CLOUD_VEIL_OPACITY = 0.55
const CLOUD_VEIL_RANGE = [15, 95] as const
const CLOUD_VEIL_STEP = 25
const CITY_TEMPERATURE_STEP_MS = 10 * 60_000
// Isobaren op een derde van ISOLINE_LINE_OPACITY (0,8) (PO 2026-09-25, MIP-14).
const ISOBAR_LINE_OPACITY = 0.27
// Temperatuurlijnen half zo zichtbaar als ISOLINE_LINE_OPACITY (0,8) (PO 2026-09-25 live, U34).
const TEMPERATURE_LINE_OPACITY = 0.4
// Terugglijden aan het eind van een afspeelrondje (PO 2026-09-25 live, U34).
const PLAYBACK_REWIND_MS = 700
const PLAYBACK_END_HOLD_MS = 2_000
const PLAYBACK_TEMPO_HOURS = 8
const TABLE_JUMP_RESUME_MS = 4_000
// Zoveel px van de tabelrijen moet in beeld zijn voordat hun reeksen laden (U49): in het mobiele
// startbeeld steekt de eerste rij 2 px boven de onderrand uit, en dat is nog geen lezen.
const TABLE_PEEK_PX = 24
// Hoger dan een ingeklapte adresbalk (Android Chrome ~56 px, iOS Safari ~100 px): staat de pagina aan haar
// einde en steekt er hooguit zoveel boven het tabelpaneel uit, dan is dat de tabelview — verder komt hij niet.
const TABLE_SNAP_SLACK_PX = 120
// H/L van twee opeenvolgende uren horen bij elkaar als ze binnen deze afstand liggen.
const PRESSURE_MATCH_KM = 300
// Afspelen tikt op 30 Hz: regen-tween, isolijnsnede en klok zijn traag genoeg; alleen de
// windpartikels animeren op WIND_MAX_FPS in hun eigen lus (U41).
const PLAYBACK_MAX_FPS = 30
// Zo lang wacht afspelen op één ontbrekend frame; daarna loopt de cursor door zoals vóór de
// speelregel, zodat een frame dat nooit komt de tijdlijn niet voorgoed stilzet.
const PLAYBACK_FRAME_WAIT_MS = 3_000
// Zo ver vóór de cursor vraagt de afspeellus zelf een ontbrekend frame op: het volgende en dat daarna.
const PLAYBACK_WAIT_AHEAD_FRAMES = 2
// Rig-schakelaar (?dev): 'venster' zet de oude regel terug (spelen pas na laadfase "window").
const PLAY_RULE_STORAGE_KEY = 'motregen-dev-speelregel'
// Rig-schakelaar (?dev): 'laat' vraagt het eerste regenframe weer pas na de kaart-opzet.
const FIRST_RAIN_STORAGE_KEY = 'motregen-dev-eerste-regen'
// PO-vergelijking (?dev): het lege scrubber-kader neemt de hemelkleur van het uur aan.
const FRAME_SKY_STORAGE_KEY = 'motregen-dev-kaderhemel'
const CLOCK_SKY_TINT_STORAGE_KEY = 'motregen-dev-klokpil'
const MOBILE_WIND_STORAGE_KEY = 'motregen-dev-wind-mobiel'
// Stil op de achtergrond (U41): na een minuut zonder invoer tekent de wind op halve snelheid.
const IDLE_AFTER_MS = 60_000
const WIND_IDLE_FPS = 30

function basemapTileKey(event: { sourceId?: string; tile?: { tileID?: { key?: string; canonical?: { z?: number; x?: number; y?: number } } } }): string | undefined {
  if (!event.sourceId || event.sourceId.startsWith('motregen-') || !event.tile) return undefined
  const id = event.tile.tileID
  const canonical = id?.canonical
  const tile = id?.key ?? (canonical ? `${canonical.z}/${canonical.x}/${canonical.y}` : undefined)
  return tile === undefined ? undefined : `${event.sourceId}:${tile}`
}

export default function App(props: { telegram?: TelegramWebApp } = {}) {
  const devMode = new URLSearchParams(window.location.search).has('dev')
  const stillMode = new URLSearchParams(window.location.search).get('still') === '1'
  // De adresbalk wordt later live bijgeschreven (permalink); de presets komen uit de zoekstring van het begin.
  const initialSearch = window.location.search
  const initialPresets = parsePresets(initialSearch)
  let mapElement!: HTMLDivElement
  let splashElement!: HTMLDivElement
  let forecastPanelElement!: HTMLElement
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
  let frameLoopDrives = false
  let mapRepaints = 0
  const basemapTiles = new Map<string, number>()
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
  if (stillMode) {
    const stillWindow = window as unknown as {
      __motregenStillMapLoaded: () => boolean
      __motregenRenderFrame: (epoch: number, simulationMs?: number) => Promise<void>
    }
    stillWindow.__motregenStillMapLoaded = () => Boolean(map?.loaded())
    stillWindow.__motregenRenderFrame = renderStillFrame
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
  let temperatureInput = ''
  let temperaturePending = ''
  let temperatureTick: { frames: TimelineFrame[]; stepEpoch: number; zoom: number; width: number; height: number } | undefined
  let sunFeatureKey = ''
  let sunEpochBucket = Number.NaN
  let rainReadyPending = false
  let scrubPrefetch = false
  let initialPickStarted = false
  const playRuleWaitsForWindow = devMode && localStorage.getItem(PLAY_RULE_STORAGE_KEY) === 'venster'
  const [firstRainLate, setFirstRainLate] = createSignal(devMode && localStorage.getItem(FIRST_RAIN_STORAGE_KEY) === 'laat')
  // Bij het laden vastgelegd: de knop werkt pas na herladen.
  const firstRainEarly = !firstRainLate()
  let pointLoad: PointLoadState | undefined
  const windFrameCache = new Map<string, Promise<Float32Array>>()
  const media = matchMedia('(prefers-color-scheme: dark)')
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)')
  const decode = decodeBudget(browserDeviceHints())
  // Krap apparaat (U49): puntreeksen alleen voor wat scrubber en tabel nu tonen, niet vooruit.
  const inViewOnly = decode.pointSeries === 'in-view'
  const client = new MrfClient(manifestUrl, perf.loads, decode)
  const [manifest, setManifest] = createSignal<Manifest>()
  const [manifestRefresh, setManifestRefresh] = createSignal<RefreshState>()
  const timeline = createMemo(() => manifest() ? buildTimeline(manifest()!) : [])
  const radiationTimeline = createMemo(() => manifest() ? buildTimeline(manifest()!, 'radiation') : [])
  const uvTimeline = createMemo(() => manifest() ? buildTimeline(manifest()!, 'uv') : [])
  const uvClearTimeline = createMemo(() => manifest() ? buildTimeline(manifest()!, 'uv_clear') : [])
  const tempTimeline = createMemo(() => manifest() ? buildTimeline(manifest()!, 'temp_c') : [])
  const feelsLikeTimeline = createMemo(() => manifest() ? buildTimeline(manifest()!, 'feels_like_c') : [])
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
  const [playing, setPlaying] = createSignal(!stillMode)
  // Tempo van gelijkmatig afspelen (epoch-ms per ms) voor de scrubberbaan; 0 tijdens terugglijden.
  const [glideRate, setGlideRate] = createSignal(0)
  // Afspelen loopt door de hele tijdlijn (PO 2026-09-25 live; was +8 u, restant van de bereikknoppen).
  const [timeHorizonHours] = createSignal<number | null>(null)
  const initialSavedPlaces = stillMode ? [] : loadSavedPlaces()
  const initialMapView = stillMode || initialPresets.point ? undefined : loadMapView()
  let startLocation = initialPresets.point
    ? { ...initialPresets.point, label: nearestPlace(initialPresets.point.lng, initialPresets.point.lat).name }
    : resolveStartLocation(initialSavedPlaces, loadLastSavedPlaceId(), initialMapView, defaultLocation)
  let startFromFix = false
  const [location, setLocation] = createSignal({ lng: startLocation.lng, lat: startLocation.lat })
  const [locationLabel, setLocationLabel] = createSignal(startLocation.label)
  // Verleende locatietoestemming gaat vóór de onthouden plaats (U26); tot de fix er is staat die er.
  void grantedStartFix({ permissions: navigator.permissions, geolocation: navigator.geolocation }, MAP_CONTAIN_BOUNDS).then((fix) => {
    if (stillMode) return
    // Een gedeeld punt of een andere plaats dan waar we al staan gaat vóór de locatiefix; de eigen
    // permalink (?plaats= van de huidige plaats) niet.
    if (initialPresets.point) return
    if (initialPresets.place && initialPresets.place.trim().toLowerCase() !== startLocation.label.trim().toLowerCase()) return
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
  const [cloudSeries, setCloudSeries] = createSignal<Array<number | null>>([])
  const [windUSeries, setWindUSeries] = createSignal<Array<number | null>>([])
  const [windVSeries, setWindVSeries] = createSignal<Array<number | null>>([])
  const [gustSeries, setGustSeries] = createSignal<Array<number | null>>([])
  const [radiationSeries, setRadiationSeries] = createSignal<Array<number | null>>([])
  const [uvClearSeries, setUvClearSeries] = createSignal<Array<number | null>>([])
  // De tabelvelden die als puntreeks per locatie laden; `field` is de naam in het meetpunt window-ready.
  const tableSeries: Array<{ key: TableSeriesKey; field: string; frames: Accessor<TimelineFrame[]>; values: Accessor<Array<number | null>>; set: Setter<Array<number | null>> }> = [
    { key: 'uvIndex', field: 'uv', frames: uvTimeline, values: uvSeries, set: setUvSeries },
    { key: 'temperatureIndex', field: 'temp_c', frames: tempTimeline, values: temperatureSeries, set: setTemperatureSeries },
    { key: 'feelsLikeIndex', field: 'feels_like_c', frames: feelsLikeTimeline, values: feelsLikeSeries, set: setFeelsLikeSeries },
    { key: 'cloudIndex', field: 'cloud_frac', frames: cloudTimeline, values: cloudSeries, set: setCloudSeries },
    { key: 'windUIndex', field: 'wind_u', frames: windUFrames, values: windUSeries, set: setWindUSeries },
    { key: 'windVIndex', field: 'wind_v', frames: windVFrames, values: windVSeries, set: setWindVSeries },
    { key: 'gustIndex', field: 'gust_ms', frames: gustTimeline, values: gustSeries, set: setGustSeries },
  ]
  // Vanaf de eerste locatiekeuze (direct na de eerste regen-draw) mogen alle puntreeksen laden.
  const [pointLoadsStarted, setPointLoadsStarted] = createSignal(false)
  // Portrait mobile keeps history mounted above Nu so switching views only changes scrolling,
  // never the table's contents; other layouts still load it on demand.
  const [historyRowsWanted, setHistoryRowsWanted] = createSignal(false)
  let forecastPanel: HTMLElement | undefined
  const [tableInView, setTableInView] = createSignal(!inViewOnly)
  onMount(() => {
    // De rijen, niet het paneel: op een telefoon staat de kolomkop al in beeld terwijl de rijen
    // nog onder de vouw liggen.
    const rows = forecastPanel?.querySelector('tbody')
    if (!inViewOnly || !rows) return
    const observer = new IntersectionObserver((entries) => setTableInView(entries.some((entry) => entry.isIntersecting)), { rootMargin: `0px 0px -${TABLE_PEEK_PX}px 0px` })
    observer.observe(rows)
    onCleanup(() => observer.disconnect())
  })
  const [historyOpen, setHistoryOpen] = createSignal(false)
  // Desktop: historie staat in de tabel boven de nu-rij; touch houdt de uitklaprij (scrollen in een
  // eigen tabelscroller onder de sticky scrubber werkt daar niet prettig).
  const inlineHistoryMedia = matchMedia('(min-width: 960px) and (pointer: fine)')
  const [historyInline, setHistoryInline] = createSignal(inlineHistoryMedia.matches)
  const tableViewMedia = matchMedia('(max-width: 959px) and (orientation: portrait)')
  const [tableViewAvailable, setTableViewAvailable] = createSignal(tableViewMedia.matches)
  // De view is pas open na een afgeronde snap; de live dekking stuurt tijdens de gesture alleen
  // de dure kaartlussen, met de afgesproken 0/24px-hysterese.
  const [tableOpen, setTableOpen] = createSignal(false)
  const [tableScrollOpen, setTableScrollOpen] = createSignal(false)
  const [tableCoversViewport, setTableCoversViewport] = createSignal(false)
  const [tableViewTarget, setTableViewTarget] = createSignal<'map' | 'table'>()
  const tableViewOpen = createMemo(() => tableViewAvailable() && tableOpen())
  const tableModeSelected = createMemo(() => tableViewAvailable() && (tableViewTarget() === 'table' || (tableViewTarget() === undefined && tableOpen())))
  // Op een telefoon steken er een paar tabelrijen onder de kaart uit. Dat is "in beeld", maar geen
  // vraag om de hele tabel: zolang de tabel dicht is laden alleen de rijen die echt te zien zijn
  // (rig mobile-4g koud, 2026-10-07: 297 → 128 decodes).
  const [peekRows, setPeekRows] = createSignal<ReadonlySet<number>>(new Set(), { equals: (left, right) => left.size === right.size && [...left].every((epoch) => right.has(epoch)) })
  const tablePeeking = createMemo(() => inViewOnly && tableViewAvailable() && !tableModeSelected() && !tableCoversViewport())
  const tableRowShown = (row: { epoch: number }) => tableInView() && (!tablePeeking() || peekRows().has(row.epoch))
  let tableViewFrame: number | undefined
  let tableViewResizeTimer: number | undefined
  let tableViewSettleTimer: number | undefined
  let tableTouchActive = false
  function applyTableScrollOpen(open: boolean): void {
    if (tableScrollOpen() === open) return
    setTableScrollOpen(open)
  }
  function syncTableViewPosition(): void {
    tableViewFrame = undefined
    if (!tableViewAvailable() || !forecastPanelElement) {
      setTableCoversViewport(false)
      return
    }
    const panelTop = forecastPanelElement.getBoundingClientRect().top
    if (!tableCoversViewport() && (panelTop <= 0 || tableSnappedAtPageEnd(panelTop))) setTableCoversViewport(true)
    else if (tableCoversViewport() && panelTop > 24) setTableCoversViewport(false)
  }
  function tableSnappedAtPageEnd(panelTop: number): boolean {
    const atPageEnd = window.scrollY >= document.documentElement.scrollHeight - window.innerHeight - 2
    return atPageEnd && panelTop > 0 && panelTop <= TABLE_SNAP_SLACK_PX
  }
  function queueTableViewSync(): void {
    if (tableViewFrame === undefined) tableViewFrame = requestAnimationFrame(syncTableViewPosition)
  }
  function settleTableView(): void {
    if (tableTouchActive || !tableViewAvailable() || !forecastPanelElement) return
    if (tableViewFrame !== undefined) cancelAnimationFrame(tableViewFrame)
    syncTableViewPosition()
    const panelTop = forecastPanelElement.getBoundingClientRect().top
    const atTable = Math.abs(panelTop) <= 2 || tableSnappedAtPageEnd(panelTop)
    const atMap = window.scrollY <= 2
    if (!atTable && !atMap) return
    const open = atTable
    setTableCoversViewport(open)
    setTableOpen(open)
    applyTableScrollOpen(open)
    setTableViewTarget(undefined)
  }
  function scheduleTableViewSettlement(delay = 160): void {
    window.clearTimeout(tableViewSettleTimer)
    tableViewSettleTimer = window.setTimeout(() => {
      tableViewSettleTimer = undefined
      settleTableView()
    }, delay)
  }
  function pageScrolled(): void {
    queueTableViewSync()
    scheduleTableViewSettlement()
  }
  function settleTableViewAfterResize(): void {
    // Mobiele browserbalken sturen tijdens hun animatie iedere frame een resize-event.
    window.clearTimeout(tableViewResizeTimer)
    tableViewResizeTimer = window.setTimeout(() => {
      queueTableViewSync()
      scheduleTableViewSettlement()
    }, 120)
  }
  const [status, setStatus] = createSignal('Regen laden…')
  const [theme, setTheme] = createSignal<ThemeChoice>(stillMode ? 'light' : props.telegram?.colorScheme ?? storedTheme())
  const [windUnit, setWindUnit] = createSignal<WindUnit>(storedWindUnit())
  const [expressive, setExpressive] = createSignal(loadExpressive())
  const usage = createUsageTracker(browserUsageEnvironment(), theme(), windUnit())
  if (!stillMode) onCleanup(installUsageBeacon(usage, document, window))
  const [usageBody, setUsageBody] = createSignal(JSON.stringify(usage.sessionBody()))
  if (devMode) {
    usage.onChange = () => setUsageBody(JSON.stringify(usage.sessionBody()))
    // De duurbak loopt vanzelf door; alleen onder ?dev.
    const usageTicker = window.setInterval(usage.onChange, 5_000)
    onCleanup(() => window.clearInterval(usageTicker))
  }
  const [windTuning, setWindTuning] = createSignal<WindTuning>(loadWindTuning())
  const [isolineTuning, setIsolineTuning] = createSignal<IsolineTuning>({ ...DEFAULT_ISOLINE_TUNING })
  const [frameSky, setFrameSky] = createSignal(devMode && localStorage.getItem(FRAME_SKY_STORAGE_KEY) === 'aan')
  const [clockSkyTint, setClockSkyTint] = createSignal(devMode && localStorage.getItem(CLOCK_SKY_TINT_STORAGE_KEY) === 'mee-tinten')
  const storedMobileWind = devMode ? localStorage.getItem(MOBILE_WIND_STORAGE_KEY) : null
  const [mobileWind, setMobileWind] = createSignal<MobileWindLevel>(storedMobileWind === 'iets' || storedMobileWind === 'meer' ? storedMobileWind : 'uit')
  // De proefniveaus gelden alleen waar de PO de streepjes te subtiel vond: vinger als aanwijsmiddel of een smal scherm.
  const mobileWindDevice = matchMedia('(pointer: coarse), (max-width: 499px)').matches
  const [temperatureRange, setTemperatureRange] = createSignal<PaletteRange | undefined>()
  let temperatureRangeKey = ''
  const [focus, setFocus] = createSignal(0)
  const [windFocus, setWindFocus] = createSignal(0)
  const [airFocus, setAirFocus] = createSignal(0)
  const [isobarStep, setIsobarStep] = createSignal(ISOBAR_STEP_HPA)
  const viewWindow = createMemo(() => scrubberViewWindow(selectedEpoch()), undefined, { equals: (left, right) => left.start === right.start && left.end === right.end })
  // Eén afbreeksignaal per venster: wat voor het vorige venster nog op een worker wacht en in het
  // nieuwe niet meer voorkomt, wordt niet meer gedecodeerd. Pas na de huidige tik afbreken, zodat
  // de effecten hieronder hun nieuwe vraag eerst stellen en overlappende frames blijven staan.
  const viewDemand = createMemo<AbortController>((previous) => {
    viewWindow()
    location()
    if (previous) queueMicrotask(() => previous.abort())
    return new AbortController()
  })
  // Tijdlijn-ms per ms tijdens slepen of toetsen; valt terug naar 0 zodra de scrubber stilstaat.
  const [scrubVelocity, setScrubVelocity] = createSignal(0)
  let lastScrub: { epoch: number; at: number } | undefined
  let scrubRest: number | undefined
  onCleanup(() => window.clearTimeout(scrubRest))
  // Tabelvelden die de scrubber zelf tekent: de UV-chip altijd, wind en temperatuur in hun modus.
  const scrubberSeries = createMemo(() => {
    const keys = new Set<ForecastIndex>(['uvIndex'])
    if (windFocus() > 0) for (const key of ['windUIndex', 'windVIndex', 'gustIndex'] as const) keys.add(key)
    if (focus() > 0) for (const key of ['feelsLikeIndex', 'temperatureIndex'] as const) keys.add(key)
    return keys
  }, undefined, { equals: (left, right) => left.size === right.size && [...left].every((key) => right.has(key)) })
  const [isolineCount, setIsolineCount] = createSignal(0)
  const focusMode = new FocusMode<FocusKind>(['weather', 'air', 'temperature', 'wind'], DEFAULT_FOCUS_MODE, (mode, value) => {
    if (mode === 'air') setAirFocus(value)
    else if (mode === 'wind') setWindFocus(value)
    else if (mode === 'temperature') setFocus(value)
  },
    () => reducedMotion.matches)
  const [focusPinned, setFocusPinned] = createSignal<FocusKind>(focusMode.pinned())
  const [isobarCount, setIsobarCount] = createSignal(0)
  // Niet-reactief op de cursor: de frame-loop zet de dekking per tik (U41).
  const isolineCoverage = () => untrack(() => timelineCoverage(feelsLikeTimeline(), selectedEpoch(), ISOLINE_EDGE_FADE_MS))
  const pressureTimeline = createMemo(() => manifest() ? buildTimeline(manifest()!, 'pressure_hpa') : [])
  const isobarCoverage = () => untrack(() => timelineCoverage(pressureTimeline(), selectedEpoch(), ISOLINE_EDGE_FADE_MS))
  const temperatureIsolines = isolineSet({
    kind: 'temperature', layerId: 'motregen-isolines', timeline: feelsLikeTimeline, focus, active: createMemo(() => focus() > 0),
    step: () => isolineTuning().step, style: isolineStyle, labelFade, coverage: isolineCoverage, setCount: setIsolineCount,
  })
  // Isobaren (U35): pas bij de eerste windfocus opgehaald, dus de cold start blijft gelijk.
  const pressureIsolines = isolineSet({
    kind: 'pressure', layerId: 'motregen-isobars', timeline: pressureTimeline, focus: windFocus, active: createMemo(() => windFocus() > 0),
    step: isobarStep, style: isobarStyle, labelFade: () => undefined, coverage: isobarCoverage, setCount: setIsobarCount,
  })
  // Bewolkingssluier (PO 2026-09-25 live, U34): cloud_frac als zachte grijswitte vulling, zonder lijnen of
  // labels, alleen in de modus Lucht en pas dan geladen. Wijkt af van MIP-4 ronde 3 ("nooit als kaartlaag").
  const cloudIsolines = isolineSet({
    kind: 'cloud', layerId: 'motregen-cloud-veil', timeline: cloudTimeline, focus: airFocus, active: createMemo(() => airFocus() > 0),
    step: () => CLOUD_VEIL_STEP, style: cloudVeilStyle, labelFade: () => undefined, coverage: () => untrack(() => timelineCoverage(cloudTimeline(), selectedEpoch(), ISOLINE_EDGE_FADE_MS)), setCount: () => undefined,
  })
  const isolineSets = [temperatureIsolines, pressureIsolines, cloudIsolines]
  // Verborgen tab: afspelen en wind staan stil (zichtbaarheid 0 stopt de windlus; de trails blijven).
  const [pageVisible, setPageVisible] = createSignal(document.visibilityState !== 'hidden')
  const mapRendering = createMemo(() => pageVisible() && !(tableViewAvailable() && tableCoversViewport()))
  const [userIdle, setUserIdle] = createSignal(false)
  const focusedWindTuning = createMemo(() => {
    const mobile = MOBILE_WIND_LEVELS[mobileWindDevice ? mobileWind() : 'uit']
    return {
      ...windTuning(),
      // De versterking geldt voor de wind op de achtergrond; bij volle windfocus staat hij al voluit.
      intensity: windFocusIntensity(windTuning().intensity, windFocus()) * (1 + (mobile.intensityGain - 1) * (1 - windFocus())),
      narrowLineFactor: mobile.narrowLineFactor,
      seaPenalty: mobile.seaPenalty,
      visibility: mapRendering() ? WIND_PARAMETERS.visibility * contextOpacity(focus(), FOCUS_DIM) : 0,
      maxFps: userIdle() ? WIND_IDLE_FPS : WIND_MAX_FPS,
    }
  })
  const [mapReady, setMapReady] = createSignal(false)
  const [resetNotice, setResetNotice] = createSignal(false)
  let resetNoticeTimer: number | undefined
  const [updateReady, setUpdateReady] = createSignal(false)
  let updateServiceWorker: (() => Promise<void>) | undefined
  const [shareNotice, setShareNotice] = createSignal<string>()
  let shareNoticeTimer: number | undefined
  const [perfVisible, setPerfVisible] = createSignal(profileMode)
  const [profileState, setProfileState] = createSignal<'idle' | 'recording' | 'ready' | 'error'>('idle')
  const [profileRecording, setProfileRecording] = createSignal<ProfileRecording>()
  const [profileNotice, setProfileNotice] = createSignal('')
  const [systemDark, setSystemDark] = createSignal(media.matches)
  const mapTheme = createMemo<MapTheme>(() => theme() === 'system' ? systemDark() ? 'dark' : 'light' : theme() as MapTheme)
  createEffect(() => perf.setDetailedEnabled(profileMode || perfVisible()))

  let profileStop: AbortController | undefined
  async function startProfile(durationMs = 30_000, captureStartTime = performance.now()): Promise<void> {
    if (profileState() === 'recording') return
    setPerfVisible(true)
    setProfileState('recording')
    setProfileNotice('Opname loopt…')
    setProfileRecording(undefined)
    profileStop = new AbortController()
    try {
      const { recordProfile } = await import('./core/profile-recorder')
      const recording = await recordProfile(perf, durationMs, captureStartTime, profileStop.signal)
      setProfileRecording(recording)
      setProfileState('ready')
      setProfileNotice(recording.profilerAvailable ? 'Opname gereed · stacks + fasen' : 'Opname gereed · alleen fasen')
    } catch (error) {
      setProfileState('error')
      setProfileNotice(error instanceof Error ? error.message : String(error))
    }
  }

  function coldProfile(): void {
    localStorage.setItem(PERF_STORAGE_KEY, '1')
    localStorage.setItem(PERF_COLD_STORAGE_KEY, '1')
    window.location.reload()
  }

  async function sendProfile(): Promise<void> {
    const recording = profileRecording()
    if (!recording) return
    setProfileNotice('Versturen…')
    try {
      const response = await fetch('/prof', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: recording.json })
      if (!response.ok) throw new Error(`Profielsink antwoordde ${response.status}`)
      const result = await response.json() as { file?: string }
      setProfileNotice(result.file ? `Verstuurd als ${result.file}` : 'Verstuurd')
    } catch (error) {
      setProfileNotice(`Niet verstuurd: ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (coldProfileRequested) void startProfile(Math.max(0, 30_000 - performance.now()), 0)

  onMount(() => {
    const telegram = props.telegram
    if (!telegram) return
    const updateTheme = () => {
      setTheme(telegram.colorScheme)
      applyTelegramColors(telegram)
    }
    updateTheme()
    telegram.onEvent('themeChanged', updateTheme)
    onCleanup(() => telegram.offEvent('themeChanged', updateTheme))
  })

  onMount(() => {
    const idle = watchIdle(IDLE_AFTER_MS, {
      now: () => performance.now(),
      setTimeout: (callback, delay) => window.setTimeout(callback, delay),
      clearTimeout: (handle) => window.clearTimeout(handle),
    }, setUserIdle)
    const inputEvents = ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart'] as const
    for (const type of inputEvents) window.addEventListener(type, idle.input, { capture: true, passive: true })
    const visibilityChanged = () => {
      setPageVisible(document.visibilityState !== 'hidden')
      if (document.visibilityState !== 'hidden') idle.input()
    }
    document.addEventListener('visibilitychange', visibilityChanged)
    onCleanup(() => {
      idle.dispose()
      for (const type of inputEvents) window.removeEventListener(type, idle.input, { capture: true })
      document.removeEventListener('visibilitychange', visibilityChanged)
    })
  })

  onMount(() => {
    const touchStart = (event: TouchEvent) => {
      tableTouchActive = event.touches.length > 0
      window.clearTimeout(tableViewSettleTimer)
    }
    const touchEnd = (event: TouchEvent) => {
      tableTouchActive = event.touches.length > 0
      if (!tableTouchActive) scheduleTableViewSettlement()
    }
    window.addEventListener('scroll', pageScrolled, { passive: true })
    window.addEventListener('scrollend', settleTableView, { passive: true })
    window.addEventListener('resize', settleTableViewAfterResize, { passive: true })
    window.addEventListener('touchstart', touchStart, { passive: true })
    window.addEventListener('touchend', touchEnd, { passive: true })
    window.addEventListener('touchcancel', touchEnd, { passive: true })
    window.visualViewport?.addEventListener('resize', settleTableViewAfterResize, { passive: true })
    syncTableViewPosition()
    scheduleTableViewSettlement(0)
    onCleanup(() => {
      window.removeEventListener('scroll', pageScrolled)
      window.removeEventListener('scrollend', settleTableView)
      window.removeEventListener('resize', settleTableViewAfterResize)
      window.removeEventListener('touchstart', touchStart)
      window.removeEventListener('touchend', touchEnd)
      window.removeEventListener('touchcancel', touchEnd)
      window.visualViewport?.removeEventListener('resize', settleTableViewAfterResize)
      if (tableViewFrame !== undefined) cancelAnimationFrame(tableViewFrame)
      window.clearTimeout(tableViewResizeTimer)
      window.clearTimeout(tableViewSettleTimer)
    })
  })

  onMount(() => {
    if (stillMode) return
    if (!('serviceWorker' in navigator)) return
    // SW alleen op prod en op loopback (e2e/PWA-checks): op dev-previews gaf een hangende SW verouderde builds (U42 live).
    const hostname = window.location.hostname
    const productionPwa = hostname === 'motregen.nl' || hostname === 'www.motregen.nl' || hostname === 'localhost' || hostname === '127.0.0.1'
    if (!productionPwa) {
      void navigator.serviceWorker.getRegistrations().then(async (registrations) => {
        await Promise.all(registrations.map((registration) => registration.unregister()))
        if ('caches' in window) await Promise.all((await caches.keys()).map((key) => caches.delete(key)))
      })
      return
    }
    updateServiceWorker = registerSW({
      onNeedRefresh: () => setUpdateReady(true),
    })
  })

  onMount(async () => {
    const mediaChanged = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    media.addEventListener('change', mediaChanged)
    onCleanup(() => media.removeEventListener('change', mediaChanged))
    const inlineHistoryChanged = (event: MediaQueryListEvent) => setHistoryInline(event.matches)
    inlineHistoryMedia.addEventListener('change', inlineHistoryChanged)
    onCleanup(() => inlineHistoryMedia.removeEventListener('change', inlineHistoryChanged))
    const tableViewChanged = (event: MediaQueryListEvent) => {
      setTableViewAvailable(event.matches)
      if (!event.matches) {
        setTableCoversViewport(false)
        setTableOpen(false)
        applyTableScrollOpen(false)
        setTableViewTarget(undefined)
      }
      else {
        queueTableViewSync()
        scheduleTableViewSettlement()
      }
    }
    tableViewMedia.addEventListener('change', tableViewChanged)
    onCleanup(() => tableViewMedia.removeEventListener('change', tableViewChanged))
    maplibregl.prewarm()
    void loadBasemapStyle(mapTheme()).catch(() => undefined)
    try {
      const data = await fetchManifest()
      perf.setManifestGenerated(data.generated)
      setManifestRefresh({ checkedAt: Date.now() })
      const frames = buildTimeline(data)
      if (!frames.length) throw new Error('De tijdlijn is leeg')
      const presets = parsePresets(initialSearch, Date.parse(data.now))
      setManifest(data)
      let nowIndex = 0
      for (let index = 0; index < frames.length; index++) if (frames[index]!.epoch <= Date.parse(data.now)) nowIndex = index
      const presetCursor = presets.epoch === undefined ? undefined : cursorForPresetEpoch(frames, presets.epoch)
      // Het eerste kaartbeeld gaat vóór alles de lijn op: het regenframe op de cursor en het volgende.
      // Zo wacht het niet op de kaart-opzet en staat het niet achter de ~40 headers van de andere velden
      // (koude PO-opname 2026-10-07: eerste regen-decode pas op 1,9 s, 0,85 s na de kaart).
      if (firstRainEarly) {
        const firstIndex = Math.floor(presetCursor ?? nowIndex)
        for (const frame of frames.slice(firstIndex, firstIndex + 2)) void load(frame).catch(() => undefined)
      }
      void Promise.all(data.chunks.filter(eagerHeader).map((chunk) => client.getHeader(chunk))).catch(() => undefined)
      if (!stillMode) stopManifestRefresh = scheduleManifestRefresh(refreshManifest, {
        setTimeout: (callback, delay) => window.setTimeout(callback, delay),
        clearTimeout: (handle) => window.clearTimeout(handle),
        visibilityState: () => document.visibilityState,
        addVisibilityListener: (callback) => document.addEventListener('visibilitychange', callback),
        removeVisibilityListener: (callback) => document.removeEventListener('visibilitychange', callback),
      }, () => {
        const current = manifest()
        return nextManifestRefreshDelay(Date.now(), current && latestRadarEpoch(current))
      })
      setCursor(presetCursor ?? nowIndex)
      if (presetCursor !== undefined) setPlaying(false)
      if (presets.mode) applyPresetMode(presets.mode)
      const header = await client.getHeader(frames[0]!.chunk)
      const initialTheme = mapTheme()
      const style = await loadBasemapStyle(initialTheme)
      appliedMapTheme = initialTheme
      const initialView = constrainView(!stillMode && initialPresets.point
        ? { ...initialPresets.point, zoom: 7 }
        : initialMapView ?? containView(MAP_CONTAIN_BOUNDS, mapViewport()), MAP_CONTAIN_BOUNDS, mapViewport())
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
        interactive: !stillMode,
      })
      restrictMapGestures(map, window.matchMedia('(pointer: coarse)').matches)
      applyMapDetailLimit()
      applyMapContainLimit()
      map.on('resize', applyMapContainLimit)
      syncSavedMarkers(savedPlaces())
      map.on('style.load', () => attachMapLayers(header.grid))
      map.on('render', () => {
        mapRepaints++
        if (map?.isStyleLoaded() && map.areTilesLoaded()) perf.markBasemapReady()
      })
      map.on('sourcedataloading', (event) => {
        if (!perfPhasesEnabled()) return
        const key = basemapTileKey(event)
        if (key) basemapTiles.set(key, performance.now())
      })
      map.on('sourcedata', (event) => {
        const key = basemapTileKey(event)
        if (!key) return
        const started = basemapTiles.get(key)
        if (started === undefined) return
        basemapTiles.delete(key)
        recordPerfPhase('basemap-tile', performance.now() - started, { tile: key }, performance.now())
      })
      map.on('moveend', rememberMapView)
      map.on('zoomend', () => void showTemperature())
      map.on('moveend', () => {
        updateIsobarStep()
        for (const set of isolineSets) { set.labels?.requestSpawn(); updateIsolineLabels(set) }
      })
      map.on('click', (event) => {
        usage.mark('pin')
        pick(event.lngLat.lng, event.lngLat.lat, nearestPlace(event.lngLat.lng, event.lngLat.lat).name)
      })
      if (!stillMode && presets.place) void selectPresetPlace(presets.place)
      if (mapTheme() !== appliedMapTheme) void applyMapTheme(mapTheme())
    } catch (error) {
      setStatus(error instanceof Error ? error.message : String(error))
    }
  })

  onCleanup(() => {
    window.clearTimeout(splashReplayTimer)
    window.clearTimeout(resetNoticeTimer)
    window.clearTimeout(shareNoticeTimer)
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
    const response = await fetch(stillMode ? manifestUrl : manifestRequestUrl(), { cache })
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
    if (!props.telegram && !stillMode) localStorage.setItem('motregen-theme', choice)
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
    if (!stillMode) storeSavedPlaces(places)
    syncSavedMarkers(places)
  })

  createEffect(() => {
    const tuning = focusedWindTuning()
    windLayer?.setTuning(tuning)
  })

  createEffect(() => applyFocus(focus(), windFocus()))
  createEffect(() => applyMapSaturation(mapSaturation(focus())))
  for (const set of isolineSets) {
    createEffect(() => applyIsolineOpacity(set))

    createEffect(() => {
      // Tekenen doet drawLayers; pas na de uitfade leegmaken, zodat een volgende hover geen verouderde
      // labels laat invaden.
      if (set.active() && mapReady()) return
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

  /**
   * Alle kaartlagen op de huidige cursor. Tijdens afspelen roept de frame-loop dit per tik direct aan,
   * buiten Solid om (U41): anders liep elke tik door ~25 effecten en memo's. Reactief op de cursor
   * blijven alleen scrubber, klok en tabel (op frame-index/minuut).
   */
  function drawLayers(): void {
    if (stillMode || !mapRendering()) return
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
    for (const set of isolineSets) {
      applyIsolineOpacity(set)
      if (set.active()) { void showIsolineField(set); void showIsolines(set) }
    }
    if (pressureIsolines.active()) updatePressureMarks()
  }
  createEffect(() => {
    // Speelregel (MIP-19 §De lat): spelen zodra het cursorframe en het volgende er zijn. De oude
    // regel wachtte op laadfase "window" van de puntreeks.
    const waitsForWindow = playRuleWaitsForWindow && initialPickStarted && (pointLoadStage() === 'initial' || pointLoadStage() === 'direct')
    if (!playing() || !mapRendering() || !mapReady() || waitsForWindow) return
    const horizonHours = timeHorizonHours()
    const frames = timeline()
    if (frames.length < 2) return
    const nowEpoch = manifest() ? Date.parse(manifest()!.now) : frames[0]!.epoch
    const lastEpoch = timelineHorizonEnd(frames, nowEpoch, horizonHours)
    // Tempo zoals toen afspelen tot +8 u liep (PO 2026-09-25 live); het loopt nu wel door tot het eind.
    const playbackRate = timelinePlaybackRate(frames, nowEpoch, PLAYBACK_TEMPO_HOURS)
    let previous = performance.now()
    // Aan het eind van een rondje glijdt de tijdlijn terug naar het begin i.p.v. in één frame te springen:
    // in de schuivende scrubber (U34) oogde die sprong als "de tijdlijn springt telkens terug".
    let rewind: { from: number; startedAt: number } | undefined
    // Aan het eind even stilstaan voordat het terugglijdt (PO 2026-09-25 live).
    let holdUntil: number | undefined
    let waiting: { frame: number; since: number } | undefined
    const framePresent = (index: number) => client.hasFrame(frames[index]!.chunk, frames[index]!.frameIndex)
    frameLoopDrives = true
    const stop = startFrameLoop((now) => {
      const elapsed = now - previous
      // Vier ms speling voor de vsync-fase: op 60 Hz precies elke tweede vsync.
      if (elapsed < 1_000 / PLAYBACK_MAX_FPS - 4) return
      previous = now
      if (holdUntil !== undefined) {
        if (now < holdUntil) return
        holdUntil = undefined
        rewind = { from: timelineEpochAtCursor(frames, cursor()), startedAt: now }
      }
      if (rewind) {
        setGlideRate(0)
        const progress = Math.min(1, (now - rewind.startedAt) / PLAYBACK_REWIND_MS)
        const eased = progress < 0.5 ? 2 * progress ** 2 : 1 - (2 - 2 * progress) ** 2 / 2
        setCursor(timelineCursorAtEpoch(frames, rewind.from + (frames[0]!.epoch - rewind.from) * eased))
        drawLayers()
        if (progress >= 1) rewind = undefined
        return
      }
      const epoch = timelineEpochAtCursor(frames, cursor())
      // Voorbij de afspeelhorizon (daar neergezet en daarna hervat): terugglijden naar het begin en
      // verder spelen, nooit voorgoed stilstaan — er is geen afspeelknop (PO 2026-09-25 live).
      if (!(epoch < lastEpoch)) { rewind = { from: epoch, startedAt: now }; return }
      const nextEpoch = epoch + elapsed * playbackRate
      if (!Number.isFinite(nextEpoch) || nextEpoch >= lastEpoch) {
        setCursor(timelineCursorAtEpoch(frames, lastEpoch))
        holdUntil = now + PLAYBACK_END_HOLD_MS
        return
      }
      let nextCursor = timelineCursorAtEpoch(frames, nextEpoch)
      if (!playRuleWaitsForWindow) {
        const reach = playbackReach(cursor(), 1, frames.length, framePresent)
        // Alleen het frame waar de cursor nu tegenaan loopt telt als wachten. Zonder die grens
        // schoof het wachtframe elke tik één op zodra het vorige binnen was en haalde de lus zo de
        // hele tijdlijn vooruit binnen (decode-budget.spec: het laatste regenframe na 4 s).
        const blocking = reach.waitingFor !== null && reach.waitingFor <= Math.floor(cursor()) + PLAYBACK_WAIT_AHEAD_FRAMES
        if (!blocking) waiting = undefined
        else if (waiting?.frame !== reach.waitingFor) {
          waiting = { frame: reach.waitingFor!, since: now }
          void load(frames[reach.waitingFor!]!).catch(() => undefined)
        }
        if (!waiting || now - waiting.since < PLAYBACK_FRAME_WAIT_MS) nextCursor = clampPlaybackCursor(nextCursor, reach, 1)
        if (nextCursor <= cursor()) { setGlideRate(0); return }
      }
      batch(() => {
        setCursor(nextCursor)
        setGlideRate(playbackRate)
      })
      drawLayers()
    }, requestAnimationFrame, cancelAnimationFrame)
    onCleanup(() => { stop(); frameLoopDrives = false; setGlideRate(0) })
  })
  // Eén intent stuurt requests en decodes (MIP-20): van de cursor naar buiten, tijdens afspelen
  // met voorkeur vooruit, tijdens scrubben gemikt op waar de cursor uitkomt.
  const intent = createMemo<Intent>(() => ({
    cursorEpoch: selectedEpoch(),
    window: viewWindow(),
    playback: playing() ? 1 : 0,
    scrubVelocity: scrubVelocity(),
    fields: SHOWN_FIELDS,
  }))
  createEffect(() => {
    if (timeline().length) client.setIntent(intent())
  })
  // Buiten het afspelen (scrubben, toetsen, pauze, focuswissel, nieuwe tijdlijn) tekent dit effect.
  createEffect(() => {
    cursor()
    timeline()
    mapReady()
    mapRendering()
    for (const set of isolineSets) { set.active(); set.step() }
    if (!mapRendering()) return
    if (playing() && frameLoopDrives) return
    untrack(drawLayers)
  })

  createEffect(() => {
    const rendering = mapRendering()
    for (const set of isolineSets) {
      set.layer?.setPaused(!rendering)
      if (!rendering) {
        set.shownRequest++
        set.worker?.dispose()
        set.worker = undefined
      }
    }
    if (!rendering) return
    requestAnimationFrame(() => {
      map?.resize()
      if (mapReady()) drawLayers()
    })
  })
  const cursorFrame = createMemo(() => Math.round(cursor()))
  // Klok en UV-chip tonen minuten: per afspeeltik hoeven ze niet opnieuw.
  const cursorMinute = createMemo(() => Math.floor(selectedEpoch() / 60_000) * 60_000)
  const tablePreviewEpoch = createMemo(() => Math.round(cursorMinute() / 3_600_000) * 3_600_000)

  // Klik op een tabelrij: de scrubber springt naar dat uur (PO 2026-09-25 live). Liep het afspelen, dan
  // pauzeert het en hervat het na dezelfde rust als na slepen in de scrubber.
  let jumpResume: number | undefined
  onCleanup(() => window.clearTimeout(jumpResume))
  function jumpToTime(epoch: number): void {
    const frames = timeline()
    if (!frames.length) return
    window.clearTimeout(jumpResume)
    if (playing() || jumpResume !== undefined) {
      setPlaying(false)
      jumpResume = window.setTimeout(() => { jumpResume = undefined; setPlaying(true) }, TABLE_JUMP_RESUME_MS)
    }
    scrub(timelineCursorAtEpoch(frames, epoch))
  }

  // Zolang het versheidspaneel open is staat de klok stil (PO 2026-09-25 live).
  let playingBeforeFreshness = false
  const [freshnessOpen, setFreshnessOpen] = createSignal(false)
  function pauseForFreshness(): void {
    usage.mark('fresh')
    setFreshnessOpen(true)
    playingBeforeFreshness = playing()
    setPlaying(false)
  }
  function resumeAfterFreshness(): void {
    setFreshnessOpen(false)
    if (playingBeforeFreshness) setPlaying(true)
    playingBeforeFreshness = false
  }
  // De scrubber hervat 1 s na een sleep; als het versheidspaneel intussen open ging, mag dat niet
  // onder het paneel door (bug PO 2026-10-07): onthoud het en hervat pas bij sluiten.
  function setPlayingFromScrubber(value: boolean): void {
    if (freshnessOpen()) { playingBeforeFreshness = value; return }
    setPlaying(value)
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
    applyFocus(focus(), windFocus())
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
        if (stillMode) void prepareStill()
        else {
          void attachWindLayer()
          scheduleIdle(preloadTemperatureAtCursor, 1_000)
        }
        if (!stillMode && !initialPickStarted) {
          initialPickStarted = true
          setPointLoadsStarted(true)
          pick(startLocation.lng, startLocation.lat, startLocation.label)
          if (startFromFix) revealPoint(startLocation.lng, startLocation.lat)
        }
      })
    }
    afterRainDraw(() => perf.markRainFrameCommitted({ frameEpoch: leftFrame.epoch, playing: playing() }))
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

  async function prepareStill(): Promise<void> {
    try {
      if (initialPresets.mode === 'wind') await attachWindLayer()
      await showTemperature()
      await updateTemperatureRange()
      for (const set of isolineSets) {
        if (!set.active()) continue
        await showIsolineField(set)
        await showIsolines(set)
        const required = isolineLayerIndices(set.time, set.timeline().length, ISOLINE_WINDOW)
        if (!set.layer || required.some((index) => !set.layer!.hasLayer(index))) {
          throw new Error(`Kaartlaag ${set.kind} is niet geladen`)
        }
      }
      if (windFocus() > 0 && !windLayer) throw new Error('Wind is niet geladen')
      if (hasTemperature() && !temperatureInput) throw new Error('Temperatuurlabels zijn niet geladen')
      const overlays = [rainOverlay, ...isolineSets.map((set) => set.overlay)]
      await Promise.all(overlays.map((overlay) => {
        if (!overlay) return Promise.resolve()
        return new Promise<void>((resolve) => overlay.once(resolve))
      }))
      mapElement.dataset.stillReady = 'true'
    } catch (error) {
      mapElement.dataset.stillError = error instanceof Error ? error.message : 'Still laden mislukt'
    }
  }

  let stillSimulationMs = 0
  async function renderStillFrame(epoch: number, simulationMs = 0): Promise<void> {
    mapElement.dataset.stillReady = 'false'
    delete mapElement.dataset.stillError
    const nextCursor = cursorForPresetEpoch(timeline(), epoch)
    if (nextCursor === undefined) throw new Error('Frame valt buiten de beschikbare tijdlijn')
    setCursor(nextCursor)
    await showFrame()
    await prepareStill()
    if (mapElement.dataset.stillError) throw new Error(mapElement.dataset.stillError)
    if (windLayer && windOverlay) {
      while (stillSimulationMs < simulationMs) {
        stillSimulationMs = Math.min(simulationMs, stillSimulationMs + 1_000 / 30)
        windLayer.setSimulationTime(stillSimulationMs)
        windOverlay.drawNow()
      }
    }
    await document.fonts.ready
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
      if (stillMode) {
        wind.setSimulationTime(0)
        windOverlay.pause()
      }
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
    temperatureLabelKey = temperatureInput = temperaturePending = ''
    temperatureTick = undefined
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

  function applyFocus(value: number, windValue: number): void {
    if (!map) return
    const context = contextOpacity(value, FOCUS_DIM)
    layer?.setOpacity(rainFocusOpacity(value, windValue))
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
    return { step, fill: ISOLINE_FILL_OPACITY, fillSmooth: fillStyle === 'verloop', palette: range && paletteStops(range), color: hexColor(isolineColor(mapTheme())), gradientFade: fade === 'gradiënt', lineOpacity: TEMPERATURE_LINE_OPACITY }
  }

  /** Isobaren: één egale lijnkleur, geen vulling en geen vervaging, zoals op een weerkaart (PO U35). */
  function cloudVeilStyle(): IsolineStyle {
    const veil: [number, number, number] = mapTheme() === 'dark' ? [0.72, 0.77, 0.8] : [0.96, 0.97, 0.98]
    return { step: CLOUD_VEIL_STEP, fill: CLOUD_VEIL_OPACITY, fillSmooth: true, palette: [[0, veil], [100, veil]], color: veil, gradientFade: false, lines: false, fillByValue: CLOUD_VEIL_RANGE }
  }

  let isobarStepHour = Number.NaN
  /** Isobaarstap op het drukbereik in beeld (U34), op het dichtstbijzijnde geladen uurframe. */
  function updateIsobarStep(): void {
    const set = pressureIsolines
    if (!map || !set.layer || !set.active()) return
    const nearest = Math.round(set.time)
    const field = set.fields[nearest] ?? set.fields.find((candidate) => candidate)
    if (!field) return
    const bounds = map.getBounds()
    const view = { west: bounds.getWest(), south: bounds.getSouth(), east: bounds.getEast(), north: bounds.getNorth() }
    const range = fieldRangeInView(field.values, field.valid, set.layer.grid, view)
    if (range) setIsobarStep((current) => adaptiveIsobarStep(range[0], range[1], current))
  }

  // H en L bij de isobaren (MIP-14), vloeiend in de tijd (PO 2026-09-25 live): per uurframe de centra
  // (gecachet), tussen twee uren per soort gekoppeld aan het dichtstbijzijnde centrum en verschoven;
  // wat verschijnt of verdwijnt vloeit in/uit. Vanuit drawLayers; getekend door de windlaag zelf.
  interface PressureMark { kind: 'H' | 'L'; lng: number; lat: number; value: number }
  const pressureMarkCache = new WeakMap<PreparedField, PressureMark[]>()
  function pressureMarksOf(field: PreparedField, grid: Grid): PressureMark[] {
    let marks = pressureMarkCache.get(field)
    if (marks) return marks
    const radius = 6_378_137
    const cellKm = Math.abs(grid.dx) * Math.cos(52 * Math.PI / 180) / 1_000
    marks = pressureExtrema(field.values, field.valid, grid.width, grid.height, Math.max(2, Math.round(PRESSURE_EXTREMUM_KM / cellKm))).map((extremum) => {
      const x = grid.x0 + (extremum.column + 0.5) * grid.dx
      const y = grid.y0 + (extremum.row + 0.5) * grid.dy
      return { kind: extremum.kind, value: extremum.value, lng: x / radius * 180 / Math.PI, lat: (2 * Math.atan(Math.exp(y / radius)) - Math.PI / 2) * 180 / Math.PI }
    })
    pressureMarkCache.set(field, marks)
    return marks
  }
  function updatePressureMarks(): void {
    const set = pressureIsolines
    const focusValue = windFocus()
    const shown: Array<PressureMark & { opacity: number }> = []
    const frames = set.timeline()
    if (map && set.layer && focusValue > 0 && frames.length) {
      const blend = frameBlend(frames, selectedEpoch())
      const leftField = set.fields[blend.left], rightField = set.fields[blend.right]
      if (leftField) {
        const left = pressureMarksOf(leftField, set.layer.grid)
        const right = rightField && rightField !== leftField ? pressureMarksOf(rightField, set.layer.grid) : left
        const mix = right === left ? 0 : blend.mix
        const km = (a: PressureMark, b: PressureMark) => Math.hypot((a.lat - b.lat) * 111, (a.lng - b.lng) * 111 * Math.cos(52 * Math.PI / 180))
        const used = new Set<PressureMark>()
        for (const from of left) {
          const to = right.filter((candidate) => candidate.kind === from.kind && !used.has(candidate) && km(from, candidate) < PRESSURE_MATCH_KM)
            .sort((a, b) => km(from, a) - km(from, b))[0]
          if (to) {
            used.add(to)
            shown.push({ kind: from.kind, lng: from.lng + (to.lng - from.lng) * mix, lat: from.lat + (to.lat - from.lat) * mix, value: from.value + (to.value - from.value) * mix, opacity: 1 })
          } else shown.push({ ...from, opacity: 1 - mix })
        }
        for (const to of right) if (!used.has(to) && right !== left) shown.push({ ...to, opacity: mix })
      }
    }
    // Naar Mercator-wereldcoördinaten (0–1), zoals de windsegmenten.
    windLayer?.setPressureMarks(shown.filter((mark) => mark.opacity > 0.01).map((mark) => ({
      kind: mark.kind,
      x: (mark.lng + 180) / 360,
      y: (1 - Math.log(Math.tan(Math.PI / 4 + mark.lat * Math.PI / 360)) / Math.PI) / 2,
      opacity: focusValue * mark.opacity,
    })))
  }
  createEffect(() => { windFocus(); untrack(updatePressureMarks) })

  function isobarStyle(): IsolineStyle {
    return { step: isobarStep(), fill: 0, color: hexColor(isolineColor(mapTheme(), 'pressure')), gradientFade: false, lineOpacity: ISOBAR_LINE_OPACITY }
  }

  /** De gewogen uurframes achter het veld van `frame` (druk: met zijn buren, zie isolineFrameWeights). */
  async function isolineFieldFrames(set: IsolineSet, frame: TimelineFrame): Promise<{ grid: Grid; frames: WeightedFrame[] }> {
    const timeline = set.timeline()
    const index = timeline.findIndex((candidate) => candidate.chunk.url === frame.chunk.url && candidate.frameIndex === frame.frameIndex)
    const weights = index < 0 ? [{ index: -1, weight: 1 }] : isolineFrameWeights(index, timeline.length, set.kind)
    const parts = await Promise.all(weights.map(async ({ index: at, weight }) => {
      const source = at < 0 ? frame : timeline[at]!
      const [data, header] = await Promise.all([load(source), client.getHeader(source.chunk)])
      return { grid: header.grid, frame: { data, quant: header.quant, weight } }
    }))
    return { grid: parts[0]!.grid, frames: parts.map((part) => part.frame) }
  }

  /**
   * Een wissel naar Gevoel direct na het laden had nog geen uurframe en dus geen snede om te
   * tekenen. De uurlagen rond de cursor liggen daarom klaar zodra de regen staat: twee à drie
   * decodes van het kleine uurraster, in rust.
   */
  function preloadTemperatureAtCursor(): void {
    const frames = temperatureIsolines.timeline()
    if (!frames.length) return
    const blend = frameBlend(frames, selectedEpoch())
    for (const index of isolineLayerIndices(blend.left + blend.mix, frames.length, ISOLINE_WINDOW)) {
      void preparedIsolineField(temperatureIsolines, frames[index]!).catch(() => undefined)
    }
  }

  function preparedIsolineField(set: IsolineSet, frame: TimelineFrame): Promise<{ grid: Grid; field: PreparedField }> {
    const preparedIsolineFields = set.prepared
    const key = `${frame.chunk.url}#${frame.frameIndex}`
    let prepared = preparedIsolineFields.get(key)
    if (!prepared) {
      prepared = isolineFieldFrames(set, frame).then(({ grid, frames }) => {
        return { grid, field: prepareField(blurField(blendFrames(frames, grid.width, grid.height), isolineBlurPasses(set.kind))) }
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
  /**
   * Het palet hangt aan het temperatuurbereik van de hele verwachting, en dat vraagt alle uurframes
   * van de gevoelstemperatuur. Tot die er zijn tekende de laag zonder kleur ("alles grijs", PO
   * 2026-10-08). Het eerste uurframe dat de kaart toont geeft daarom alvast een voorlopig bereik;
   * updateTemperatureRange vervangt het zodra het volledige bekend is.
   */
  function provisionalTemperatureRange(field: PreparedField, grid: Grid): void {
    if (temperatureRange()) return
    const inView = fieldRangeInView(field.values, field.valid, grid, NETHERLANDS_FLANDERS_BOUNDS)
    if (inView) setTemperatureRange(paletteRange(inView[0], inView[1]))
  }

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

  async function showIsolineField(set: IsolineSet): Promise<void> {
    if (!mapRendering()) return
    if (set.kind === 'temperature' && !stillMode) void updateTemperatureRange()
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
        if (!mapRendering() || map !== renderedMap || set.layer || !renderedMap.getLayer('motregen-temperature')) return
        const created = new IsolineLayer(grid, frames.length, set.style(), set.layerId)
        set.layer = created
        set.layerKey = key
        set.fields = []
        set.labels?.clear()
        if (set.kind !== 'cloud') {
          set.labels = new IsolineLabels(renderedMap, grid, mapTheme(), () => reducedMotion.matches, set.kind)
          set.labels.setFade(set.labelFade())
        }
        set.key = ''
        // Labels schuiven mee op exact de snede die de lijnen net kregen (zelfde cadans).
        created.onPass = () => updateIsolineLabels(set)
        mountIsolines(set, renderedMap, created)
        applyIsolineOpacity(set)
        void showIsolines(set)
      }
      const layer = set.layer
      if (set.frameKeys.frames !== frames) set.frameKeys = { frames, keys: frames.map((frame) => `${frame.chunk.url}#${frame.frameIndex}`) }
      const frameKeys = set.frameKeys.keys
      for (const index of layer.setFrameKeys(frameKeys)) set.fields[index] = undefined
      // Nooit een lege laag (MIP-19): de snede schuift pas op als haar uurlagen er zijn; tot dan
      // blijft de vorige staan. Na een moduswissel of een sprong buiten het geladen venster tekende
      // de laag anders niets tot de decode binnen was (PO 2026-10-08, Android).
      const cursorLayersReady = () => required.every((index) => layer.hasLayer(index))
      if (cursorLayersReady()) layer.setTime(time, playing())
      await Promise.all(wanted.filter((index) => !layer.hasLayer(index)).map(async (index) => {
        const prepared = await preparedIsolineField(set, frames[index]!)
        if (!mapRendering() || layer !== set.layer || layer.frameKey(index) !== frameKeys[index] || !sameGrid(prepared, { grid: layer.grid })) return
        set.fields[index] = prepared.field
        layer.setLayer(index, prepared.field)
        if (set.kind === 'temperature') provisionalTemperatureRange(prepared.field, layer.grid)
        if (layer === set.layer && set.time === time && cursorLayersReady()) layer.setTime(time, playing())
      }))
      // Stap alleen op een nieuwe uurstap (en bij moveend), nooit midden in een tween (MIP-14).
      if (set.kind === 'pressure' && Math.round(time) !== isobarStepHour) {
        isobarStepHour = Math.round(time)
        updateIsobarStep()
      }
    } catch {
      // Een ontbrekend uurframe laat de vorige snede staan; de volgende tijdstap probeert opnieuw.
    }
  }

  /**
   * Labels: contourgeometrie per uurframe éénmalig in de worker (gecachet per frame+stap), en
   * het label volgt het dichtstbijzijnde uur. Afspelen kost zo één ronde per uur, rust nul.
   */
  async function showIsolines(set: IsolineSet): Promise<void> {
    if (!mapRendering() || set.kind === 'cloud') return
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
        const { grid, frames: weighted } = await isolineFieldFrames(set, frame)
        set.worker ??= new IsolineWorker()
        set.labelRounds++
        labels = set.worker.compute({ frames: weighted, grid, step, kind: set.kind })
        isolineLabelCache.set(key, labels)
        if (isolineLabelCache.size > 24) isolineLabelCache.delete(isolineLabelCache.keys().next().value!)
      }
      const data = await labels
      if (!data) isolineLabelCache.delete(key)
      if (!mapRendering() || !data || request !== set.shownRequest || !set.labels) return
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

  function pinFocusMode(mode: FocusKind): void {
    if (!focusMode.pin(mode)) return
    setFocusPinned(mode)
    if (mode === 'air') usage.mark('pinAir')
    else if (mode === 'wind') usage.mark('pinWind')
    else if (mode === 'temperature') usage.mark('pinFeel')
  }

  function applyPresetMode(mode: Parameters<typeof modeForFocus>[0]): void {
    const next = modeForFocus(mode)
    focusMode.pin(next)
    setFocusPinned(next)
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
    // In stappen van 10 minuten tijdlijntijd (PO 2026-09-25: stadstemperaturen zijn minder belangrijk):
    // elke gewijzigde stadswaarde is een setData en dus een volledige kaartrender.
    const stepEpoch = Math.round(selectedEpoch() / CITY_TEMPERATURE_STEP_MS) * CITY_TEMPERATURE_STEP_MS
    // De backing store van het canvas staat voor de kaartmaat: clientWidth zou hier per afspeeltik een
    // layout afdwingen (PO-opname 2026-10-07: 1,8 s in de eerste tien seconden).
    const canvas = map.getCanvas()
    // Per afspeeltik is er bijna altijd niets veranderd: dat vaststellen op getallen, zonder de frames op te
    // zoeken of een sleutel met twee chunk-URL's op te bouwen.
    const tick = temperatureTick
    if (tick && tick.frames === frames && tick.stepEpoch === stepEpoch && tick.zoom === map.getZoom() && tick.width === canvas.width && tick.height === canvas.height) return
    temperatureTick = { frames, stepEpoch, zoom: map.getZoom(), width: canvas.width, height: canvas.height }
    const blend = frameBlend(frames, stepEpoch)
    const mix = blend.mix
    const leftFrame = frames[blend.left]!, rightFrame = frames[blend.right]!
    // Zelfde invoer als de getoonde labels: niets te doen (per afspeeltik het gewone geval). Ook niet
    // zolang dezelfde invoer nog laadt: anders begint elke tik opnieuw en haalt de vorige lading in.
    const input = `${leftFrame.chunk.url}#${leftFrame.frameIndex}|${rightFrame.chunk.url}#${rightFrame.frameIndex}|${mix}|${map.getZoom()}|${canvas.width}x${canvas.height}`
    if (input === temperatureInput || input === temperaturePending) return
    const request = ++shownTemperatureRequest
    temperaturePending = input
    try {
      const [left, right, leftHeader, rightHeader] = await Promise.all([
        load(leftFrame), load(rightFrame), client.getHeader(leftFrame.chunk), client.getHeader(rightFrame.chunk),
      ])
      if (request !== shownTemperatureRequest || !map) return
      const source = map.getSource('motregen-temperature') as GeoJSONSource | undefined
      const { clientWidth, clientHeight } = map.getContainer()
      const labels = temperatureLabels(left, right, leftHeader, rightHeader, mix, selectTemperaturePlaces(map.getZoom(), temperatureLabelSpacingPx(clientWidth, clientHeight)))
      const key = labels.features.map((feature) => `${feature.properties.name}:${feature.properties.label}`).join('|')
      temperatureInput = input
      temperaturePending = ''
      if (key !== temperatureLabelKey) {
        temperatureLabelKey = key
        source?.setData(labels)
      }
    } catch {
      const source = map?.getSource('motregen-temperature') as GeoJSONSource | undefined
      temperatureLabelKey = temperatureInput = temperaturePending = ''
      temperatureTick = undefined
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
      setCloudSeries(cachedForecast[3]!.values)
      setWindUSeries(cachedForecast[4]!.values)
      setWindVSeries(cachedForecast[5]!.values)
      setGustSeries(cachedForecast[6]!.values)
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
    setCloudSeries([])
    setWindUSeries([])
    setWindVSeries([])
    setGustSeries([])
    state.direct = (async () => {
      // De fase "direct" wacht alleen op de rijen rond nu; de rest van de tabel en het venster is
      // tegelijk gevraagd en groeit per frame aan (publishLoadedSeries), het verst van de cursor het laatst.
      for (const series of tableSeries) void readForecastPointSeries(series.frames(), point, series.key, 'L0', state)
      const [uv, temperature, feelsLike, cloud, windU, windV, gust] = await Promise.all([
        readForecastPointSeries(uvTimeline(), point, 'uvIndex', 'L0', state, 'near-now'),
        readForecastPointSeries(tempTimeline(), point, 'temperatureIndex', 'L0', state, 'near-now'),
        readForecastPointSeries(feelsLikeTimeline(), point, 'feelsLikeIndex', 'L0', state, 'near-now'),
        readForecastPointSeries(cloudTimeline(), point, 'cloudIndex', 'L0', state, 'near-now'),
        readForecastPointSeries(windUFrames(), point, 'windUIndex', 'L0', state, 'near-now'),
        readForecastPointSeries(windVFrames(), point, 'windVIndex', 'L0', state, 'near-now'),
        readForecastPointSeries(gustTimeline(), point, 'gustIndex', 'L0', state, 'near-now'),
        enqueueRain(state, directRainIndexes(timeline(), manifest() ? Date.parse(manifest()!.now) : 0), 'high', 'L0', 'locatie'),
      ])
      if (request !== pointRequest) return
      // Samenvoegen, niet vervangen: een moduswissel kan intussen al meer rijen hebben geladen.
      batch(() => {
        setUvSeries(mergeLoaded(uv))
        setTemperatureSeries(mergeLoaded(temperature))
        setFeelsLikeSeries(mergeLoaded(feelsLike))
        setCloudSeries(mergeLoaded(cloud))
        setWindUSeries(mergeLoaded(windU))
        setWindVSeries(mergeLoaded(windV))
        setGustSeries(mergeLoaded(gust))
      })
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
      loading: new Map(),
    }
    state.rainPublisher = new FrameBatcher(() => publishRain(state), undefined, undefined, SERIES_PUBLISH_INTERVAL_MS)
    state.seriesPublisher = new FrameBatcher(() => publishLoadedSeries(state), undefined, undefined, SERIES_PUBLISH_INTERVAL_MS)
    return state
  }

  function resumePointLoadAfterRefresh(state: PointLoadState, previousStage: PointLoadStage): void {
    state.direct = (async () => {
      const [uv, temperature, feelsLike, cloud, windU, windV, gust] = await Promise.all([
        readForecastPointSeries(uvTimeline(), state.point, 'uvIndex', 'refresh'),
        readForecastPointSeries(tempTimeline(), state.point, 'temperatureIndex', 'refresh'),
        readForecastPointSeries(feelsLikeTimeline(), state.point, 'feelsLikeIndex', 'refresh'),
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
    await mergeForecastSeries(state, 'L2')
  }

  createEffect(() => {
    if (!tableViewAvailable() || pointLoadStage() === 'initial') return
    untrack(() => { void loadHistoryRows() })
  })

  /** Met een `state` verschijnen de waarden per frame (publishLoadedSeries), niet pas als de hele reeks er is. */
  function readForecastPointSeries(frames: TimelineFrame[], point: { lng: number; lat: number }, key: TableSeriesKey, layer: LoadLayer, state?: PointLoadState, rows: 'all' | 'near-now' = 'all'): Promise<Array<number | null>> {
    const now = manifestNow()
    const history = historyRowsWanted()
    const window = viewWindow()
    const indexes = forecast().flatMap((row) => {
      if (row[key] == null || (rows === 'near-now' && Math.abs(row.epoch - now) > READY_WINDOW_MS)) return []
      const tableRow = isPassiveRow(row, now) && (row.kind !== 'past' || history)
      if (!inViewOnly) return tableRow ? [row[key]] : []
      const wanted = (tableRow && tableRowShown(row)) || (scrubberSeries().has(key) && rowInView(row, window))
      return wanted ? [row[key]] : []
    })
    if (!frames.length) return Promise.resolve([])
    const values = new Array<number | null>(frames.length).fill(null)
    const showLoaded = state && (() => {
      state.loading.set(key, { frames, values })
      state.seriesPublisher?.schedule()
    })
    return readPointSeries(frames, point, indexes, 'high', values, showLoaded, layer).catch(() => [])
  }

  // Uurrijen: een uur speling, zodat de lijn in de scrubber tot aan de rand van het venster doorloopt.
  function rowInView(row: { epoch: number }, window: EpochWindow): boolean {
    return epochInWindow(row.epoch, window, 3_600_000)
  }

  /** Krap apparaat: haal bij wat er door een verschoven venster, een andere modus of de tabel in beeld is gekomen. */
  async function loadViewWindow(state: PointLoadState): Promise<void> {
    const missingRain = visibleRainIndexes().filter((index) => !state.rainLoaded.has(index))
    if (missingRain.length) {
      void readPointSeries(timeline(), state.point, missingRain, 'low', state.rainValues, (_, loaded) => {
        for (const index of loaded) state.rainLoaded.add(index)
        if (state.request === pointRequest) state.rainPublisher?.schedule()
      }, 'L1', viewDemand().signal).catch(() => undefined)
    }
    await mergeForecastSeries(state, 'L1')
  }

  async function mergeForecastSeries(state: PointLoadState, layer: LoadLayer): Promise<void> {
    const [uv, temperature, feelsLike, cloud, windU, windV, gust] = await Promise.all([
      readForecastPointSeries(uvTimeline(), state.point, 'uvIndex', layer, state),
      readForecastPointSeries(tempTimeline(), state.point, 'temperatureIndex', layer, state),
      readForecastPointSeries(feelsLikeTimeline(), state.point, 'feelsLikeIndex', layer, state),
      readForecastPointSeries(cloudTimeline(), state.point, 'cloudIndex', layer, state),
      readForecastPointSeries(windUFrames(), state.point, 'windUIndex', layer, state),
      readForecastPointSeries(windVFrames(), state.point, 'windVIndex', layer, state),
      readForecastPointSeries(gustTimeline(), state.point, 'gustIndex', layer, state),
    ])
    if (state.request !== pointRequest) return
    batch(() => {
      setUvSeries(mergeLoaded(uv))
      setTemperatureSeries(mergeLoaded(temperature))
      setFeelsLikeSeries(mergeLoaded(feelsLike))
      setCloudSeries(mergeLoaded(cloud))
      setWindUSeries(mergeLoaded(windU))
      setWindVSeries(mergeLoaded(windV))
      setGustSeries(mergeLoaded(gust))
    })
  }

  function mergeLoaded(loaded: Array<number | null>): (previous: Array<number | null>) => Array<number | null> {
    return (previous) => Array.from({ length: Math.max(previous.length, loaded.length) }, (_, index) => loaded[index] ?? previous[index] ?? null)
  }

  /**
   * Wat van een tabelreeks al binnen is meteen tonen (U52): een veld groeit per frame aan vanaf de
   * cursor, niet als blok. Alleen zolang de tijdlijn dezelfde is; na een manifestwissel slaan de
   * indexen op een andere reeks.
   */
  function publishLoadedSeries(state: PointLoadState): void {
    if (state.request !== pointRequest) return
    batch(() => {
      for (const series of tableSeries) {
        const loading = state.loading.get(series.key)
        if (loading && loading.frames === series.frames()) series.set(mergeLoaded(loading.values))
      }
    })
    state.loading.clear()
  }

  async function readPointSeries(
    frames: TimelineFrame[],
    point: { lng: number; lat: number },
    indexes = frames.map((_, index) => index),
    priority: FetchPriority = 'high',
    values = new Array<number | null>(frames.length).fill(null),
    progress?: (values: Array<number | null>, loaded: number[]) => void,
    layer: LoadLayer = 'map',
    signal?: AbortSignal,
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
      }, layer, signal)
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
    if (inViewOnly) return
    state.deepIdle = window.setTimeout(() => {
      state.idle = scheduleIdle(() => { void completePointSeries(state, 'low', 'L2', 'diepe idle') }, 5_000)
    }, 30_000)
  }

  function visibleRainIndexes(): number[] {
    const frames = timeline()
    if (!frames.length) return []
    if (inViewOnly) return timelineIndexesInWindow(frames, viewWindow(), selectedEpoch())
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
      const [uv, temperature, feelsLike, cloud, windU, windV, gust] = await Promise.all([
        readPointSeries(uvTimeline(), state.point, undefined, priority, undefined, undefined, layer),
        readPointSeries(tempTimeline(), state.point, undefined, priority, undefined, undefined, layer),
        readPointSeries(feelsLikeTimeline(), state.point, undefined, priority, undefined, undefined, layer),
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
    state.seriesPublisher?.cancel()
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

  async function selectPresetPlace(place: string): Promise<void> {
    // De live permalink zet ?plaats= op elke plaats die je kiest; na een herlaad is dat meestal de plaats
    // waar je al staat of een opgeslagen plaats. Die hoeven niet langs de geocoder (die kan anders winnen
    // van de onthouden plaats). Alleen een onbekende naam wordt opgezocht.
    const wanted = place.trim().toLowerCase()
    if (locationLabel().trim().toLowerCase() === wanted) return
    const saved = savedPlaces().find((candidate) => candidate.name.trim().toLowerCase() === wanted)
    if (saved) { chooseSaved(saved); revealPoint(saved.lng, saved.lat); return }
    try {
      const [suggestion] = await suggestLocations(place, map?.getCenter() ?? location())
      if (!suggestion) return
      const point = await resolveLocation(suggestion)
      pick(point.lng, point.lat, suggestion.label)
      revealPoint(point.lng, point.lat)
    } catch {
      // Een gedeelde plaats mag de kaart niet onbruikbaar maken wanneer een geocoder tijdelijk uitvalt.
    }
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
      topInset = { size, top: stillMode ? 0 : topOverlayInset() }
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
      setFrameSky(false)
      setFirstRainLate(false)
      focusMode.pin(DEFAULT_FOCUS_MODE)
      setFocusPinned(DEFAULT_FOCUS_MODE)
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
    completeOnIntent()
    setCursor(cursor)
    trackScrubVelocity()
  }

  function clockScrub(cursor: number): void {
    usage.mark('clockScrub')
    scrub(cursor)
  }

  function trackScrubVelocity(): void {
    const now = performance.now()
    const epoch = selectedEpoch()
    if (lastScrub && now - lastScrub.at < SCRUB_REST_MS && now > lastScrub.at) setScrubVelocity((epoch - lastScrub.epoch) / (now - lastScrub.at))
    lastScrub = { epoch, at: now }
    window.clearTimeout(scrubRest)
    scrubRest = window.setTimeout(() => { lastScrub = undefined; setScrubVelocity(0) }, SCRUB_REST_MS)
  }

  // Een aanraking van de scrubber haalt op een ruim apparaat alvast alles binnen; op een krap
  // apparaat volgt het laadvenster de cursor (zie loadViewWindow).
  function completeOnIntent(): void {
    if (!inViewOnly) void completePointSeries(pointLoad, 'high')
  }

  function currentShareMode(): Parameters<typeof modeForFocus>[0] {
    return modeForActiveFocus(focusPinned() ?? focusMode.active())
  }

  // De adresbalk is de permalink (PO 2026-10-07): modus en plek volgen live; het tijdstip staat er alleen
  // zolang het klokpaneel open is ("dit moment"), anders verandert de URL constant.
  createEffect(() => {
    if (stillMode) return
    const url = new URL(window.location.href)
    // Het tijdstip telt alleen mee zolang het in de URL staat; anders liep dit effect bij elke afspeeltik.
    const withTime = freshnessOpen()
    applyPresetParams(url.searchParams, { mode: currentShareMode(), epoch: withTime ? selectedEpoch() : untrack(selectedEpoch), point: location(), place: locationLabel() }, withTime)
    if (url.href !== window.location.href) history.replaceState(history.state, '', url)
  })

  async function shareCurrentState(): Promise<void> {
    const url = shareUrl({ mode: currentShareMode(), epoch: selectedEpoch(), point: location(), place: locationLabel() })
    const touch = matchMedia('(pointer: coarse)').matches
    if (touch && typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: 'motregen.nl', text: 'Regenradar en weersverwachting', url })
        usage.mark('share')
        showShareNotice('Link gedeeld')
        return
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return
      }
    }
    await copyText(url)
    usage.mark('share')
    showShareNotice('Link gekopieerd')
  }

  function showShareNotice(message: string): void {
    window.clearTimeout(shareNoticeTimer)
    setShareNotice(message)
    shareNoticeTimer = window.setTimeout(() => setShareNotice(), 2_500)
  }

  const manifestNow = () => manifest() ? Date.parse(manifest()!.now) : 0
  const forecast = createMemo(() => measurePerfPhase('table-render', () => buildHourlyForecast({
    rain: timeline(),
    uv: uvTimeline(),
    uvClear: uvClearTimeline(),
    radiation: radiationTimeline(),
    temperature: tempTimeline(),
    feelsLike: feelsLikeTimeline(),
    cloud: cloudTimeline(),
    windU: windUFrames(),
    windV: windVFrames(),
    gust: gustTimeline(),
  }, manifest() ? Date.parse(manifest()!.now) : 0), { memo: 'uurindeling' }))
  // De straling voedt de tabel (weericoon, UV-schatting) en de hemel achter de scrubber. Gelezen waarden
  // blijven staan zolang locatie en tijdlijn dezelfde zijn: een uurstop van de hemel mag niet terugvallen
  // op de wolkenlaagschatting omdat de tabel of het venster is doorgeschoven (U62).
  let radiationRead: { point: object; frames: object; values: Array<number | null> } | undefined
  createEffect(() => {
    const point = location()
    const frames = radiationTimeline()
    const all = pointLoadStage() === 'complete'
    const now = manifestNow()
    const rows = forecast()
    // Krap apparaat: de hemel vraagt precies het venster dat de scrubber toont, wat de tabel ook toont.
    const skyRows = new Set(inViewOnly && pointLoadsStarted() ? skyRadiationRows(rows, viewWindow()) : [])
    const indexes = rows.flatMap((row) => {
      const tableRow = row.kind !== 'past' && (all || isPassiveRow(row, now)) && tableRowShown(row)
      if (!tableRow && !skyRows.has(row)) return []
      if (solarElevationSin(row.epoch, point.lng, point.lat) <= 0) return []
      return [row.radiationIndex, row.radiationNextIndex].filter((index): index is number => index != null)
    })
    if (radiationRead?.point !== point || radiationRead.frames !== frames) radiationRead = { point, frames, values: new Array<number | null>(frames.length).fill(null) }
    const read = radiationRead
    const missing = indexes.filter((index) => read.values[index] == null)
    if (!missing.length) return
    void readPointSeries(frames, point, missing, 'low', read.values, undefined, 'L0').then((values) => {
      if (read === radiationRead) setRadiationSeries([...values])
    }).catch(() => undefined)
  })
  // Heldere-hemel-UV reist als eigen veld mee; net als de straling alleen de uurframes van de tabelrijen
  // (alle kwartieren decoderen zou de gedeelde framecache van 512 uit de puntreeksen drukken). De bytes
  // komen wel als één payload-Range binnen: losse frame-Ranges op dit kleine bestand kwamen warm opnieuw
  // over (perf.spec warm = 0 B). Vanaf de eerste locatiekeuze; de volgorde regelt de decodewachtrij.
  let uvClearRequest = 0
  createEffect(() => {
    const point = location()
    const frames = uvClearTimeline()
    const stage = pointLoadStage()
    const all = stage === 'complete'
    const history = historyRowsWanted()
    const now = manifestNow()
    const window = inViewOnly ? viewWindow() : undefined
    const indexes = forecast().flatMap((row) => {
      if (row.uvClearIndex == null || solarElevationSin(row.epoch, point.lng, point.lat) <= 0) return []
      const tableRow = (all || isPassiveRow(row, now)) && (row.kind !== 'past' || history)
      // Zonder tabel in beeld leest alleen de UV-chip bij de cursor deze reeks.
      const wanted = tableRowShown(row) ? tableRow : window !== undefined && rowInView(row, window)
      return wanted ? [row.uvClearIndex] : []
    })
    const request = ++uvClearRequest
    if (!pointLoadsStarted() || !indexes.length) return
    void (async () => {
      await Promise.all([...new Set(indexes.map((index) => frames[index]!.chunk))].map((chunk) => client.fetchPayload(chunk)))
      const values = await readPointSeries(frames, point, indexes, 'low', undefined, undefined, 'L0')
      if (request === uvClearRequest) setUvClearSeries(values)
    })().catch(() => undefined)
  })
  // Wolkenlagen (U37; sinds U34 altijd de achtergrond van de scrubber): als hele payload per chunk
  // (16 km-raster, klein), lage prioriteit. Ze laden tegelijk met de regenreeks (U52); wat het
  // dichtst bij de cursor ligt gaat in de decodewachtrij voor, van welk veld ook.
  const windSpeedSeries = createMemo(() => windUSeries().map((u, index) => {
    const v = windVSeries()[index]
    return u == null || v == null ? null : Math.hypot(u, v)
  }))
  // Zonnestand per tijdstip voor de gekozen plek: hemel, schemering en streken vragen bij elke aanvulling
  // dezelfde uren opnieuw (PO-opname 2026-10-07: solarPosition ~0,3 s tijdens het laden).
  const sunElevationAt = createMemo(() => {
    const point = location()
    const known = new Map<number, number>()
    return (epoch: number) => {
      let elevation = known.get(epoch)
      if (elevation === undefined) {
        elevation = solarElevationSin(epoch, point.lng, point.lat)
        known.set(epoch, elevation)
      }
      return elevation
    }
  })
  // Het chrome (koppenrij van de tabel, klokpil) neemt de hemel van het cursoruur aan, uit dezelfde bron
  // als de dag/nacht-kleuring van de rijen (U42); zonder Expressief blijft het zoals het was (U62).
  const chromeSky = createMemo<HourSky | undefined>(() => {
    if (!expressive() || !manifest()) return undefined
    const point = location()
    const daylight = isSunUp(cursorMinute(), point.lng, point.lat)
    const hourEpoch = tablePreviewEpoch()
    const row = daylight ? forecast().find((candidate) => candidate.epoch === hourEpoch) : undefined
    const overcast = row ? hourDarkness(row, radiationSeries(), cloudSeries(), sunElevationAt()) : 0
    return { daylight, overcast: Math.round(overcast * 100) / 100 }
  }, undefined, { equals: (left, right) => left?.daylight === right?.daylight && left?.overcast === right?.overcast })
  const cloudTimelines = createMemo(() => Object.fromEntries(CLOUD_LAYERS.map((layer) =>
    [layer, manifest() ? buildTimeline(manifest()!, `cloud_${layer}`) : []])) as Record<CloudLayer, TimelineFrame[]>)
  const [cloudValues, setCloudValues] = createSignal<Record<CloudLayer, Array<number | null>>>({ high: [], mid: [], low: [] })
  // De banden groeien per frame aan (krap apparaat: venster voor venster); de al gelezen waarden
  // blijven staan zolang locatie en tijdlijn dezelfde zijn.
  let cloudsRead: { point: object; timelines: object; values: Record<CloudLayer, Array<number | null>> } | undefined
  // Eén publicatiekanaal voor alle lezingen: per venster een eigen batcher gaf tijdens afspelen ~15
  // publicaties per seconde, elk een volledige herbouw van de wolkendoorsnede (prof:capture Lucht, 2026-10-07).
  const cloudPublisher = new FrameBatcher(() => {
    const read = cloudsRead
    if (read) setCloudValues({ high: [...read.values.high], mid: [...read.values.mid], low: [...read.values.low] })
  }, undefined, undefined, SERIES_PUBLISH_INTERVAL_MS)
  onCleanup(() => cloudPublisher.cancel())
  createEffect(() => {
    const point = location()
    const timelines = cloudTimelines()
    const window = inViewOnly ? viewWindow() : undefined
    const signal = inViewOnly ? viewDemand().signal : undefined
    if (!pointLoadsStarted()) return
    const otherPlaceOrTimeline = cloudsRead?.point !== point || cloudsRead.timelines !== timelines
    if (otherPlaceOrTimeline) cloudsRead = { point, timelines, values: { high: [], mid: [], low: [] } }
    const read = cloudsRead!
    // Ook een lezing die bij een vorig venster begon publiceert nog: de waarden zijn gedeeld.
    const publish = () => { if (read === cloudsRead) cloudPublisher.schedule() }
    if (otherPlaceOrTimeline) publish()
    // De cursor bepaalt alleen de volgorde binnen het venster. Hem hier volgen zou dit effect tijdens
    // afspelen elk beeld opnieuw laten lezen; het venster zelf verandert al wanneer het moet.
    const cursorEpoch = untrack(selectedEpoch)
    for (const layer of CLOUD_LAYERS) {
      const frames = timelines[layer]
      if (read.values[layer].length !== frames.length) read.values[layer] = new Array<number | null>(frames.length).fill(null)
      const values = read.values[layer]
      const wanted = window ? timelineIndexesInWindow(frames, window, cursorEpoch) : frames.map((_, index) => index)
      const missing = wanted.filter((index) => values[index] == null)
      // Per chunk, zodat de uren rond de cursor niet op de payload van morgen wachten.
      for (const chunk of new Set(missing.map((index) => frames[index]!.chunk))) {
        const indexes = missing.filter((index) => frames[index]!.chunk === chunk)
        void client.fetchPayload(chunk)
          .then(() => readPointSeries(frames, point, indexes, 'low', values, publish, window ? 'L1' : 'L0', signal))
          .catch(() => undefined)
      }
    }
  })
  // Meetpunt "window-ready:<veld>" (U52): wanneer heeft elk getoond veld zijn waarden voor nu ± 1 u.
  const reportWindowReady = (field: string, epochs: number[], present: (index: number) => boolean) => {
    createEffect(() => {
      if (!manifest()) return
      if (windowReady(epochs.map((epoch, index) => ({ epoch, present: present(index) })), manifestNow())) perf.markWindowReady(field)
    })
  }
  createEffect(() => {
    const rain = timeline()
    reportWindowReady('rain_rate', rain.map((frame) => frame.epoch), (index) => rainLoaded()[index] === true)
    for (const layer of CLOUD_LAYERS) {
      reportWindowReady(`cloud_${layer}`, cloudTimelines()[layer].map((frame) => frame.epoch), (index) => cloudValues()[layer][index] != null)
    }
    const rows = forecast()
    for (const series of tableSeries) {
      const withFrame = rows.filter((row) => row[series.key] != null)
      reportWindowReady(series.field, withFrame.map((row) => row.epoch), (index) => series.values()[withFrame[index]![series.key]!] != null)
    }
  })
  // Schermwaarheid (MIP-19): de scrubber tekent nog geen fog, dus elk zichtbaar regenslot zonder waarde is leeg.
  createEffect(() => {
    if (mapReady()) perf.markSplashGone()
    const loaded = rainLoaded()
    const slots = timeline().map((frame, index) => ({ epoch: frame.epoch, loaded: loaded[index] === true, fogDrawn: false }))
    const states = visibleSlotStates(slots, viewWindow())
    perf.setBlankVisibleSlots(states.blank, states.blank + states.fog + states.loaded)
  })
  createEffect(() => {
    if (!inViewOnly) return
    viewWindow()
    scrubberSeries()
    tableInView()
    tablePeeking()
    peekRows()
    // Niet wachten op een laadfase: wat de intent nu vraagt gaat meteen de planner in (MIP-20).
    if (pointLoadStage() === 'complete') return
    const state = untrack(() => pointLoad)
    if (state) untrack(() => { void loadViewWindow(state) })
  })
  const cursorUv = createMemo(() => seriesValueAt(uvTimeline(), uvSeries(), cursorMinute(), 30 * 60_000))
  const cursorUvReading = createMemo(() => {
    const point = location()
    const epoch = cursorMinute()
    const row = forecast().find((candidate) => Math.abs(candidate.epoch - epoch) <= 30 * 60_000)
    const clear = row?.uvClearIndex == null ? null : uvClearSeries()[row.uvClearIndex] ?? null
    return uvReading(epoch, cursorUv(), clear, null, null, (at) => solarElevationSin(at, point.lng, point.lat), false)
  })
  const cursorUvChip = createMemo(() => uvChipLabel(cursorUv()))
  const hasTemperature = createMemo(() => feelsLikeTimeline().length > 0)
  const hasWeatherIcons = createMemo(() => cloudTimeline().length > 0)
  const hasWind = createMemo(() => windUFrames().length > 0 && windVFrames().length > 0)
  function scrollTableToEpoch(epoch: number, behavior: ScrollBehavior): boolean {
    const scroller = forecastPanelElement.querySelector<HTMLElement>('.table-scroll')
    const rows = [...forecastPanelElement.querySelectorAll<HTMLElement>('tr[data-epoch]')]
    const current = rows.find((row) => Number(row.dataset.epoch) === epoch) ?? rows.reduce<HTMLElement | undefined>((nearest, row) =>
      !nearest || Math.abs(Number(row.dataset.epoch) - epoch) < Math.abs(Number(nearest.dataset.epoch) - epoch) ? row : nearest, undefined)
    const heading = forecastPanelElement.querySelector<HTMLElement>('thead')
    if (!scroller || !current || !heading) return false
    const top = scroller.scrollTop + current.getBoundingClientRect().top - scroller.getBoundingClientRect().top - heading.getBoundingClientRect().height
    scroller.scrollTo({ top, behavior })
    return true
  }
  // De tabelpiep onder de kaart volgt de cursor met een eigen tween op scrollTop (U62). Een native
  // `scrollTo({ behavior: 'smooth' })` doet in Firefox voor Android niets zolang er een vinger op het
  // scherm ligt (PO 2026-10-08: de rij sprong bij slepen en tweende alleen bij afspelen en na een fling);
  // met eigen frames zijn slepen, fling en afspelen per constructie gelijk.
  let tablePreviewFrame: number | undefined
  let tablePreviewPositioned = false
  let tableFollowFrame: number | undefined
  // Doel-scrollTop per uurrij: één meting per tabel-layout, daarna leest volgen niets meer uit de layout.
  let tableRowTops: Map<number, number> | undefined
  function measureTableRowTops(scroller: HTMLElement): Map<number, number> | undefined {
    const heading = forecastPanelElement.querySelector<HTMLElement>('thead')
    if (!heading) return undefined
    const scrollerTop = scroller.getBoundingClientRect().top
    const headingHeight = heading.getBoundingClientRect().height
    const tops = new Map<number, number>()
    for (const row of forecastPanelElement.querySelectorAll<HTMLElement>('tr[data-epoch]')) {
      tops.set(Number(row.dataset.epoch), scroller.scrollTop + row.getBoundingClientRect().top - scrollerTop - headingHeight)
    }
    return tops
  }
  function stopTableFollow(): void {
    if (tableFollowFrame !== undefined) cancelAnimationFrame(tableFollowFrame)
    tableFollowFrame = undefined
  }
  function followTableToEpoch(epoch: number, animate: boolean): boolean {
    const scroller = forecastPanelElement.querySelector<HTMLElement>('.table-scroll')
    if (!scroller) return false
    tableRowTops ??= measureTableRowTops(scroller)
    if (!tableRowTops?.size) return false
    const nearestEpoch = tableRowTops.has(epoch) ? epoch : [...tableRowTops.keys()].reduce((nearest, candidate) =>
      Math.abs(candidate - epoch) < Math.abs(nearest - epoch) ? candidate : nearest)
    const target = tableRowTops.get(nearestEpoch)!
    stopTableFollow()
    const from = scroller.scrollTop
    if (!animate || Math.abs(target - from) < 1) {
      scroller.scrollTop = target
      return true
    }
    const startedAt = performance.now()
    const step = (time: number) => {
      const progress = Math.min(1, Math.max(0, (time - startedAt) / TABLE_FOLLOW_MS))
      scroller.scrollTop = from + (target - from) * (1 - (1 - progress) ** 3)
      tableFollowFrame = progress < 1 ? requestAnimationFrame(step) : undefined
    }
    tableFollowFrame = requestAnimationFrame(step)
    return true
  }
  function queueTablePreview(epoch: number, animate: boolean): void {
    if (tablePreviewFrame !== undefined) cancelAnimationFrame(tablePreviewFrame)
    tablePreviewFrame = requestAnimationFrame(() => {
      tablePreviewFrame = undefined
      if (!tableViewAvailable() || tableScrollOpen()) return
      const positioned = followTableToEpoch(epoch, animate)
      if (positioned) tablePreviewPositioned = true
    })
  }
  createEffect(() => {
    const epoch = tablePreviewEpoch()
    if (!tableViewAvailable() || tableScrollOpen()) return
    queueTablePreview(epoch, tablePreviewPositioned && !reducedMotion.matches)
  })
  onMount(() => {
    const scroller = forecastPanelElement.querySelector<HTMLElement>('.table-scroll')
    const table = forecastPanelElement.querySelector<HTMLElement>('.forecast-table')
    if (!scroller || !table || typeof ResizeObserver === 'undefined') return
    const reposition = (animate: boolean) => {
      if (!tableViewAvailable() || tableScrollOpen()) return
      queueTablePreview(untrack(tablePreviewEpoch), animate)
    }
    // Rijen die bijladen veranderen de tabelhoogte: opnieuw meten, en een lopende tween loopt door naar
    // het nieuwe doel in plaats van te verspringen.
    const resized = () => {
      tableRowTops = undefined
      reposition(tableFollowFrame !== undefined && !reducedMotion.matches)
    }
    // Onze eigen frames eindigen elk als scroll; alleen een scroll van buitenaf wordt rechtgezet.
    const scrollEnded = () => { if (tableFollowFrame === undefined) reposition(false) }
    const observer = new ResizeObserver(resized)
    observer.observe(scroller)
    observer.observe(table)
    scroller.addEventListener('scrollend', scrollEnded, { passive: true })
    onCleanup(() => {
      observer.disconnect()
      scroller.removeEventListener('scrollend', scrollEnded)
    })
  })
  onCleanup(stopTableFollow)
  onCleanup(() => { if (tablePreviewFrame !== undefined) cancelAnimationFrame(tablePreviewFrame) })

  function selectTableTime(epoch: number): void {
    jumpToTime(epoch)
    if (tableViewOpen() && scrollTableToEpoch(epoch, reducedMotion.matches ? 'auto' : 'smooth')) tablePreviewPositioned = true
  }

  function scrollToTable(): void {
    setTableViewTarget('table')
    forecastPanelElement.scrollIntoView({ behavior: reducedMotion.matches ? 'auto' : 'smooth', block: 'start' })
  }

  function scrollToMap(): void {
    setTableViewTarget('map')
    window.scrollTo({ top: 0, behavior: reducedMotion.matches ? 'auto' : 'smooth' })
  }

  function openTableFromPeek(event: MouseEvent): void {
    if (tableViewOpen() || !tableViewAvailable()) return
    if (event.target instanceof Element && event.target.closest('button.column-mode')) return
    scrollToTable()
  }

  return <main class="app-shell" classList={{ 'still-view': stillMode, 'table-view-open': tableViewOpen(), 'table-scroll-open': tableViewAvailable() && tableScrollOpen() }} data-generated={manifest()?.generated} data-epoch={cursorMinute()}>
    <section class="map-shell" aria-label="Regenkaart van Nederland" data-rendering={mapRendering()} data-rain-opacity={rainFocusOpacity(focus(), windFocus()).toFixed(2)} data-focus={focus().toFixed(2)} data-wind-focus={windFocus().toFixed(2)} data-wind-intensity={focusedWindTuning().intensity.toFixed(2)} data-isolines={isolineCount()} data-isobars={isobarCount()}>
      <div ref={mapElement} class="map" />
      <div ref={splashElement} class="map-splash" classList={{ ready: mapReady() }} aria-hidden={mapReady()}>
        <div class="map-splash-veil" />
        <div class="map-splash-mark">
          <img src="/droplet.svg" alt="" />
          <strong>motregen.nl</strong>
        </div>
      </div>
      <Show when={stillMode}>
        <div class="map-clock still-clock">
          <div class="freshness-trigger">
            <ClockFace time={formatTime(cursorMinute())} day={formatWeekdayShort(cursorMinute())} />
            <small class="clock-day">{{ weather: 'Regen', air: 'Lucht', feels: 'Gevoelstemperatuur', wind: 'Wind' }[initialPresets.mode ?? 'weather']}</small>
          </div>
        </div>
        <footer class="still-attribution">KNMI · © OpenStreetMap</footer>
      </Show>
      <Show when={!stillMode}>
        <About theme={theme()} onTheme={(choice) => { usage.setTheme(choice); setTheme(choice) }} expressive={expressive()} onExpressive={(enabled) => { setExpressive(enabled); storeExpressive(enabled) }}
          windUnit={windUnit()} onWindUnit={(unit) => { usage.setUnit(unit); setWindUnit(unit); localStorage.setItem('motregen-wind-unit', unit) }} onOpen={() => usage.mark('about')} onShare={shareCurrentState} shareNotice={shareNotice()} onTripleTap={() => setPerfVisible((visible) => !visible)} />
        <Show when={updateReady()}><aside class="update-toast" role="status">Nieuwe versie — <button type="button" onClick={() => void updateServiceWorker?.()}>herlaad</button></aside></Show>
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
            firstRainLate={firstRainLate()}
            onFirstRainLate={(late) => { setFirstRainLate(late); localStorage.setItem(FIRST_RAIN_STORAGE_KEY, late ? 'laat' : 'vroeg') }}
            frameSky={frameSky()}
            onFrameSky={(enabled) => { setFrameSky(enabled); localStorage.setItem(FRAME_SKY_STORAGE_KEY, enabled ? 'aan' : 'uit') }}
            mobileWind={mobileWind()}
            onMobileWind={(level) => { setMobileWind(level); localStorage.setItem(MOBILE_WIND_STORAGE_KEY, level) }}
            clockSkyTint={clockSkyTint()}
            onClockSkyTint={(enabled) => { setClockSkyTint(enabled); localStorage.setItem(CLOCK_SKY_TINT_STORAGE_KEY, enabled ? 'mee-tinten' : 'wit') }}
            windTuning={windTuning()}
            onWindTuning={tuneWind}
            perfVisible={perfVisible()}
            onPerfVisible={setPerfVisible}
            profileRecording={profileState() === 'recording'}
            onProfileRecord={() => void startProfile()}
            onColdProfile={coldProfile}
            onReplaySplash={replaySplash}
            onReset={resetAllSettings}
            resetNotice={resetNotice()}
            usageBody={usageBody()}
          />
        </Show>
        <Freshness mapEpoch={cursorMinute()} mapFrame={timeline()[cursorFrame()]} manifest={manifest()} refresh={manifestRefresh()} onRefresh={refreshManifest} onOpen={pauseForFreshness} onClose={resumeAfterFreshness} onShare={shareCurrentState} shareNotice={shareNotice()}
          paused={!playing()} onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)}
          timeline={timeline()} cursor={cursor()} onCursor={clockScrub} sky={clockSkyTint() ? chromeSky() : undefined} />
      </Show>
    </section>
    <Show when={!stillMode}>
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
          onIntent={completeOnIntent}
          onPlaying={setPlayingFromScrubber}
          glideRate={glideRate()}
          onPlayPressed={() => usage.mark('play')}
          clouds={{ timeline: cloudTimelines(), values: cloudValues() }}
          sky={{ radiation: { timeline: radiationTimeline(), values: radiationSeries() }, sinElevation: sunElevationAt() }}
          wind={{ timeline: windUFrames(), speed: windSpeedSeries(), gustTimeline: gustTimeline(), gust: gustSeries(), unit: windUnit() }}
          expressive={expressive()}
          frameSky={frameSky()}
          mix={{ wind: windFocus(), air: airFocus(), temperature: focus() }}
          temperature={{ timeline: feelsLikeTimeline(), values: feelsLikeSeries(), airTimeline: tempTimeline(), air: temperatureSeries(), stops: temperatureRange() && paletteStops(temperatureRange()!) }}
        />
        <section
          ref={(element) => { forecastPanelElement = element; forecastPanel = element }}
          id="forecast-table-view"
          class="forecast-panel"
          onClick={openTableFromPeek}
        >
          <div class="table-scroll">
            <ForecastTable
              rows={forecast()}
              series={{
                rain: rainSeries(), uv: uvSeries(), uvClear: uvClearSeries(), radiation: radiationSeries(), temperature: temperatureSeries(),
                feelsLike: feelsLikeSeries(), cloud: cloudSeries(), windU: windUSeries(), windV: windVSeries(), gust: gustSeries(),
              }}
              location={location()}
              windUnit={windUnit()}
              dayNight={expressive()}
              headSky={chromeSky()}
              onVisibleRows={inViewOnly ? (epochs) => setPeekRows(new Set(epochs)) : undefined}
              columns={{ weather: hasWeatherIcons(), air: hasWeatherIcons() || uvTimeline().length > 0 || radiationTimeline().length > 0, temperature: hasTemperature(), wind: hasWind() }}
              loadedUntil={pointLoadStage() === 'complete' ? Number.POSITIVE_INFINITY : manifestNow() + PASSIVE_FORECAST_HOURS * 3_600_000}
              historyInline={historyInline()}
              historyOpen={historyOpen()}
              historyLoaded={historyRowsWanted() || pointLoadStage() === 'complete'}
              mobileTableOpen={tableModeSelected()}
              onOpenMobileTable={tableViewAvailable() ? scrollToTable : undefined}
              onSelectMobileMode={tableViewAvailable() ? scrollToMap : undefined}
              onNeedRows={() => { void completePointSeries(pointLoad, 'high') }}
              onNeedHistory={() => { void loadHistoryRows() }}
              onSelectTime={selectTableTime}
              onOpenHistory={() => {
                if (!historyOpen()) usage.mark('history')
                setHistoryOpen((open) => !open)
                void loadHistoryRows()
              }}
              focus={{ pinned: focusPinned(), onPin: pinFocusMode, onFocus: (mode, source, active) => {
                if (mode === 'temperature' && source === 'table' && active) usage.mark('hover')
                focusMode.set(mode, source, active)
              } }}
            />
          </div>
        </section>
      </aside>
    </Show>
    <Show when={!stillMode && perfVisible()}><PerfHud
      monitor={perf}
      isolines={isolineCounters}
      windStats={() => windLayer?.windProfile()}
      profile={profileMode || devMode ? {
        state: profileState(), recording: profileRecording(), notice: profileNotice(),
        onRecord: () => void startProfile(), onStop: () => profileStop?.abort(), onCold: coldProfile, onSend: sendProfile,
      } : undefined}
    /></Show>
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
