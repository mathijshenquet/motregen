import { createMemo, createSignal, For, Index, onCleanup, onMount, Show } from 'solid-js'
import type { TimelineFrame } from '../core/contract'
import { classifyRain, RAIN_BANDS, rainChartMaximum, rainChartPosition, rainColor } from '../core/rain-chart'
import { timelineCursorAtEpoch, timelineEpochAtCursor, timelineZones } from '../core/time-model'
import { INLINE_ICON, Pause, Play } from './icons'

interface Props {
  timeline: TimelineFrame[]
  values: Array<number | null>
  loaded?: boolean[]
  cursor: number
  now: number
  playing: boolean
  horizonHours: number | null
  loading: boolean
  loadStage?: 'initial' | 'direct' | 'window' | 'complete'
  locationLabel: string
  onCursor: (cursor: number) => void
  onHorizonHours: (hours: number | null) => void
  onIntent?: () => void
  onPlaying: (playing: boolean) => void
  /** Alleen een expliciete afspeelkeuze, niet het hervatten na hover-scrubben. */
  onPlayPressed?: () => void
}

const hourLabelSteps = [1, 2, 3, 6, 12, 24]
// Wide enough for "23u" at the axis font size plus breathing room.
const minimumHourLabelSpacingPx = 34
const fineScrubOffsetPx = 48
const fineScrubFactor = 0.25

export function hourLabelStep(spanHours: number, plotWidthPx: number): number {
  const fit = Math.max(1, plotWidthPx / minimumHourLabelSpacingPx)
  return hourLabelSteps.find((step) => spanHours / step <= fit) ?? hourLabelSteps.at(-1)!
}

