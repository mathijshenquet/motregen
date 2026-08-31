import { createMemo, createSignal, For, Show } from 'solid-js'
import type { TimelineFrame } from '../core/contract'
import { RAIN_BANDS, rainChartMaximum, rainChartPosition } from '../core/rain-chart'
import { timelineCursorAtEpoch, timelineEpochAtCursor, timelineZones } from '../core/time-model'

interface Props {
  timeline: TimelineFrame[]
  values: Array<number | null>
  cursor: number
  now: number
  playing: boolean
  horizonHours: number | null
  loading: boolean
  locationLabel: string
  onCursor: (cursor: number) => void
  onHorizonHours: (hours: number | null) => void
  onPlaying: (playing: boolean) => void
}

const width = 1000
const plotHeight = 132

export default function HistogramScrubber(props: Props) {
  let plotElement!: HTMLDivElement
  let pressedX: number | undefined
  let dragged = false
  let pointerInside = false
  const [hovered, setHovered] = createSignal<number | null>(null)
  const [hoverScrubbing, setHoverScrubbing] = createSignal(true)
  const [resumePlayback, setResumePlayback] = createSignal(false)
  const timelineStart = createMemo(() => props.timeline[0]?.epoch ?? 0)
  const timelineEnd = createMemo(() => {
    const last = props.timeline.at(-1)?.epoch ?? timelineStart()
    return props.horizonHours === null ? last : Math.min(last, props.now + props.horizonHours * 3_600_000)
  })
  const timelineSpan = createMemo(() => Math.max(1, timelineEnd() - timelineStart()))
  const maximum = createMemo(() => rainChartMaximum(props.values))
  const y = (value: number) => plotHeight * (1 - rainChartPosition(value, maximum()))
  const bars = createMemo(() => {
    if (props.timeline.length === 1) return [{ x: 0, width: width - 1, y: props.values[0] == null ? plotHeight : y(props.values[0]!) }]
    return props.timeline.flatMap((frame, index) => {
      const value = props.values[index]
      const leftEpoch = index === 0 ? timelineStart() : (props.timeline[index - 1]!.epoch + frame.epoch) / 2
      const rightEpoch = index === props.timeline.length - 1 ? timelineEnd() : (frame.epoch + props.timeline[index + 1]!.epoch) / 2
      if (leftEpoch >= timelineEnd() || rightEpoch <= timelineStart()) return []
      const x = positionAtEpoch(Math.max(timelineStart(), leftEpoch)) / 100 * width
      const right = positionAtEpoch(Math.min(timelineEnd(), rightEpoch)) / 100 * width
      return [{ x, width: Math.max(1.4, right - x - 1), y: value == null ? plotHeight : y(value) }]
    })
  })
  const bands = createMemo(() => RAIN_BANDS.map((band) => {
    const upper = Number.isFinite(band.maximum) ? band.maximum : maximum()
    const top = y(upper)
    const bottom = y(band.minimum)
    return { ...band, top: top / plotHeight * 100, height: Math.max(0, bottom - top) / plotHeight * 100 }
  }))
  const yTicks = createMemo(() => [...new Set([0, 2.5, 7.5, maximum()])].map((value) => ({ value, top: y(value) / plotHeight * 100 })))
  const xTicks = createMemo(() => {
    if (!props.timeline.length) return []
    const hour = 3_600_000
    const firstHour = Math.ceil(timelineStart() / hour) * hour
    const ticks = []
    for (let epoch = firstHour; epoch <= timelineEnd(); epoch += hour) ticks.push({ epoch, left: positionAtEpoch(epoch) })
    return ticks
  })
  const nowPosition = createMemo(() => {
    return positionAtEpoch(Math.max(timelineStart(), Math.min(timelineEnd(), props.now)))
  })
  const cursorEpoch = createMemo(() => timelineEpochAtCursor(props.timeline, props.cursor))
  const cursorPosition = createMemo(() => Math.max(0, Math.min(100, positionAtEpoch(cursorEpoch()))))
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
  const hoverData = createMemo(() => {
    const index = hovered()
    return index == null ? undefined : { index, frame: props.timeline[index], value: props.values[index] }
  })

  function pointerPosition(event: PointerEvent): { cursor: number; index: number } {
    const bounds = plotElement.getBoundingClientRect()
    const fraction = bounds.width ? Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) : 0
    const cursor = timelineCursorAtEpoch(props.timeline, timelineStart() + fraction * timelineSpan())
    return { cursor, index: Math.round(cursor) }
  }

  function positionAtEpoch(epoch: number): number {
    return (epoch - timelineStart()) / timelineSpan() * 100
  }

  function keyDown(event: KeyboardEvent): void {
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
    if (resumePlayback()) {
      setResumePlayback(false)
      props.onPlaying(false)
    } else if (pointerInside && hoverScrubbing() && !props.playing) {
      setResumePlayback(true)
    } else {
      props.onPlaying(!props.playing)
    }
  }

  return <section class="scrubber" aria-label={`Regenverwachting en tijd voor ${props.locationLabel}`}>
    <div class="scrubber-toolbar">
      <div class="time-horizon" role="group" aria-label="Tijdsbereik">
        <For each={[8, 24] as const}>{(hours) => <button type="button" classList={{ active: props.horizonHours === hours }} aria-pressed={props.horizonHours === hours} onClick={() => props.onHorizonHours(hours)}>+{hours}u</button>}</For>
        <button type="button" classList={{ active: props.horizonHours === null }} aria-pressed={props.horizonHours === null} onClick={() => props.onHorizonHours(null)}>Alles</button>
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
      aria-valuetext={props.timeline.length ? `${new Date(cursorEpoch()).toLocaleString('nl-NL')}, ${formatRain(props.values[Math.round(props.cursor)])}` : undefined}
      title={hoverScrubbing() ? 'Hover-scrubben · klik om hier te blijven' : 'Vast · klik voor hover of sleep om te scrubben'}
      onKeyDown={keyDown}
      onPointerEnter={(event) => {
        pointerInside = true
        if (hoverScrubbing() && event.pointerType === 'mouse') pauseForPointerInteraction()
      }}
      onPointerDown={(event) => {
        pressedX = event.clientX
        dragged = false
        pauseForPointerInteraction()
        event.currentTarget.setPointerCapture(event.pointerId)
        const { index } = pointerPosition(event)
        setHovered(index)
      }}
      onPointerMove={(event) => {
        const { cursor, index } = pointerPosition(event)
        setHovered(index)
        const captured = event.currentTarget.hasPointerCapture(event.pointerId)
        if (captured && pressedX !== undefined && Math.abs(event.clientX - pressedX) > 3) dragged = true
        if ((hoverScrubbing() && event.pointerType === 'mouse' && !captured) || (captured && dragged)) props.onCursor(cursor)
      }}
      onPointerUp={(event) => {
        const { cursor, index } = pointerPosition(event)
        setHovered(index)
        props.onCursor(cursor)
        const nextHoverScrubbing = dragged
          ? false
          : event.pointerType === 'mouse' ? !hoverScrubbing() : hoverScrubbing()
        setHoverScrubbing(nextHoverScrubbing)
        if (!(nextHoverScrubbing && pointerInside && event.pointerType === 'mouse')) resumeAfterPointerInteraction()
        if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        pressedX = undefined
        dragged = false
      }}
      onPointerCancel={(event) => {
        pressedX = undefined
        dragged = false
        if (!(hoverScrubbing() && pointerInside && event.pointerType === 'mouse')) resumeAfterPointerInteraction()
      }}
      onPointerLeave={(event) => {
        pointerInside = false
        const captured = event.currentTarget.hasPointerCapture(event.pointerId)
        if (!captured) setHovered(null)
        if (!captured && hoverScrubbing() && event.pointerType === 'mouse') resumeAfterPointerInteraction()
      }}
    >
      <div class="y-axis" aria-hidden="true">
        <For each={yTicks()}>{(tick) => <span style={{ top: `${tick.top}%` }}>{formatAxis(tick.value)}</span>}</For>
      </div>
      <div class="chart-plot" ref={plotElement}>
        <svg viewBox={`0 0 ${width} ${plotHeight}`} preserveAspectRatio="none" aria-hidden="true">
          <For each={bands()}>{(band) => <rect class={`rain-band ${band.key}`} x="0" y={band.top / 100 * plotHeight} width={width} height={band.height / 100 * plotHeight} />}</For>
          <For each={bars()}>{(bar) => <rect class="rain-bar" x={bar.x} y={bar.y} width={bar.width} height={plotHeight - bar.y} rx="1" />}</For>
        </svg>
        <div class="hour-grid" aria-hidden="true"><For each={xTicks()}>{(tick) => <i style={{ left: `${tick.left}%` }} />}</For></div>
        <div class="day-grid" aria-hidden="true"><For each={dayMarkers()}>{(marker) => <div classList={{ boundary: marker.boundary }} style={{ left: `${positionAtEpoch(marker.epoch)}%` }}><span>{marker.label}</span></div>}</For></div>
        <div class="band-labels" aria-hidden="true"><For each={bands()}>{(band) => <span class={band.key} style={{ top: `${band.top + band.height / 2}%` }}>{band.label}</span>}</For></div>
        <Show when={props.loading}>
          <div class="scrubber-placeholder" role="status">
            <div class="scrubber-placeholder-bars" aria-hidden="true"><For each={[26, 44, 31, 58, 76, 49, 67, 39, 55, 72, 46, 62]}>{(height) => <i style={{ height: `${height}%` }} />}</For></div>
            <span>Regenverwachting laden…</span>
          </div>
        </Show>
        <Show when={!props.loading && !props.values.length}><span class="empty-graph">Kies een locatie voor de regengrafiek</span></Show>
        <div class="now-line" style={{ left: `${nowPosition()}%` }}><span>Nu</span></div>
        <div class="cursor-marker" style={{ left: `${cursorPosition()}%` }}>
          <button
            type="button"
            aria-label={(resumePlayback() || props.playing) ? 'Pauzeren' : 'Afspelen'}
            onPointerDown={(event) => event.stopPropagation()}
            onPointerUp={(event) => event.stopPropagation()}
            onClick={togglePlaybackFromCursor}
          >
            <span class="cursor-time">{props.timeline.length ? new Date(cursorEpoch()).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</span>
            <span class="cursor-playback" aria-hidden="true">{(resumePlayback() || props.playing) ? 'Ⅱ' : '▶'}</span>
          </button>
        </div>
        <Show when={hoverData()?.frame}>{(frame) => <div
          class="chart-tooltip"
          style={{ left: `${positionAtEpoch(frame().epoch)}%` }}
          role="status"
        ><strong>{formatRain(hoverData()!.value)}</strong><span>{new Date(frame().epoch).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</span></div>}</Show>
        <div class="x-axis" aria-hidden="true"><For each={xTicks()}>{(tick) => <span style={{ left: `${tick.left}%` }}>{new Date(tick.epoch).getHours()}u</span>}</For></div>
      </div>
    </div>
    <div class="regimes" aria-label="Databronzones">
      <For each={timelineZones(props.timeline, timelineStart(), timelineEnd())}>{(zone) => <span class={zone.kind} style={{ left: `${zone.start}%`, width: `${zone.end - zone.start}%` }}>{zone.label}</span>}</For>
    </div>
  </section>
}

function formatRain(value: number | null | undefined): string {
  return value == null ? 'Geen data' : `${value.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mm/u`
}

function formatAxis(value: number): string {
  return value < 1 ? value.toLocaleString('nl-NL', { maximumFractionDigits: 1 }) : value.toLocaleString('nl-NL')
}

function dayLabel(epoch: number, todayEpoch: number): string {
  const date = new Date(epoch)
  const today = new Date(todayEpoch)
  if (date.toDateString() === today.toDateString()) return 'Vandaag'
  today.setDate(today.getDate() + 1)
  if (date.toDateString() === today.toDateString()) return 'Morgen'
  today.setDate(today.getDate() - 2)
  if (date.toDateString() === today.toDateString()) return 'Gisteren'
  return date.toLocaleDateString('nl-NL', { weekday: 'long' })
}
