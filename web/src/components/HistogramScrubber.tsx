import { createEffect, createMemo, createSignal, createUniqueId, For, Index, onCleanup, onMount, Show, untrack } from 'solid-js'
import { CLOUD_LAYERS, cloudBand, type CloudSeries } from '../core/cloud-section'
import type { TimelineFrame } from '../core/contract'
import { classifyRain, RAIN_BANDS, rainChartMaximum, rainChartPosition, rainColor } from '../core/rain-chart'
import { seriesValueAt, timelineCursorAtEpoch, timelineEpochAtCursor, timelineZones } from '../core/time-model'
import { summarizeWind, WIND_UNIT_LABELS, type WindUnit } from '../core/weather'
import { BEAUFORT_STOPS, windColor } from '../core/wind-layer'
import type { PaletteStops } from '../core/temperature-palette'

interface Props {
  timeline: TimelineFrame[]
  values: Array<number | null>
  loaded?: boolean[]
  cursor: number
  now: number
  playing: boolean
  loading: boolean
  loadStage?: 'initial' | 'direct' | 'window' | 'complete'
  locationLabel: string
  onCursor: (cursor: number) => void
  onIntent?: () => void
  onPlaying: (playing: boolean) => void
  /** Alleen een expliciete afspeelkeuze, niet het hervatten na slepen. */
  onPlayPressed?: () => void
  /** Spatie: bewust pauzeren/afspelen (niet het korte pauzeren tijdens interactie), voor de ▶ in de klok. */
  onPauseToggle?: (playing: boolean) => void
  /** De drie wolkenlagen (U37) — sinds U34 alleen in de modus Wolken, en dan zonder regen. */
  clouds?: CloudSeries
  /** Totale bewolking als één band boven het regenhistogram, in de weermodus (PO 2026-09-25 live, U34). */
  cloudCover?: { timeline: TimelineFrame[]; values: Array<number | null> }
  /** Tijdens gelijkmatig afspelen: epoch-ms per ms; de baan schuift dan op de compositor (U41). */
  glideRate?: number
  /** Wind in de windmodus (U34): gemiddelde snelheid (m/s) als vlakte, vlagen als stippellijn. */
  wind?: { timeline: TimelineFrame[]; speed: Array<number | null>; gustTimeline: TimelineFrame[]; gust: Array<number | null>; unit: WindUnit }
  /**
   * Focus-tweens (0–1) van de modi: de grafiek vloeit mee over zoals de kaart, bij hover én pin (U34).
   * Zonder `mix` telt een meegegeven `clouds`/`wind` als volledig actief.
   */
  mix?: { wind: number; clouds: number; temperature: number }
  /** Gevoelstemperatuur (vlakte, kaartpalet) en luchttemperatuur (lijn) in de Gevoel-modus (U34). */
  temperature?: { timeline: TimelineFrame[]; values: Array<number | null>; airTimeline?: TimelineFrame[]; air?: Array<number | null>; stops?: PaletteStops }
}

const CLOUD_LAYER_LABELS = { high: 'hoogwolken', mid: 'middenwolken', low: 'laagwolken' } as const
// Deel van de plothoogte voor de bewolkingsband boven de regen.
const CLOUD_COVER_SHARE = 0.3
// Wolkenlagen buiten de wolkenmodus iets subtieler (PO 2026-09-25 live); de wolkenmodus tweent naar vol.
const CLOUD_LAYERS_DEFAULT_OPACITY = 0.5

const HOUR = 3_600_000
// PO 2026-09-25 live (U34), naar WarnWetter: de cursor staat vast op CURSOR_FRACTION van de breedte en
// de tijdlijn schuift eronder; zoveel uur past in de breedte. Vervangt de tijdsbereikknoppen.
const VIEW_HOURS = 8
const CURSOR_FRACTION = 1 / 3
const hourLabelSteps = [1, 2, 3, 6, 12, 24]
// Wide enough for "23u" at the axis font size plus breathing room.
const minimumHourLabelSpacingPx = 34
const TAP_SLOP_PX = 4
// Na slepen, scrollen of tikken hervat het afspelen pas na zoveel rust (PO 2026-09-25 live: eerst kijken).
const RESUME_IDLE_MS = 4_000
// Breedteschatting van een daglabel (10 px hoofdletters met spatiëring) en de marge tot de plotrand.
const DAY_LABEL_CHAR_PX = 7.2
const DAY_LABEL_PAD_PX = 8
const DAY_LABEL_INSET_PX = 4
const NOW_LABEL_CLEARANCE_PX = 24
const WALL_KNEE_PX = 40
// Windgrafiek: schaal minstens tot 12 m/s (Bft 6) zodat een windstille dag niet "stormt".
const WIND_CHART_MIN_MS = 12
const WIND_CHART_TOP_PX = 10
// Temperatuurgrafiek: minstens zoveel graden over de hoogte, anders lijkt een vlakke dag grillig.
const TEMPERATURE_CHART_MIN_SPAN_C = 8
const VIEW_SHIFT_PX = 6
// Kortere slides zijn het niet waard (afspelen tikt toch op 30 Hz).
const SLIDE_MIN_MS = 500
// Uitloop na een veeg: snelheid (px/ms) halveert per ~110 ms.
const FLING_DECAY_PER_MS = 0.9937
const FLING_MIN_SPEED = 0.02
// Afspelen schuift de baan met één compositor-animatie; wijkt de cursor meer af, dan opnieuw ingezet.
const SLIDE_TOLERANCE_PX = 2
const SLIDE_DURATION_MS = 120_000

export function hourLabelStep(spanHours: number, plotWidthPx: number): number {
  const fit = Math.max(1, plotWidthPx / minimumHourLabelSpacingPx)
  return hourLabelSteps.find((step) => spanHours / step <= fit) ?? hourLabelSteps.at(-1)!
}

