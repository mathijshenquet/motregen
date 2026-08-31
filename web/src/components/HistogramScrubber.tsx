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
  loading: boolean
  locationLabel: string
  onCursor: (cursor: number) => void
  onPlaying: (playing: boolean) => void
}

const width = 1000
const plotHeight = 132

export default function HistogramScrubber(props: Props) {
  let plotElement!: HTMLDivElement
  let pressedX: number | undefined
  let dragged = false
  let pointerInside = false
  let resumePlayback = false
  const [hovered, setHovered] = createSignal<number | null>(null)
  const [hoverScrubbing, setHoverScrubbing] = createSignal(true)
  const selected = createMemo(() => props.timeline[Math.round(props.cursor)])
  const timelineStart = createMemo(() => props.timeline[0]?.epoch ?? 0)
  const timelineEnd = createMemo(() => props.timeline.at(-1)?.epoch ?? timelineStart())
  const timelineSpan = createMemo(() => Math.max(1, timelineEnd() - timelineStart()))
  const maximum = createMemo(() => rainChartMaximum(props.values))
  const y = (value: number) => plotHeight * (1 - rainChartPosition(value, maximum()))
  const bars = createMemo(() => {
    if (props.timeline.length === 1) return [{ x: 0, width: width - 1, y: props.values[0] == null ? plotHeight : y(props.values[0]!) }]
    return props.timeline.map((frame, index) => {
      const value = props.values[index]
      const leftEpoch = index === 0 ? timelineStart() : (props.timeline[index - 1]!.epoch + frame.epoch) / 2
      const rightEpoch = index === props.timeline.length - 1 ? timelineEnd() : (frame.epoch + props.timeline[index + 1]!.epoch) / 2
      const x = (leftEpoch - timelineStart()) / timelineSpan() * width
      const right = (rightEpoch - timelineStart()) / timelineSpan() * width
      return { x, width: Math.max(1.4, right - x - 1), y: value == null ? plotHeight : y(value) }
    })
  })
  const bands = createMemo(() => RAIN_BANDS.map((band) => {
    const upper = Number.isFinite(band.maximum) ? band.maximum : maximum()
    const top = y(upper)
    const bottom = y(band.minimum)
    return { ...band, top: top / plotHeight * 100, height: Math.max(0, bottom - top) / plotHeight * 100 }
  }))
  const yTicks = createMemo(() => [...new Set([0, 0.1, 2.5, 7.5, maximum()])].map((value) => ({ value, top: y(value) / plotHeight * 100 })))
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
    const last = Math.max(0, props.timeline.length - 1)
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -6, PageUp: 6 }
    if (event.key === 'Home') { event.preventDefault(); props.onCursor(0); return }
    if (event.key === 'End') { event.preventDefault(); props.onCursor(last); return }
    const step = steps[event.key]
    if (step) { event.preventDefault(); props.onCursor(Math.max(0, Math.min(last, props.cursor + step))) }
  }

  function pauseForPointerInteraction(): void {
    if (resumePlayback || !props.playing) return
    resumePlayback = true
    props.onPlaying(false)
  }

  function resumeAfterPointerInteraction(): void {
    if (!resumePlayback) return
    resumePlayback = false
    props.onPlaying(true)
  }

  return <section class="scrubber" aria-label="Regenverwachting en tijd">
    <div class="scrubber-heading">
      <button class="play" onClick={() => props.onPlaying(!props.playing)} aria-label={props.playing ? 'Pauzeren' : 'Afspelen'}>
        {props.playing ? 'Ⅱ' : '▶'}
      </button>
      <div class="selected-time">
        <span class="location-label">{props.locationLabel}</span>
        <strong>{selected() ? new Date(selected()!.epoch).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</strong>
        <span>{selected() && new Date(selected()!.epoch).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
      </div>
    </div>
    <div
      class="scrub-surface"
      classList={{ 'hover-scrubbing': hoverScrubbing() }}
      role="slider"
      tabIndex={0}
      aria-label="Tijd"
      aria-valuemin={0}
      aria-valuemax={Math.max(0, props.timeline.length - 1)}
      aria-valuenow={Math.round(props.cursor)}
      aria-disabled={props.loading}
      aria-valuetext={selected() ? `${new Date(selected()!.epoch).toLocaleString('nl-NL')}, ${formatRain(props.values[Math.round(props.cursor)])}` : undefined}
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
          <line class="cursor-line" x1={positionAtEpoch(timelineEpochAtCursor(props.timeline, props.cursor)) / 100 * width} x2={positionAtEpoch(timelineEpochAtCursor(props.timeline, props.cursor)) / 100 * width} y1="0" y2={plotHeight} />
        </svg>
        <div class="hour-grid" aria-hidden="true"><For each={xTicks()}>{(tick) => <i style={{ left: `${tick.left}%` }} />}</For></div>
        <div class="band-labels" aria-hidden="true"><For each={bands()}>{(band) => <span class={band.key} style={{ top: `${band.top + band.height / 2}%` }}>{band.label}</span>}</For></div>
        <Show when={props.loading}>
          <div class="scrubber-placeholder" role="status">
            <div class="scrubber-placeholder-bars" aria-hidden="true"><For each={[26, 44, 31, 58, 76, 49, 67, 39, 55, 72, 46, 62]}>{(height) => <i style={{ height: `${height}%` }} />}</For></div>
            <span>Regenverwachting laden…</span>
          </div>
        </Show>
        <Show when={!props.loading && !props.values.length}><span class="empty-graph">Kies een locatie voor de regengrafiek</span></Show>
        <div class="now-line" style={{ left: `${nowPosition()}%` }}><span>Nu</span></div>
        <Show when={hoverData()?.frame}>{(frame) => <div
          class="chart-tooltip"
          style={{ left: `${positionAtEpoch(frame().epoch)}%` }}
          role="status"
        ><strong>{formatRain(hoverData()!.value)}</strong><span>{new Date(frame().epoch).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</span></div>}</Show>
        <div class="x-axis" aria-hidden="true"><For each={xTicks()}>{(tick) => <span style={{ left: `${tick.left}%` }}>{new Date(tick.epoch).getHours()}u</span>}</For></div>
      </div>
    </div>
    <div class="regimes" aria-label="Databronzones">
      <For each={timelineZones(props.timeline)}>{(zone) => <span class={zone.kind} style={{ left: `${zone.start}%`, width: `${zone.end - zone.start}%` }}>{zone.label}</span>}</For>
    </div>
  </section>
}

function formatRain(value: number | null | undefined): string {
  return value == null ? 'Geen data' : `${value.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} mm/u`
}

function formatAxis(value: number): string {
  return value < 1 ? value.toLocaleString('nl-NL', { maximumFractionDigits: 1 }) : value.toLocaleString('nl-NL')
}
