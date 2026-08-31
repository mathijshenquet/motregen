import { createMemo, createSignal, For, Show } from 'solid-js'
import type { TimelineFrame } from '../core/contract'
import { RAIN_BANDS, rainChartMaximum, rainChartPosition } from '../core/rain-chart'
import { timelineZones } from '../core/time-model'

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
  const maximum = createMemo(() => rainChartMaximum(props.values))
  const y = (value: number) => plotHeight * (1 - rainChartPosition(value, maximum()))
  const bars = createMemo(() => {
    const barWidth = width / Math.max(1, props.timeline.length)
    return props.timeline.map((_, index) => {
      const value = props.values[index]
      return { x: index * barWidth, width: Math.max(1.4, barWidth - 1), y: value == null ? plotHeight : y(value) }
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
    const count = Math.min(5, props.timeline.length)
    return Array.from({ length: count }, (_, tick) => {
      const index = Math.round(tick / Math.max(1, count - 1) * Math.max(0, props.timeline.length - 1))
      return { index, left: index / Math.max(1, props.timeline.length - 1) * 100, frame: props.timeline[index]! }
    })
  })
  const nowPosition = createMemo(() => {
    if (props.timeline.length < 2) return 0
    let index = 0
    for (let candidate = 0; candidate < props.timeline.length; candidate++) if (props.timeline[candidate]!.epoch <= props.now) index = candidate
    return index / (props.timeline.length - 1) * 100
  })
  const hoverData = createMemo(() => {
    const index = hovered()
    return index == null ? undefined : { index, frame: props.timeline[index], value: props.values[index] }
  })

  function pointerPosition(event: PointerEvent): { cursor: number; index: number } {
    const bounds = plotElement.getBoundingClientRect()
    const fraction = bounds.width ? Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)) : 0
    const cursor = fraction * Math.max(0, props.timeline.length - 1)
    return { cursor, index: Math.round(cursor) }
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
          <line class="cursor-line" x1={props.cursor / Math.max(1, props.timeline.length - 1) * width} x2={props.cursor / Math.max(1, props.timeline.length - 1) * width} y1="0" y2={plotHeight} />
        </svg>
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
          style={{ left: `${hoverData()!.index / Math.max(1, props.timeline.length - 1) * 100}%` }}
          role="status"
        ><strong>{formatRain(hoverData()!.value)}</strong><span>{new Date(frame().epoch).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</span></div>}</Show>
        <div class="x-axis" aria-hidden="true"><For each={xTicks()}>{(tick) => <span style={{ left: `${tick.left}%` }}>{new Date(tick.frame.epoch).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })}</span>}</For></div>
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