export default function HistogramScrubber(props: Props) {
  let plotElement!: HTMLDivElement
  let surfaceElement!: HTMLDivElement
  let trackElement!: HTMLDivElement
  let drag: { x: number; epoch: number; moved: boolean; lastX: number; lastTime: number; velocity: number } | undefined
  let fling: number | undefined
  let resumeTimer: number | undefined
  const [resumePlayback, setResumePlayback] = createSignal(false)
  const [plotWidth, setPlotWidth] = createSignal(320)
  const [plotHeight, setPlotHeight] = createSignal(160)
  onMount(() => {
    // Scrollen pauzeert het afspelen zoals slepen en hervat RESUME_IDLE_MS na de laatste beweging;
    // anders liep het afspelen tijdens het scrollen door en sprong het bij de horizon terug (U34).
    const wheel = (event: WheelEvent) => {
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      if (!delta || !props.timeline.length) return
      event.preventDefault()
      stopFling()
      props.onIntent?.()
      pauseForPointerInteraction()
      resumeAfterPointerInteraction()
      scrollToEpoch(cursorEpoch() + delta * (event.deltaMode === 1 ? 16 : 1) / pxPerMs())
    }
    surfaceElement.addEventListener('wheel', wheel, { passive: false })
    onCleanup(() => { surfaceElement.removeEventListener('wheel', wheel); window.clearTimeout(resumeTimer) })
    onCleanup(stopFling)
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return
      setPlotWidth(entry.contentRect.width)
      setPlotHeight(entry.contentRect.height)
    })
    observer.observe(plotElement)
    onCleanup(() => observer.disconnect())
  })
  const timelineStart = createMemo(() => props.timeline[0]?.epoch ?? 0)
  const timelineEnd = createMemo(() => props.timeline.at(-1)?.epoch ?? timelineStart())
  const pxPerMs = createMemo(() => Math.max(1, plotWidth()) / (VIEW_HOURS * HOUR))
  const xAt = (epoch: number) => (epoch - timelineStart()) * pxPerMs()
  const trackWidth = createMemo(() => Math.max(plotWidth(), xAt(timelineEnd()) + plotWidth()))
  const maximum = createMemo(() => rainChartMaximum(props.values))
  // Overvloeien tussen de weergaven op de focus-tweens (U34): regen+bewolking, wolkenlagen, wind.
  const cloudsMix = () => props.clouds ? props.mix ? props.mix.clouds : 1 : 0
  const windMix = () => props.wind ? props.mix ? props.mix.wind : 1 : 0
  const temperatureMix = () => props.temperature ? props.mix ? props.mix.temperature : 1 : 0
  // Wolkenlagen + regen zijn de basis (PO 2026-09-25 live: altijd de drie lagen, regen eroverheen);
  // alleen wind en temperatuur hebben een eigen grafiek waar de basis naar wegvloeit.
  const baseOpacity = () => 1 - Math.max(windMix(), temperatureMix())
  const coverOpacity = () => props.cloudCover ? Math.min(baseOpacity(), 1 - (props.mix?.temperature ?? 0)) : 0
  const baseVisible = createMemo(() => baseOpacity() > 0)
  const view = () => cloudsMix() >= 0.5 ? 'clouds' : windMix() >= 0.5 ? 'wind' : temperatureMix() >= 0.5 ? 'temperature' : coverOpacity() >= 0.5 ? 'cover' : 'rain'
  // Binnenkomende weergave schuift een paar px omhoog terwijl hij invloeit.
  const layerStyle = (opacity: number) => ({ opacity, transform: `translateY(${((1 - opacity) * VIEW_SHIFT_PX).toFixed(2)}px)` })
  const cloudHeight = createMemo(() => props.cloudCover ? plotHeight() * CLOUD_COVER_SHARE : 0)
  // Regen valt onder de wolken: de regenschaal begint onder de doorsnede.
  const rainTop = createMemo(() => cloudHeight() && cloudHeight() + 4)
  const y = (value: number) => rainTop() + (plotHeight() - rainTop()) * (1 - rainChartPosition(value, maximum()))
  const barTop = (value: number | null | undefined) => value == null || value <= 0 ? plotHeight() : Math.min(plotHeight() - 2, y(value))
  const bars = createMemo(() => {
    const frames = props.timeline
    if (!frames.length || !baseVisible()) return []
    const pitch = frames.length > 1 ? xAt(frames[1]!.epoch) - xAt(frames[0]!.epoch) : plotWidth()
    const gap = pitch > 6 ? 1.5 : pitch > 3.5 ? 1 : 0.5
    return frames.map((frame, index) => {
      const value = props.values[index]
      const leftEpoch = index === 0 ? frame.epoch - (frames[1] ? (frames[1].epoch - frame.epoch) / 2 : HOUR / 2) : (frames[index - 1]!.epoch + frame.epoch) / 2
      const rightEpoch = index === frames.length - 1 ? frame.epoch + (index > 0 ? (frame.epoch - frames[index - 1]!.epoch) / 2 : HOUR / 2) : (frame.epoch + frames[index + 1]!.epoch) / 2
      const x = xAt(leftEpoch)
      const pending = props.loaded ? !props.loaded[index] : false
      const right = xAt(rightEpoch)
      const barWidth = Math.max(1.2, right - x - gap)
      return { x: (x + right - barWidth) / 2, width: barWidth, top: barTop(value), value: value ?? 0, pending, past: frame.epoch < props.now }
    })
  })
  // Geen y-as (PO 2026-09-25 live): de waarde staat bij de cursor, niet op hulplijnen.
  const cloudId = createUniqueId()
  // Eén keer over de hele tijdlijn in baancoördinaten (U34): de baan schuift met een transform, dus de
  // wolken schuiven gratis mee en worden niet per afspeelframe opnieuw getekend.
  const cloudWidth = createMemo(() => Math.max(1, xAt(timelineEnd())))
  const geometry = (top: number, height: number) => ({ width: cloudWidth(), top, height, start: timelineStart(), end: timelineEnd() })
  const coverBands = createMemo(() => {
    const cover = props.cloudCover
    if (!cover) return []
    // Eén band in de stijl van de middelste laag: vorm en dekking volgen de totale bewolking.
    return [{ key: 'total', label: '', top: 0, height: cloudHeight(), ...cloudBand(cover.timeline, cover.values, 'mid', geometry(0, cloudHeight())) }]
  })
  const layerBands = createMemo(() => {
    const clouds = props.clouds
    if (!clouds) return []
    const bandHeight = plotHeight() / CLOUD_LAYERS.length
    return CLOUD_LAYERS.map((layer, index) => ({
      key: layer,
      label: CLOUD_LAYER_LABELS[layer],
      top: index * bandHeight,
      height: bandHeight,
      ...cloudBand(clouds.timeline[layer], clouds.values[layer], layer, geometry(index * bandHeight, bandHeight)),
    }))
  })
  const cloudBands = () => [...coverBands(), ...layerBands()]
  // Windgrafiek in baancoördinaten (één keer per data/afmeting, schuift met de baan mee).
  const windChart = createMemo(() => {
    const wind = props.wind
    if (!wind || !wind.timeline.length) return undefined
    const gustAt = (epoch: number) => seriesValueAt(wind.gustTimeline, wind.gust, epoch, 30 * 60_000)
    const points = wind.timeline.map((frame, index) => ({ x: xAt(frame.epoch), speed: wind.speed[index] ?? null, gust: gustAt(frame.epoch) }))
    const max = Math.max(WIND_CHART_MIN_MS, ...points.map((point) => Math.max(point.speed ?? 0, point.gust ?? 0) * 1.12))
    const bottom = plotHeight() - 1
    const yOf = (speed: number) => bottom - (bottom - WIND_CHART_TOP_PX) * Math.min(1, Math.max(0, speed) / max)
    const runs = (pick: (point: typeof points[number]) => number | null) => {
      const result: Array<Array<[number, number]>> = []
      let run: Array<[number, number]> = []
      for (const point of points) {
        const value = pick(point)
        if (value == null) { if (run.length) result.push(run); run = []; continue }
        run.push([point.x, yOf(value)])
      }
      if (run.length) result.push(run)
      return result
    }
    const speedRuns = runs((point) => point.speed)
    return {
      area: speedRuns.map((run) => `${smoothPath(run)}L${run.at(-1)![0]} ${bottom}L${run[0]![0]} ${bottom}Z`),
      line: speedRuns.map(smoothPath),
      // Vlagen gestapeld op de gemiddelde wind (PO 2026-09-25 live): de band tussen beide lijnen.
      gust: bandRuns(points.map((point) => point.x), points.map((point) => point.speed), points.map((point) => point.gust == null || point.speed == null ? null : Math.max(point.gust, point.speed)), yOf),
      stops: BEAUFORT_STOPS.map((speed) => ({ offset: Math.min(1, speed / max), color: windColor(speed, 'light').map((channel) => Math.round(channel * 255)).join(' ') })),
      yOf,
      bottom,
      top: yOf(max),
    }
  })
  const windId = createUniqueId()
  const temperatureChart = createMemo(() => {
    const series = props.temperature
    if (!series || !series.timeline.length) return undefined
    const known = [...series.values, ...series.air ?? []].filter((value): value is number => value != null)
    if (!known.length) return undefined
    const center = (Math.min(...known) + Math.max(...known)) / 2
    const half = Math.max(TEMPERATURE_CHART_MIN_SPAN_C, Math.max(...known) - Math.min(...known) + 2) / 2
    const low = center - half, high = center + half
    const bottom = plotHeight() - 1
    const yOf = (value: number) => bottom - (bottom - WIND_CHART_TOP_PX) * (value - low) / (high - low)
    const runs = curveRuns(series.timeline.map((frame) => xAt(frame.epoch)), series.values, yOf)
    const stops = Array.from({ length: 9 }, (_, index) => {
      const value = low + (high - low) * index / 8
      return { offset: index / 8, color: paletteColor(value, series.stops) }
    })
    return {
      area: runs.map((run) => `${smoothPath(run)}L${run.at(-1)![0]} ${bottom}L${run[0]![0]} ${bottom}Z`),
      line: runs.map(smoothPath),
      air: series.airTimeline && series.air ? curveRuns(series.airTimeline.map((frame) => xAt(frame.epoch)), series.air, yOf).map(smoothPath) : [],
      // Lint tussen gevoel en lucht: hoeveel kouder/warmer het voelt (PO 2026-09-25 live).
      ribbon: (() => {
        const airTimeline = series.airTimeline, air = series.air
        if (!airTimeline || !air) return []
        const xs = series.timeline.map((frame) => xAt(frame.epoch))
        const airAt = series.timeline.map((frame) => seriesValueAt(airTimeline, air, frame.epoch, 30 * 60_000))
        const lower = series.values.map((value, index) => value == null || airAt[index] == null ? null : Math.min(value, airAt[index]!))
        const upper = series.values.map((value, index) => value == null || airAt[index] == null ? null : Math.max(value, airAt[index]!))
        return bandRuns(xs, lower, upper, yOf)
      })(),
      stops,
      yOf,
      bottom,
      top: yOf(high),
    }
  })
  const temperatureId = createUniqueId()
  const hourStep = createMemo(() => hourLabelStep(VIEW_HOURS, plotWidth()))
  const xTicks = createMemo(() => {
    if (!props.timeline.length) return []
    const firstHour = Math.ceil(timelineStart() / HOUR) * HOUR
    const ticks = []
    const step = hourStep()
    for (let epoch = firstHour; epoch <= timelineEnd(); epoch += HOUR) {
      if (new Date(epoch).getHours() % step === 0) ticks.push({ epoch, x: xAt(epoch) })
    }
    return ticks
  })
  const nowX = createMemo(() => xAt(Math.max(timelineStart(), Math.min(timelineEnd(), props.now))))
  const cursorEpoch = createMemo(() => timelineEpochAtCursor(props.timeline, props.cursor))
  // Aan begin en eind loopt de baan tegen een muur en beweegt de cursor zelf (PO 2026-09-25 live, U34),
  // met een zachte knie van WALL_KNEE_PX zodat de overgang geen knik heeft.
  const freeOffset = () => plotWidth() * CURSOR_FRACTION - xAt(cursorEpoch())
  const wallBounds = () => ({ lower: Math.min(0, plotWidth() - xAt(timelineEnd())), upper: 0 })
  const offset = () => { const { lower, upper } = wallBounds(); return wallClamp(freeOffset(), lower, upper, WALL_KNEE_PX) }
  const cursorX = () => sliding() ? plotWidth() * CURSOR_FRACTION : offset() + xAt(cursorEpoch())
  const cursorValue = createMemo(() => props.values[Math.round(props.cursor)])
  const cursorLayers = createMemo(() => {
    const clouds = props.clouds
    if (!clouds) return []
    const epoch = cursorEpoch()
    return layerBands().flatMap((band) => {
      const value = seriesValueAt(clouds.timeline[band.key as keyof typeof clouds.timeline], clouds.values[band.key as keyof typeof clouds.values], epoch, 30 * 60_000)
      // Een lege laag krijgt geen label (PO 2026-09-25 live).
      return value == null || Math.round(value) === 0 ? [] : [{ y: band.top + band.height / 2, text: `${band.label} ${Math.round(value)}%` }]
    })
  })
  const cursorCover = createMemo(() => {
    const cover = props.cloudCover
    if (!cover) return undefined
    const value = seriesValueAt(cover.timeline, cover.values, cursorEpoch(), 30 * 60_000)
    return value == null ? undefined : { y: cloudHeight() / 2, text: `${Math.round(value)}%` }
  })
  const cursorWind = createMemo(() => {
    const wind = props.wind
    const chart = windChart()
    if (!wind || !chart) return undefined
    const epoch = cursorEpoch()
    const speed = seriesValueAt(wind.timeline, wind.speed, epoch, 30 * 60_000)
    if (speed == null) return undefined
    const gust = seriesValueAt(wind.gustTimeline, wind.gust, epoch, 30 * 60_000)
    const summary = summarizeWind(speed, 0, gust, wind.unit)!
    const unit = WIND_UNIT_LABELS[wind.unit]
    // Twee puntjes op de cursor: gemiddelde wind en (als die een stap hoger ligt) de vlaag.
    return [
      { y: chart.yOf(speed), text: `${summary.value} ${unit}`, gust: false, below: summary.gust != null && gust != null },
      ...summary.gust == null || gust == null ? [] : [{ y: chart.yOf(gust), text: `${summary.gust} ${unit}`, gust: true, below: false }],
    ]
  })
  const cursorTemperature = createMemo(() => {
    const series = props.temperature
    const chart = temperatureChart()
    if (!series || !chart) return undefined
    const epoch = cursorEpoch()
    const feels = seriesValueAt(series.timeline, series.values, epoch, 30 * 60_000)
    const air = series.airTimeline && series.air ? seriesValueAt(series.airTimeline, series.air, epoch, 30 * 60_000) : null
    // Twee puntjes zoals bij wind: gevoel en lucht; het hoogste label boven, het laagste eronder.
    const readings = [
      ...feels == null ? [] : [{ value: feels, text: `${Math.round(feels)}° gevoel`, air: false }],
      ...air == null ? [] : [{ value: air, text: `${Math.round(air)}° lucht`, air: true }],
    ]
    return readings.map((reading) => ({ y: chart.yOf(reading.value), text: reading.text, air: reading.air, below: readings.length > 1 && reading.value < Math.max(...readings.map((other) => other.value)) }))
  })
  const cursorZone = createMemo(() => {
    const frame = props.timeline[Math.round(props.cursor)] ?? props.timeline[0]
    return frame ? timelineZones([frame])[0] : undefined
  })
  // Voorleestekst op minuten: niet per afspeeltik opnieuw formatteren (U41).
  const cursorMinute = createMemo(() => Math.floor(cursorEpoch() / 60_000) * 60_000)
  const valueText = createMemo(() => {
    const epoch = cursorMinute()
    const time = new Date(epoch).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
    const value = cursorValue()
    const rain = value == null ? 'geen data' : value < 0.05 ? 'droog' : `${formatRate(value)}, ${RAIN_BANDS.find((band) => band.key === classifyRain(value))!.label.toLowerCase()}`
    const source = cursorZone()?.label.toLowerCase()
    return `${(dayLabel(epoch, props.now) || 'vandaag').toLowerCase()} ${time}, ${rain}, ${source}`
  })
  // Alleen toetsstappen en tikken krijgen een korte glijbeweging; slepen en afspelen volgen direct.
  const [gliding, setGliding] = createSignal(false)
  const tween = () => gliding() && !props.playing
  // Een transform per afspeeltik kostte Chromium per tik een Layerize van de hele pagina (U41, ~40 %
  // van de hoofddraad). Afspelen loopt lineair in de tijd, dus de compositor kan de baan schuiven;
  // de inline transform staat dan stil en volgt pas weer bij pauze, slepen of terugglijden.
  let slide: { animation: Animation; offset: number; startedAt: number; speed: number; segments: DaySegment[]; labels: Animation[] } | undefined
  const [sliding, setSliding] = createSignal(false)
  const shownOffset = createMemo(() => sliding() ? untrack(offset) : offset())
  createEffect(() => {
    const speed = props.playing && !tween() ? (props.glideRate ?? 0) * pxPerMs() : 0
    const current = offset()
    const now = Number(document.timeline?.currentTime ?? performance.now())
    const segments = daySegments()
    if (slide && speed > 0 && slide.speed === speed && slide.segments === segments && Math.abs(slide.offset - speed * (now - slide.startedAt) - current) < SLIDE_TOLERANCE_PX) return
    slide?.animation.cancel()
    for (const labelAnimation of slide?.labels ?? []) labelAnimation.cancel()
    slide = undefined
    // Alleen lineair schuiven buiten de knieën van de muren; daar volgt de baan per tik (U34).
    const { lower, upper } = wallBounds()
    const free = freeOffset()
    const duration = Math.min(SLIDE_DURATION_MS, (current - (lower + WALL_KNEE_PX)) / Math.max(speed, 1e-9))
    const clear = Math.abs(current - free) < 0.01 && free <= upper - WALL_KNEE_PX && duration >= SLIDE_MIN_MS
    if (speed <= 0 || !clear || typeof trackElement.animate !== 'function') { setSliding(false); return }
    const animation = trackElement.animate(
      [{ transform: `translateX(${current}px)` }, { transform: `translateX(${current - speed * duration}px)` }],
      { duration, easing: 'linear', fill: 'forwards' },
    )
    // Vanaf de frametijd waarop de cursor berekend is, niet pas vanaf de volgende commit.
    animation.startTime = now
    const end = current - speed * duration
    const labels = segments.flatMap((segment, index) => {
      const element = dayLabelElements[index]
      if (!element) return []
      const labelAnimation = element.animate(stickyKeyframes(segment, current, end), { duration, easing: 'linear', fill: 'forwards' })
      labelAnimation.startTime = now
      return [labelAnimation]
    })
    slide = { animation, offset: current, startedAt: now, speed, segments, labels }
    setSliding(true)
  })
  onCleanup(() => { slide?.animation.cancel(); for (const labelAnimation of slide?.labels ?? []) labelAnimation.cancel() })
  const dayMarkers = createMemo(() => {
    if (!props.timeline.length) return []
    const today = new Date(props.now)
    today.setHours(0, 0, 0, 0)
    const day = new Date(timelineStart())
    day.setHours(0, 0, 0, 0)
    day.setDate(day.getDate() + 1)
    const markers: Array<{ epoch: number; label: string }> = []
    while (day.getTime() <= timelineEnd()) {
      markers.push({ epoch: day.getTime(), label: dayLabel(day.getTime(), today.getTime()) || 'Vandaag' })
      day.setDate(day.getDate() + 1)
    }
    return markers
  })
  // Daglabels plakken links in het plot zolang hun dag in beeld is; het volgende label duwt ze weg
  // (PO 2026-09-25 live, U34). In baancoördinaten: links = min(max(a + verschuiving, inset), b + verschuiving),
  // stuksgewijs lineair in de verschuiving, dus tijdens afspelen ook als compositor-animatie (zie slide).
  const daySegments = createMemo(() => {
    if (!props.timeline.length) return []
    const today = new Date(props.now)
    today.setHours(0, 0, 0, 0)
    const first = { epoch: timelineStart(), label: dayLabel(timelineStart(), today.getTime()) || 'Vandaag' }
    const segments = [first, ...dayMarkers()]
    return segments.map((segment, index) => {
      const width = segment.label.length * DAY_LABEL_CHAR_PX + DAY_LABEL_PAD_PX
      const next = segments[index + 1]
      return { label: segment.label, a: xAt(segment.epoch), b: xAt(next ? next.epoch : timelineEnd()) - width - DAY_LABEL_INSET_PX }
    })
  })
  const dayLabelElements: HTMLSpanElement[] = []
  const lastCursor = () => Math.max(0, props.timeline.length - 1)

  function scrollToEpoch(epoch: number): void {
    const clamped = Math.max(timelineStart(), Math.min(timelineEnd(), epoch))
    props.onCursor(Math.max(0, Math.min(lastCursor(), timelineCursorAtEpoch(props.timeline, clamped))))
  }

  function stopFling(): void {
    if (fling !== undefined) cancelAnimationFrame(fling)
    fling = undefined
  }

  function startFling(velocity: number): void {
    let speed = velocity
    let previous = performance.now()
    const step = (time: number) => {
      const elapsed = Math.min(40, time - previous)
      previous = time
      speed *= FLING_DECAY_PER_MS ** elapsed
      const epoch = cursorEpoch() - speed * elapsed / pxPerMs()
      scrollToEpoch(epoch)
      if (Math.abs(speed) < FLING_MIN_SPEED || epoch <= timelineStart() || epoch >= timelineEnd()) {
        fling = undefined
        resumeAfterPointerInteraction()
        return
      }
      fling = requestAnimationFrame(step)
    }
    fling = requestAnimationFrame(step)
  }

  function keyDown(event: KeyboardEvent): void {
    if (event.key === ' ') {
      // Spatie: afspelen/pauzeren; sinds U34 is er geen afspeelknop meer.
      event.preventDefault()
      props.onIntent?.()
      stopFling()
      setResumePlayback(false)
      if (!props.playing) props.onPlayPressed?.()
      props.onPauseToggle?.(!props.playing)
      props.onPlaying(!props.playing)
      return
    }
    setGliding(true)
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -6, PageUp: 6 }
    if (event.key === 'Home') { event.preventDefault(); props.onCursor(0); return }
    if (event.key === 'End') { event.preventDefault(); props.onCursor(lastCursor()); return }
    const step = steps[event.key]
    if (step) { event.preventDefault(); props.onCursor(Math.max(0, Math.min(lastCursor(), props.cursor + step))) }
  }

  function pauseForPointerInteraction(): void {
    window.clearTimeout(resumeTimer)
    if (resumePlayback() || !props.playing) return
    setResumePlayback(true)
    props.onPlaying(false)
  }

  /** Hervat na RESUME_IDLE_MS rust; elke nieuwe interactie schuift dat op. */
  function resumeAfterPointerInteraction(): void {
    window.clearTimeout(resumeTimer)
    if (!resumePlayback()) return
    resumeTimer = window.setTimeout(() => {
      if (!resumePlayback()) return
      setResumePlayback(false)
      props.onPlaying(true)
    }, RESUME_IDLE_MS)
  }

  return <section class="scrubber" aria-label={`Regenverwachting en tijd voor ${props.locationLabel}`}>
    <div
      ref={surfaceElement}
      class="scrub-surface"
      role="slider"
      tabIndex={0}
      aria-label="Tijd"
      aria-valuemin={0}
      aria-valuemax={lastCursor()}
      aria-valuenow={Math.round(props.cursor)}
      aria-disabled={props.loading}
      aria-busy={props.loadStage !== undefined && props.loadStage !== 'complete'}
      data-load-stage={props.loadStage}
      data-playing={props.playing ? '' : undefined}
      data-scrubber-view={view()}
      aria-valuetext={props.timeline.length ? valueText() : undefined}
      title="Sleep of scroll door de tijd · tik om naar dat moment te gaan"
      onKeyDown={keyDown}
      onPointerDown={(event) => {
        if (!props.timeline.length) return
        stopFling()
        setGliding(false)
        props.onIntent?.()
        drag = { x: event.clientX, epoch: cursorEpoch(), moved: false, lastX: event.clientX, lastTime: event.timeStamp, velocity: 0 }
        pauseForPointerInteraction()
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        if (!drag) return
        if (Math.abs(event.clientX - drag.x) > TAP_SLOP_PX) drag.moved = true
        if (!drag.moved) return
        const elapsed = event.timeStamp - drag.lastTime
        if (elapsed > 0) drag.velocity = 0.6 * drag.velocity + 0.4 * (event.clientX - drag.lastX) / elapsed
        drag.lastX = event.clientX
        drag.lastTime = event.timeStamp
        scrollToEpoch(drag.epoch - (event.clientX - drag.x) / pxPerMs())
      }}
      onPointerUp={(event) => {
        if (!drag) return
        const released = drag
        drag = undefined
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        if (!released.moved) {
          // Tik: naar het aangetikte moment glijden.
          const bounds = plotElement.getBoundingClientRect()
          setGliding(true)
          scrollToEpoch(timelineStart() + (event.clientX - bounds.left - offset()) / pxPerMs())
          resumeAfterPointerInteraction()
          return
        }
        const velocity = event.timeStamp - released.lastTime > 80 ? 0 : released.velocity
        if (Math.abs(velocity) >= FLING_MIN_SPEED) startFling(velocity)
        else resumeAfterPointerInteraction()
      }}
      onPointerCancel={() => {
        drag = undefined
        resumeAfterPointerInteraction()
      }}
    >
      <div class="chart-plot" ref={plotElement}>
        <div ref={trackElement} class="chart-track" classList={{ tween: tween() }} style={{ width: `${trackWidth()}px`, transform: `translateX(${shownOffset()}px)` }} aria-hidden="true">
          {/* Buiten de tijdlijn: gestreept "geen data" (PO 2026-09-25 live, U34), schuift mee met de baan. */}
          <div class="past-shade" style={{ width: `${nowX()}px` }} />
          <div class="hour-grid"><For each={xTicks()}>{(tick) => <i style={{ left: `${tick.x}px` }} />}</For></div>
          <div class="day-grid"><For each={dayMarkers()}>{(marker) => <div class="boundary" style={{ left: `${xAt(marker.epoch)}px` }} />}</For></div>
          <svg width={trackWidth()} height={plotHeight()} viewBox={`0 0 ${trackWidth()} ${plotHeight()}`}>
            <Show when={cloudBands().length}>
              <defs>
                <filter id={`${cloudId}-soft`} x="-5%" y="-30%" width="110%" height="160%"><feGaussianBlur stdDeviation="0.9" /></filter>
                <For each={cloudBands()}>{(band) => <linearGradient id={`${cloudId}-${band.key}`} class={`cloud-${band.key}`} gradientUnits="userSpaceOnUse" x1="0" x2={cloudWidth()} y1="0" y2="0">
                  <For each={band.stops}>{(stop) => <stop offset={stop.offset} stop-opacity={stop.opacity} />}</For>
                </linearGradient>}</For>
              </defs>
              <g class="cloud-section" data-testid="cloud-section" filter={`url(#${cloudId}-soft)`}>
                <g class="scrub-view" style={layerStyle(coverOpacity())}>
                  <For each={coverBands()}>{(band) => <g class="cloud-band" data-layer={band.key}>
                    <For each={band.paths}>{(path) => <path d={path} fill={`url(#${cloudId}-${band.key})`} />}</For>
                  </g>}</For>
                </g>
                <g class="scrub-view" style={{ opacity: baseOpacity() * (CLOUD_LAYERS_DEFAULT_OPACITY + (1 - CLOUD_LAYERS_DEFAULT_OPACITY) * cloudsMix()) }}>
                  <For each={layerBands()}>{(band) => <g class="cloud-band" data-layer={band.key}>
                    <For each={band.paths}>{(path) => <path d={path} fill={`url(#${cloudId}-${band.key})`} />}</For>
                  </g>}</For>
                </g>
              </g>
              <Show when={props.cloudCover}><line class="cloud-divider" style={{ opacity: coverOpacity() }} x1="0" x2={trackWidth()} y1={cloudHeight() + 1.5} y2={cloudHeight() + 1.5} /></Show>
            </Show>
            <Show when={temperatureMix() > 0 && temperatureChart()}>{(chart) => <g class="temperature-chart scrub-view" data-testid="temperature-chart" style={layerStyle(temperatureMix())}>
              <defs>
                <linearGradient id={`${temperatureId}-fill`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={chart().bottom} y2={chart().top}>
                  <For each={chart().stops}>{(stop) => <stop offset={stop.offset} stop-color={stop.color} />}</For>
                </linearGradient>
              </defs>
              <For each={chart().area}>{(path) => <path class="temperature-area" d={path} fill={`url(#${temperatureId}-fill)`} />}</For>
              <For each={chart().ribbon}>{(path) => <path class="temperature-ribbon" d={path} fill={`url(#${temperatureId}-fill)`} />}</For>
              {/* Lijnen gekleurd met het temperatuurpalet (zelfde verloop als de kaart). */}
              <For each={chart().air}>{(path) => <path class="temperature-air-line" d={path} stroke={`url(#${temperatureId}-fill)`} />}</For>
              <For each={chart().line}>{(path) => <path class="temperature-line" d={path} stroke={`url(#${temperatureId}-fill)`} />}</For>
            </g>}</Show>
            <Show when={windMix() > 0 && windChart()}>{(chart) => <g class="wind-chart scrub-view" data-testid="wind-chart" style={layerStyle(windMix())}>
              <defs>
                <linearGradient id={`${windId}-fill`} gradientUnits="userSpaceOnUse" x1="0" x2="0" y1={chart().bottom} y2={chart().top}>
                  <For each={chart().stops}>{(stop) => <stop offset={stop.offset} stop-color={`rgb(${stop.color})`} />}</For>
                </linearGradient>
              </defs>
              <For each={chart().gust}>{(path) => <path class="wind-gust-band" d={path} fill={`url(#${windId}-fill)`} />}</For>
              <For each={chart().area}>{(path) => <path class="wind-area" d={path} fill={`url(#${windId}-fill)`} />}</For>
              <For each={chart().line}>{(path) => <path class="wind-line" d={path} />}</For>

            </g>}</Show>
            {/* Index keeps each slot's rect alive, so only frames that arrive (pending → loaded) fade in. */}
            <g class="rain-bars scrub-view" style={layerStyle(baseOpacity())}><Index each={bars()}>{(bar) => <Show
              when={!bar().pending}
              fallback={<rect class="rain-bar pending" x={bar().x} y={plotHeight() - 2} width={bar().width} height="2" rx="1" />}
            ><rect class="rain-bar" classList={{ past: bar().past }} x={bar().x} y={bar().top} width={bar().width} height={plotHeight() - bar().top + 3} rx={Math.min(3, bar().width / 2)} fill={rainColor(bar().value)} /></Show>}</Index></g>
            <line class="rain-baseline" x1="0" x2={trackWidth()} y1={plotHeight() - 0.5} y2={plotHeight() - 0.5} />
          </svg>
          <div class="now-line" style={{ left: `${nowX()}px` }} />
          {/* "Nu" staat in de urenbalk (PO 2026-09-25 live); het uurlabel eronder wijkt. */}
          <div class="x-axis">
            {/* Middernacht krijgt geen uurlabel: het (sticky) daglabel markeert de dagwissel. */}
            <For each={xTicks().filter((tick) => Math.abs(tick.x - nowX()) > NOW_LABEL_CLEARANCE_PX && new Date(tick.epoch).getHours() !== 0)}>{(tick) => <span classList={{ midnight: new Date(tick.epoch).getHours() === 0 }} style={{ left: `${tick.x}px` }}>{hourLabel(tick.epoch)}</span>}</For>
            <span class="now-tick" style={{ left: `${nowX()}px` }}>Nu</span>
          </div>
        </div>
        <div class="day-labels" aria-hidden="true"><For each={daySegments()}>{(segment, index) =>
          <span ref={(element) => { dayLabelElements[index()] = element }} style={{ transform: `translateX(${stickyLeft(segment, shownOffset())}px)` }}>{segment.label}</span>
        }</For></div>
        {/* Waarden bij de cursor i.p.v. een y-as (PO 2026-09-25 live). */}
        <Show when={!props.loading && cloudsMix() > 0 && baseOpacity() > 0}>
          <div class="cursor-tags" style={{ opacity: Math.min(cloudsMix(), baseOpacity()) }} aria-hidden="true"><For each={cursorLayers()}>{(tag) =>
            <span style={{ left: `${cursorX()}px`, top: `${tag.y}px` }}>{tag.text}</span>
          }</For></div>
        </Show>
        <Show when={!props.loading && coverOpacity() > 0 && cursorCover()}>{(tag) =>
          <div class="cursor-tags" style={{ opacity: coverOpacity() }} aria-hidden="true"><span style={{ left: `${cursorX()}px`, top: `${tag().y}px` }}>{tag().text}</span></div>
        }</Show>
        <Show when={props.loading}>
          <div class="scrubber-placeholder" role="status">
            <div class="scrubber-placeholder-bars" aria-hidden="true" />
            <span>Regenverwachting laden…</span>
          </div>
        </Show>
        <Show when={!props.loading && !props.values.length}><span class="empty-graph">Kies een locatie voor de regengrafiek</span></Show>
        <div class="cursor-marker" style={{ left: `${cursorX()}px` }} />
        <Show when={!props.loading && (view() === 'rain' || view() === 'cover' || view() === 'clouds') && (cursorValue() ?? 0) >= 0.05}>
          <div class="cursor-readout" classList={{ tween: tween() }} style={{ left: `${cursorX()}px`, top: `${barTop(cursorValue())}px` }} aria-hidden="true">
            <span>{formatRate(cursorValue()!)}</span>
          </div>
        </Show>
        <Show when={!props.loading && view() === 'temperature'}>
          <For each={cursorTemperature() ?? []}>{(reading) =>
            <div class="cursor-readout" classList={{ tween: tween(), 'gust-readout': reading.air, below: reading.below }} style={{ left: `${cursorX()}px`, top: `${reading.y}px` }} aria-hidden="true">
              <span>{reading.text}</span>
            </div>
          }</For>
        </Show>
        <Show when={!props.loading && view() === 'wind'}>
          <For each={cursorWind() ?? []}>{(reading) =>
            <div class="cursor-readout" classList={{ tween: tween(), 'gust-readout': reading.gust, below: reading.below }} style={{ left: `${cursorX()}px`, top: `${reading.y}px` }} aria-hidden="true">
              <span>{reading.text}</span>
            </div>
          }</For>
        </Show>
      </div>
    </div>
  </section>
}

