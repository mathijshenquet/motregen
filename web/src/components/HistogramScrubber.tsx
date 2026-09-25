import { createMemo, createSignal, createUniqueId, For, Index, onCleanup, onMount, Show } from 'solid-js'
import { CLOUD_LAYERS, cloudBand, type CloudSeries } from '../core/cloud-section'
import type { TimelineFrame } from '../core/contract'
import { classifyRain, RAIN_BANDS, rainChartMaximum, rainChartPosition, rainColor } from '../core/rain-chart'
import { timelineCursorAtEpoch, timelineEpochAtCursor, timelineZones } from '../core/time-model'

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
  /** De drie wolkenlagen (U37) — sinds U34 alleen in de modus Wolken, en dan zonder regen. */
  clouds?: CloudSeries
  /** Totale bewolking als één band boven het regenhistogram, in de weermodus (PO 2026-09-25 live, U34). */
  cloudCover?: { timeline: TimelineFrame[]; values: Array<number | null> }
}

const CLOUD_LAYER_LABELS = { high: 'hoog', mid: 'midden', low: 'laag' } as const
// Deel van de plothoogte voor de bewolkingsband boven de regen.
const CLOUD_COVER_SHARE = 0.3

const HOUR = 3_600_000
// PO 2026-09-25 live (U34), naar WarnWetter: de cursor staat vast op CURSOR_FRACTION van de breedte en
// de tijdlijn schuift eronder; zoveel uur past in de breedte. Vervangt de tijdsbereikknoppen.
const VIEW_HOURS = 8
const CURSOR_FRACTION = 1 / 3
const hourLabelSteps = [1, 2, 3, 6, 12, 24]
// Wide enough for "23u" at the axis font size plus breathing room.
const minimumHourLabelSpacingPx = 34
const TAP_SLOP_PX = 4
const WHEEL_RESUME_MS = 800
// Uitloop na een veeg: snelheid (px/ms) halveert per ~110 ms.
const FLING_DECAY_PER_MS = 0.9937
const FLING_MIN_SPEED = 0.02

export function hourLabelStep(spanHours: number, plotWidthPx: number): number {
  const fit = Math.max(1, plotWidthPx / minimumHourLabelSpacingPx)
  return hourLabelSteps.find((step) => spanHours / step <= fit) ?? hourLabelSteps.at(-1)!
}