export default function HistogramScrubber(props: Props) {
  let plotElement!: HTMLDivElement
  let pressedX: number | undefined
  let pressedY = 0
  // Touch drags are relative to an anchor so the fine (damped) mode can switch in without a jump.
  let touchAnchor: { x: number; epoch: number; fine: boolean } | undefined
  let dragged = false
  let pointerInside = false
  const [hoverScrubbing, setHoverScrubbing] = createSignal(true)
  const [fineScrub, setFineScrub] = createSignal(false)
  const [resumePlayback, setResumePlayback] = createSignal(false)
  const [plotWidth, setPlotWidth] = createSignal(320)
  const [plotHeight, setPlotHeight] = createSignal(160)
  onMount(() => {
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
  const timelineEnd = createMemo(() => {
    const last = props.timeline.at(-1)?.epoch ?? timelineStart()
    return props.horizonHours === null ? last : Math.min(last, props.now + props.horizonHours * 3_600_000)
  })
  const timelineSpan = createMemo(() => Math.max(1, timelineEnd() - timelineStart()))
  const maximum = createMemo(() => rainChartMaximum(props.values))
  const y = (value: number) => plotHeight() * (1 - rainChartPosition(value, maximum()))
  const barTop = (value: number | null | undefined) => value == null || value <= 0 ? plotHeight() : Math.min(plotHeight() - 2, y(value))
  const bars = createMemo(() => {
    const width = plotWidth()
    const pitch = width / Math.max(1, props.timeline.length)
    const gap = pitch > 6 ? 1.5 : pitch > 3.5 ? 1 : 0.5
    if (props.timeline.length === 1) return [{ x: 0, width, top: barTop(props.values[0]), value: props.values[0] ?? 0, pending: props.loaded ? !props.loaded[0] : false, past: false }]
    return props.timeline.flatMap((frame, index) => {
      const value = props.values[index]
      const leftEpoch = index === 0 ? timelineStart() : (props.timeline[index - 1]!.epoch + frame.epoch) / 2
      const rightEpoch = index === props.timeline.length - 1 ? timelineEnd() : (frame.epoch + props.timeline[index + 1]!.epoch) / 2
      if (leftEpoch >= timelineEnd() || rightEpoch <= timelineStart()) return []
      const x = positionAtEpoch(Math.max(timelineStart(), leftEpoch)) / 100 * width
      const right = positionAtEpoch(Math.min(timelineEnd(), rightEpoch)) / 100 * width
      const pending = props.loaded ? !props.loaded[index] : false
      return [{ x: x + gap / 2, width: Math.max(1.2, right - x - gap), top: barTop(value), value: value ?? 0, pending, past: frame.epoch < props.now }]
    })
  })
  const guides = createMemo(() => RAIN_BANDS.slice(1).map((band) => y(band.minimum)))
  const hourStep = createMemo(() => hourLabelStep(timelineSpan() / 3_600_000, plotWidth()))
  const xTicks = createMemo(() => {
    if (!props.timeline.length) return []
    const hour = 3_600_000
    const firstHour = Math.ceil(timelineStart() / hour) * hour
    const ticks = []
    const step = hourStep()
    for (let epoch = firstHour; epoch <= timelineEnd(); epoch += hour) {
      const labelled = new Date(epoch).getHours() % step === 0
      ticks.push({ epoch, left: positionAtEpoch(epoch), labelled })
    }
    return ticks
  })
  const nowPosition = createMemo(() => {
    return positionAtEpoch(Math.max(timelineStart(), Math.min(timelineEnd(), props.now)))
  })
  const cursorEpoch = createMemo(() => timelineEpochAtCursor(props.timeline, props.cursor))
  const cursorPosition = createMemo(() => Math.max(0, Math.min(100, positionAtEpoch(cursorEpoch()))))
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
  // Playback already advances the cursor every animation frame; only discrete
  // keyboard steps get a short glide, pointer scrubbing stays immediate.
  const [keyStepping, setKeyStepping] = createSignal(false)
  const tween = () => keyStepping() && !props.playing
  const dayMarkers = createMemo(() => {
    if (!props.timeline.length) return []
    const today = new Date(props.now)
    today.setHours(0, 0, 0, 0)
    const day = new Date(timelineStart())
    day.setHours(0, 0, 0, 0)
    const markers: Array<{ epoch: number; label: string; boundary: boolean }> = []
    while (day.getTime() <= timelineEnd()) {
      const dayStart = day.getTime()
      markers.push({
        epoch: Math.max(timelineStart(), dayStart),
        label: dayLabel(dayStart, today.getTime()),
        boundary: dayStart > timelineStart(),
      })
      day.setDate(day.getDate() + 1)
    }
    return markers
  })
  function epochAtClientX(clientX: number): number {
    const bounds = plotElement.getBoundingClientRect()
    const fraction = bounds.width ? Math.max(0, Math.min(1, (clientX - bounds.left) / bounds.width)) : 0
    return timelineStart() + fraction * timelineSpan()
  }

  function pointerPosition(event: PointerEvent): number {
    if (event.pointerType === 'mouse' || !touchAnchor) return timelineCursorAtEpoch(props.timeline, epochAtClientX(event.clientX))
    // Moving the finger well above or below the plot slows the scrub to a quarter.
    const fine = Math.abs(event.clientY - pressedY) > fineScrubOffsetPx
    if (fine !== touchAnchor.fine) touchAnchor = { x: event.clientX, epoch: timelineEpochAtCursor(props.timeline, props.cursor), fine }
    const width = plotElement.getBoundingClientRect().width || 1
    const epoch = touchAnchor.epoch + (event.clientX - touchAnchor.x) / width * timelineSpan() * (fine ? fineScrubFactor : 1)
    setFineScrub(fine)
    return timelineCursorAtEpoch(props.timeline, Math.max(timelineStart(), Math.min(timelineEnd(), epoch)))
  }

  function positionAtEpoch(epoch: number): number {
    return (epoch - timelineStart()) / timelineSpan() * 100
  }

  function keyDown(event: KeyboardEvent): void {
    setKeyStepping(true)
    const last = timelineCursorAtEpoch(props.timeline, timelineEnd())
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -6, PageUp: 6 }
    if (event.key === 'Home') { event.preventDefault(); props.onCursor(0); return }
    if (event.key === 'End') { event.preventDefault(); props.onCursor(last); return }
    const step = steps[event.key]
    if (step) { event.preventDefault(); props.onCursor(Math.max(0, Math.min(last, props.cursor + step))) }
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

  function togglePlaybackFromCursor(event: MouseEvent): void {
    event.stopPropagation()
    props.onIntent?.()
    if (resumePlayback()) {
      setResumePlayback(false)
      props.onPlaying(false)
    } else if (pointerInside && hoverScrubbing() && !props.playing) {
      setResumePlayback(true)
      props.onPlayPressed?.()
    } else {
      if (!props.playing) props.onPlayPressed?.()
      props.onPlaying(!props.playing)
    }
  }

  return <section class="scrubber" aria-label={`Regenverwachting en tijd voor ${props.locationLabel}`}>
    <div class="scrubber-toolbar">
      <div class="segmented time-horizon" role="group" aria-label="Tijdsbereik">
        <For each={[3, 8, 24] as const}>{(hours) => <button type="button" classList={{ active: props.horizonHours === hours }} aria-pressed={props.horizonHours === hours} onClick={() => { props.onIntent?.(); props.onHorizonHours(hours) }}>+{hours}u</button>}</For>
        <button type="button" classList={{ active: props.horizonHours === null }} aria-pressed={props.horizonHours === null} onClick={() => { props.onIntent?.(); props.onHorizonHours(null) }}>Alles</button>
      </div>
    </div>
    <div
      class="scrub-surface"
      classList={{ 'hover-scrubbing': hoverScrubbing() }}
      role="slider"
      tabIndex={0}
      aria-label="Tijd"
      aria-valuemin={0}
      aria-valuemax={timelineCursorAtEpoch(props.timeline, timelineEnd())}
      aria-valuenow={Math.round(props.cursor)}
      aria-disabled={props.loading}
      aria-busy={props.loadStage !== undefined && props.loadStage !== 'complete'}
      data-load-stage={props.loadStage}
      aria-valuetext={props.timeline.length ? valueText() : undefined}
      title={hoverScrubbing() ? 'Hover-scrubben · klik om hier te blijven' : 'Vast · klik voor hover of sleep om te scrubben'}
      onKeyDown={keyDown}
      onMouseEnter={() => {
        pointerInside = true
        setKeyStepping(false)
        if (hoverScrubbing()) { props.onIntent?.(); pauseForPointerInteraction() }
      }}
      onMouseLeave={() => {
        pointerInside = false
        if (pressedX === undefined) {
          if (hoverScrubbing()) resumeAfterPointerInteraction()
        }
      }}
      onPointerDown={(event) => {
        setKeyStepping(false)
        props.onIntent?.()
        pressedX = event.clientX
        pressedY = event.clientY
        touchAnchor = event.pointerType === 'mouse' ? undefined : { x: event.clientX, epoch: epochAtClientX(event.clientX), fine: false }
        dragged = false
        pauseForPointerInteraction()
        event.currentTarget.setPointerCapture(event.pointerId)
      }}
      onPointerMove={(event) => {
        const cursor = pointerPosition(event)
        const captured = event.currentTarget.hasPointerCapture(event.pointerId)
        if (captured && pressedX !== undefined && Math.abs(event.clientX - pressedX) > 3) dragged = true
        if ((hoverScrubbing() && event.pointerType === 'mouse' && !captured) || (captured && dragged)) props.onCursor(cursor)
      }}
      onPointerUp={(event) => {
        const cursor = pointerPosition(event)
        props.onCursor(cursor)
        const nextHoverScrubbing = dragged
          ? false
          : event.pointerType === 'mouse' ? !hoverScrubbing() : hoverScrubbing()
        setHoverScrubbing(nextHoverScrubbing)
        if (!(nextHoverScrubbing && pointerInside && event.pointerType === 'mouse')) resumeAfterPointerInteraction()
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        pressedX = undefined
        touchAnchor = undefined
        setFineScrub(false)
        dragged = false
      }}
      onPointerCancel={(event) => {
        pressedX = undefined
        touchAnchor = undefined
        setFineScrub(false)
        dragged = false
        if (!(hoverScrubbing() && pointerInside && event.pointerType === 'mouse')) resumeAfterPointerInteraction()
      }}
    >
      <div class="chart-plot" ref={plotElement}>
        <div class="past-shade" style={{ width: `${nowPosition()}%` }} aria-hidden="true" />
        <div class="hour-grid" aria-hidden="true"><For each={xTicks().filter((tick) => tick.labelled)}>{(tick) => <i style={{ left: `${tick.left}%` }} />}</For></div>
        <div class="day-grid" aria-hidden="true"><For each={dayMarkers()}>{(marker, index) => <div classList={{ boundary: marker.boundary }} style={{ left: `${positionAtEpoch(marker.epoch)}%` }}><Show when={marker.label && (positionAtEpoch(dayMarkers()[index() + 1]?.epoch ?? timelineEnd()) - positionAtEpoch(marker.epoch)) / 100 * plotWidth() > marker.label.length * 7 + 16}><span>{marker.label}</span></Show></div>}</For></div>
        <svg viewBox={`0 0 ${plotWidth()} ${plotHeight()}`} aria-hidden="true">
          <For each={guides()}>{(top) => <line class="rain-guide" x1="0" x2={plotWidth()} y1={top} y2={top} />}</For>
          {/* Index keeps each slot's rect alive, so only frames that arrive (pending → loaded) fade in. */}
          <g class="rain-bars"><Index each={bars()}>{(bar) => <Show
            when={!bar().pending}
            fallback={<rect class="rain-bar pending" x={bar().x} y={plotHeight() - 2} width={bar().width} height="2" rx="1" />}
          ><rect class="rain-bar" classList={{ past: bar().past }} x={bar().x} y={bar().top} width={bar().width} height={plotHeight() - bar().top + 3} rx={Math.min(3, bar().width / 2)} fill={rainColor(bar().value)} /></Show>}</Index></g>
          <line class="rain-baseline" x1="0" x2={plotWidth()} y1={plotHeight() - 0.5} y2={plotHeight() - 0.5} />
        </svg>
        <Show when={props.loading}>
          <div class="scrubber-placeholder" role="status">
            <div class="scrubber-placeholder-bars" aria-hidden="true" />
            <span>Regenverwachting laden…</span>
          </div>
        </Show>
        <Show when={!props.loading && !props.values.length}><span class="empty-graph">Kies een locatie voor de regengrafiek</span></Show>
        <div class="now-line" style={{ left: `${nowPosition()}%` }}><span>Nu</span></div>
        <div class="cursor-marker" classList={{ tween: tween() }} style={{ left: `${cursorPosition()}%` }} />
        <Show when={!props.loading && (cursorValue() ?? 0) >= 0.05}>
          <div class="cursor-readout" classList={{ tween: tween(), flip: cursorPosition() > 70 }} style={{ left: `${cursorPosition()}%`, top: `${barTop(cursorValue())}px` }} aria-hidden="true">
            <span>{formatRate(cursorValue()!)}</span>
          </div>
        </Show>
        <button
          type="button"
          class="cursor-pill"
          classList={{ tween: tween(), fine: fineScrub() }}
          style={{ left: `clamp(29px, ${cursorPosition()}%, calc(100% - 29px))` }}
          aria-label={(resumePlayback() || props.playing) ? 'Pauzeren' : 'Afspelen'}
          onPointerDown={(event) => event.stopPropagation()}
          onPointerUp={(event) => event.stopPropagation()}
          onClick={togglePlaybackFromCursor}
        >
          <span class="cursor-time">{props.timeline.length ? new Date(cursorEpoch()).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
          <span class="cursor-playback" aria-hidden="true">{(resumePlayback() || props.playing) ? <Pause {...INLINE_ICON} fill="currentColor" /> : <Play {...INLINE_ICON} fill="currentColor" />}</span>
        </button>
        <div class="x-axis" aria-hidden="true"><For each={xTicks().filter((tick) => tick.labelled && tick.left > 2 && tick.left < 98 && Math.abs(tick.left - nowPosition()) / 100 * plotWidth() > 30)}>{(tick) => <span classList={{ midnight: new Date(tick.epoch).getHours() === 0 }} style={{ left: `${tick.left}%` }}>{hourLabel(tick.epoch)}</span>}</For></div>
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