/**
 * Klemt de baanverschuiving tussen de muren met een zachte (C1) knie van `knee` px: buiten de knie
 * exact, erbinnen kwadratisch naar de muur toe. Past de tijdlijn in het plot, dan staat hij links.
 */
export function wallClamp(value: number, lower: number, upper: number, knee: number): number {
  if (lower >= upper) return upper
  const soft = (v: number, wall: number, side: 1 | -1) => {
    const d = side * (v - wall)
    if (d <= -knee) return v
    if (d >= knee) return wall
    return v - side * (d + knee) ** 2 / (4 * knee)
  }
  return soft(soft(value, upper, 1), lower, -1)
}

/** Aaneengesloten stukken (x, y) waar de reeks waarden heeft; gaten breken de lijn. */
function curveRuns(xs: number[], values: Array<number | null>, yOf: (value: number) => number): Array<Array<[number, number]>> {
  const runs: Array<Array<[number, number]>> = []
  let run: Array<[number, number]> = []
  xs.forEach((x, index) => {
    const value = values[index]
    if (value == null) { if (run.length) runs.push(run); run = []; return }
    run.push([x, yOf(value)])
  })
  if (run.length) runs.push(run)
  return runs
}

/** Kleur van het temperatuurpalet op `value` (zoals de kaartvulling); zonder palet het accent. */
function paletteColor(value: number, stops: PaletteStops | undefined): string {
  if (!stops?.length) return 'var(--accent)'
  const rgb = (color: readonly number[]) => `rgb(${color.map((channel) => Math.round(channel * 255)).join(' ')})`
  if (value <= stops[0]![0]) return rgb(stops[0]![1])
  for (let index = 1; index < stops.length; index++) {
    const [t1, c1] = stops[index]!
    if (value <= t1) {
      const [t0, c0] = stops[index - 1]!
      const mix = t1 === t0 ? 0 : (value - t0) / (t1 - t0)
      return rgb(c0.map((channel, component) => channel + (c1[component]! - channel) * mix))
    }
  }
  return rgb(stops.at(-1)![1])
}