export default function HistogramScrubber(props: Props) {
  let plotElement!: HTMLDivElement
  let surfaceElement!: HTMLDivElement
  let drag: { x: number; epoch: number; moved: boolean; lastX: number; lastTime: number; velocity: number } | undefined
  let fling: number | undefined
  const [resumePlayback, setResumePlayback] = createSignal(false)
  const [plotWidth, setPlotWidth] = createSignal(320)
  const [plotHeight, setPlotHeight] = createSignal(160)
  onMount(() => {
    // Scrollen pauzeert het afspelen zoals slepen en hervat WHEEL_RESUME_MS na de laatste beweging;
    // anders liep het afspelen tijdens het scrollen door en sprong het bij de horizon terug (U34).
    let wheelResume: number | undefined
    const wheel = (event: WheelEvent) => {
      const delta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY
      if (!delta || !props.timeline.length) return
      event.preventDefault()
      stopFling()
      props.onIntent?.()
      pauseForPointerInteraction()
      window.clearTimeout(wheelResume)
      wheelResume = window.setTimeout(resumeAfterPointerInteraction, WHEEL_RESUME_MS)
      scrollToEpoch(cursorEpoch() + delta * (event.deltaMode === 1 ? 16 : 1) / pxPerMs())
    }
    surfaceElement.addEventListener('wheel', wheel, { passive: false })
    onCleanup(() => { surfaceElement.removeEventListener('wheel', wheel); window.clearTimeout(wheelResume) })
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
  const view = () => props.clouds ? 'clouds' : props.cloudCover ? 'cover' : 'rain'
  const cloudHeight = createMemo(() => props.clouds ? plotHeight() : props.cloudCover ? plotHeight() * CLOUD_COVER_SHARE : 0)
  // Regen valt onder de wolken: de regenschaal begint onder de doorsnede.
  const rainTop = createMemo(() => cloudHeight() && cloudHeight() + 4)
  const y = (value: number) => rainTop() + (plotHeight() - rainTop()) * (1 - rainChartPosition(value, maximum()))
  const barTop = (value: number | null | undefined) => value == null || value <= 0 ? plotHeight() : Math.min(plotHeight() - 2, y(value))
  const bars = createMemo(() => {
    const frames = props.timeline
    if (!frames.length || props.clouds) return []
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
  const guides = createMemo(() => props.clouds || props.cloudCover ? [] : RAIN_BANDS.slice(1).map((band) => y(band.minimum)))
  const cloudId = createUniqueId()
  // Eén keer over de hele tijdlijn in baancoördinaten (U34): de baan schuift met een transform, dus de
  // wolken schuiven gratis mee en worden niet per afspeelframe opnieuw getekend.
  const cloudWidth = createMemo(() => Math.max(1, xAt(timelineEnd())))
  const cloudBands = createMemo(() => {
    const geometry = (top: number, height: number) => ({ width: cloudWidth(), top, height, start: timelineStart(), end: timelineEnd() })
    const cover = props.cloudCover
    if (cover) {
      // Eén band in de stijl van de middelste laag: vorm en dekking volgen de totale bewolking.
      return [{ key: 'total', label: '', top: 0, height: cloudHeight(), ...cloudBand(cover.timeline, cover.values, 'mid', geometry(0, cloudHeight())) }]
    }
    const clouds = props.clouds
    if (!clouds) return []
    const bandHeight = cloudHeight() / CLOUD_LAYERS.length
    return CLOUD_LAYERS.map((layer, index) => ({
      key: layer,
      label: CLOUD_LAYER_LABELS[layer],
      top: index * bandHeight,
      height: bandHeight,
      ...cloudBand(clouds.timeline[layer], clouds.values[layer], layer, geometry(index * bandHeight, bandHeight)),
    }))
  })
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
  const offset = () => plotWidth() * CURSOR_FRACTION - xAt(cursorEpoch())
  const cursorValue = createMemo(() => props.values[Math.round(props.cursor)])
  const cursorZone = createMemo(() => {
    const frame = props.timeline[Math.round(props.cursor)] ?? props.timeline[0]
    return frame ? timelineZones([frame])[0] : undefined
  })
  const valueText = () => {
    const epoch = cursorEpoch()
    const time = new Date(epoch).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
    const value = cursorValue()
    const rain = value == null ? 'geen data' : value < 0.05 ? 'droog' : `${formatRate(value)}, ${RAIN_BANDS.find((band) => band.key === classifyRain(value))!.label.toLowerCase()}`
    const source = cursorZone()?.label.toLowerCase()
    return `${(dayLabel(epoch, props.now) || 'vandaag').toLowerCase()} ${time}, ${rain}, ${source}`
  }
  // Alleen toetsstappen en tikken krijgen een korte glijbeweging; slepen en afspelen volgen direct.
  const [gliding, setGliding] = createSignal(false)
  const tween = () => gliding() && !props.playing
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
    if (resumePlayback() || !props.playing) return
    setResumePlayback(true)
    props.onPlaying(false)
  }

  function resumeAfterPointerInteraction(): void {
    if (!resumePlayback()) return
    setResumePlayback(false)
    props.onPlaying(true)
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
          scrollToEpoch(cursorEpoch() + (event.clientX - bounds.left - bounds.width * CURSOR_FRACTION) / pxPerMs())
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
        <div class="chart-track" classList={{ tween: tween() }} style={{ width: `${trackWidth()}px`, transform: `translateX(${offset()}px)` }} aria-hidden="true">
          <div class="past-shade" style={{ width: `${nowX()}px` }} />
          <div class="hour-grid"><For each={xTicks()}>{(tick) => <i style={{ left: `${tick.x}px` }} />}</For></div>
          <div class="day-grid"><For each={dayMarkers()}>{(marker) => <div class="boundary" style={{ left: `${xAt(marker.epoch)}px` }}><span>{marker.label}</span></div>}</For></div>
          <svg width={trackWidth()} height={plotHeight()} viewBox={`0 0 ${trackWidth()} ${plotHeight()}`}>
            <For each={guides()}>{(top) => <line class="rain-guide" x1="0" x2={trackWidth()} y1={top} y2={top} />}</For>
            <Show when={cloudBands().length}>
              <defs>
                <filter id={`${cloudId}-soft`} x="-5%" y="-30%" width="110%" height="160%"><feGaussianBlur stdDeviation="0.9" /></filter>
                <For each={cloudBands()}>{(band) => <linearGradient id={`${cloudId}-${band.key}`} class={`cloud-${band.key}`} gradientUnits="userSpaceOnUse" x1="0" x2={cloudWidth()} y1="0" y2="0">
                  <For each={band.stops}>{(stop) => <stop offset={stop.offset} stop-opacity={stop.opacity} />}</For>
                </linearGradient>}</For>
              </defs>
              <g class="cloud-section" data-testid="cloud-section" filter={`url(#${cloudId}-soft)`}>
                <For each={cloudBands()}>{(band) => <g class="cloud-band" data-layer={band.key}>
                  <For each={band.paths}>{(path) => <path d={path} fill={`url(#${cloudId}-${band.key})`} />}</For>
                </g>}</For>
              </g>
              <Show when={props.cloudCover}><line class="cloud-divider" x1="0" x2={trackWidth()} y1={cloudHeight() + 1.5} y2={cloudHeight() + 1.5} /></Show>
            </Show>
            {/* Index keeps each slot's rect alive, so only frames that arrive (pending → loaded) fade in. */}
            <g class="rain-bars"><Index each={bars()}>{(bar) => <Show
              when={!bar().pending}
              fallback={<rect class="rain-bar pending" x={bar().x} y={plotHeight() - 2} width={bar().width} height="2" rx="1" />}
            ><rect class="rain-bar" classList={{ past: bar().past }} x={bar().x} y={bar().top} width={bar().width} height={plotHeight() - bar().top + 3} rx={Math.min(3, bar().width / 2)} fill={rainColor(bar().value)} /></Show>}</Index></g>
            <line class="rain-baseline" x1="0" x2={trackWidth()} y1={plotHeight() - 0.5} y2={plotHeight() - 0.5} />
          </svg>
          <div class="now-line" style={{ left: `${nowX()}px` }}><span>Nu</span></div>
          <div class="x-axis"><For each={xTicks()}>{(tick) => <span classList={{ midnight: new Date(tick.epoch).getHours() === 0 }} style={{ left: `${tick.x}px` }}>{hourLabel(tick.epoch)}</span>}</For></div>
        </div>
        <Show when={props.clouds}>
          <div class="cloud-labels" aria-hidden="true"><For each={cloudBands()}>{(band) => <span style={{ top: `${band.top + band.height / 2}px` }}>{band.label}</span>}</For></div>
        </Show>
        <Show when={props.loading}>
          <div class="scrubber-placeholder" role="status">
            <div class="scrubber-placeholder-bars" aria-hidden="true" />
            <span>Regenverwachting laden…</span>
          </div>
        </Show>
        <Show when={!props.loading && !props.values.length}><span class="empty-graph">Kies een locatie voor de regengrafiek</span></Show>
        <div class="cursor-marker" />
        <Show when={!props.loading && (cursorValue() ?? 0) >= 0.05}>
          <div class="cursor-readout" classList={{ tween: tween() }} style={{ top: `${barTop(cursorValue())}px` }} aria-hidden="true">
            <span>{formatRate(cursorValue()!)}</span>
          </div>
        </Show>
      </div>
    </div>
  </section>
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