/** Gesloten band tussen een onder- en bovenreeks (vlagen op de gemiddelde wind). */
function bandRuns(xs: number[], lower: Array<number | null>, upper: Array<number | null>, yOf: (value: number) => number): string[] {
  const both = xs.map((_, index) => lower[index] != null && upper[index] != null ? upper[index] : null)
  const tops = curveRuns(xs, both, yOf)
  const bottoms = curveRuns(xs, xs.map((_, index) => lower[index] != null && upper[index] != null ? lower[index] : null), yOf)
  return tops.map((top, index) => {
    const bottom = [...bottoms[index]!].reverse()
    return `${smoothPath(top)}L${smoothPath(bottom).slice(1)}Z`
  })
}

/** Catmull-Rom door de punten als kubische Bézier (vloeiende windlijn). */
function smoothPath(points: Array<[number, number]>): string {
  if (points.length === 1) return `M${points[0]![0]} ${points[0]![1]}h0.01`
  let path = `M${points[0]![0].toFixed(1)} ${points[0]![1].toFixed(1)}`
  for (let index = 0; index < points.length - 1; index++) {
    const p0 = points[Math.max(0, index - 1)]!, p1 = points[index]!, p2 = points[index + 1]!, p3 = points[Math.min(points.length - 1, index + 2)]!
    const c1 = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2 = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    path += `C${c1[0]!.toFixed(1)} ${c1[1]!.toFixed(1)} ${c2[0]!.toFixed(1)} ${c2[1]!.toFixed(1)} ${p2[0].toFixed(1)} ${p2[1].toFixed(1)}`
  }
  return path
}

interface DaySegment { label: string; a: number; b: number }

function stickyLeft(segment: DaySegment, shift: number): number {
  return Math.min(Math.max(segment.a + shift, DAY_LABEL_INSET_PX), segment.b + shift)
}

/** Keyframes voor een lineaire verschuiving van `from` naar `to`: de knikken van stickyLeft als tussenstops. */
export function stickyKeyframes(segment: DaySegment, from: number, to: number): Keyframe[] {
  const span = from - to
  const shifts = [from, DAY_LABEL_INSET_PX - segment.a, DAY_LABEL_INSET_PX - segment.b, to]
    .filter((shift) => shift <= from && shift >= to)
    .sort((left, right) => right - left)
  return [...new Set(shifts)].map((shift) => ({ offset: span > 0 ? (from - shift) / span : 0, transform: `translateX(${stickyLeft(segment, shift)}px)` }))
}

function formatRate(value: number): string {
  return `${value < 0.1 ? '<0,1' : value.toLocaleString('nl-NL', { maximumFractionDigits: value < 10 ? 1 : 0 })} mm/u`
}

function hourLabel(epoch: number): string {
  const date = new Date(epoch)
  return date.getHours() === 0 ? date.toLocaleDateString('nl-NL', { weekday: 'short' }) : `${date.getHours()}u`
}

function dayLabel(epoch: number, todayEpoch: number): string {
  const date = new Date(epoch)
  const today = new Date(todayEpoch)
  // Vandaag krijgt geen label: de nu-lijn zegt het al.
  if (date.toDateString() === today.toDateString()) return ''
  today.setDate(today.getDate() + 1)
  if (date.toDateString() === today.toDateString()) return 'Morgen'
  today.setDate(today.getDate() - 2)
  if (date.toDateString() === today.toDateString()) return 'Gisteren'
  return date.toLocaleDateString('nl-NL', { weekday: 'long' })
}
