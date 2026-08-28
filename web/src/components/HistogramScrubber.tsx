import { createMemo, For, Show } from 'solid-js'
import type { TimelineFrame } from '../core/contract'
import { regimeLabel } from '../core/time-model'

interface Props {
  timeline: TimelineFrame[]
  values: Array<number | null>
  cursor: number
  now: number
  playing: boolean
  onCursor: (cursor: number) => void
  onPlaying: (playing: boolean) => void
}

const width = 1000
const plotHeight = 112

export default function HistogramScrubber(props: Props) {
  const selected = createMemo(() => props.timeline[Math.round(props.cursor)])
  const bars = createMemo(() => {
    const values = props.values
    const maximum = Math.max(1, ...values.map((value) => value ?? 0))
    const barWidth = width / Math.max(1, props.timeline.length)
    return props.timeline.map((_, index) => ({
      x: index * barWidth,
      width: Math.max(1.2, barWidth - 1),
      height: Math.max(1, Math.sqrt((values[index] ?? 0) / maximum) * (plotHeight - 5)),
    }))
  })
  const nowPosition = createMemo(() => {
    if (props.timeline.length < 2) return 0
    let index = 0
    for (let candidate = 0; candidate < props.timeline.length; candidate++) {
      if (props.timeline[candidate]!.epoch <= props.now) index = candidate
    }
    return index / (props.timeline.length - 1) * 100
  })
  const regimes = createMemo(() => {
    const result: Array<{ label: string; start: number; end: number; className: string }> = []
    const timeline = props.timeline
    if (!timeline.length) return result
    let nowIndex = 0
    for (let index = 0; index < timeline.length; index++) if (timeline[index]!.epoch <= props.now) nowIndex = index
    const nowcastStart = timeline.findIndex((frame, index) => index > nowIndex && frame.source === 'nowcast')
    const modelStart = timeline.findIndex((frame, index) => index > nowIndex && frame.source === 'harmonie')
    const boundary = (index: number) => Math.max(0, index) / timeline.length * 100
    const forecastStart = nowcastStart >= 0 ? nowcastStart : modelStart >= 0 ? modelStart : timeline.length
    result.push({ label: 'Verleden', start: 0, end: boundary(forecastStart), className: 'history' })
    if (nowcastStart >= 0) result.push({ label: 'Nowcast', start: boundary(nowcastStart), end: boundary(modelStart >= 0 ? modelStart : timeline.length), className: 'nowcast' })
    if (modelStart >= 0) result.push({ label: 'Model', start: boundary(modelStart), end: 100, className: 'model' })
    return result
  })

  function updateFromPointer(event: PointerEvent): void {
    const bounds = (event.currentTarget as HTMLDivElement).getBoundingClientRect()
    const fraction = Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width))
    props.onCursor(fraction * Math.max(0, props.timeline.length - 1))
  }

  function keyDown(event: KeyboardEvent): void {
    const last = Math.max(0, props.timeline.length - 1)
    const steps: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -6, PageUp: 6 }
    if (event.key === 'Home') { event.preventDefault(); props.onCursor(0); return }
    if (event.key === 'End') { event.preventDefault(); props.onCursor(last); return }
    const step = steps[event.key]
    if (step) { event.preventDefault(); props.onCursor(Math.max(0, Math.min(last, props.cursor + step))) }
  }

  return <section class="scrubber" aria-label="Regenverwachting en tijd">
    <div class="scrubber-heading">
      <button class="play" onClick={() => props.onPlaying(!props.playing)} aria-label={props.playing ? 'Pauzeren' : 'Afspelen'}>
        {props.playing ? 'Ⅱ' : '▶'}
      </button>
      <div class="selected-time">
        <strong>{selected() ? new Date(selected()!.epoch).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }) : '--:--'}</strong>
        <span>{selected() && `${regimeLabel(selected()!.source)} · ${new Date(selected()!.epoch).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })}`}</span>
      </div>
      <span class="scrub-hint">Sleep door de verwachting</span>
    </div>
    <div
      class="scrub-surface"
      role="slider"
      tabIndex={0}
      aria-label="Tijd"
      aria-valuemin={0}
      aria-valuemax={Math.max(0, props.timeline.length - 1)}
      aria-valuenow={Math.round(props.cursor)}
      aria-valuetext={selected() ? new Date(selected()!.epoch).toLocaleString('nl-NL') : undefined}
      onKeyDown={keyDown}
      onPointerDown={(event) => { event.currentTarget.setPointerCapture(event.pointerId); updateFromPointer(event) }}
      onPointerMove={(event) => { if (event.currentTarget.hasPointerCapture(event.pointerId)) updateFromPointer(event) }}
    >
      <svg viewBox={`0 0 ${width} ${plotHeight}`} preserveAspectRatio="none" aria-hidden="true">
        <For each={bars()}>{(bar) => <rect class="rain-bar" x={bar.x} y={plotHeight - bar.height} width={bar.width} height={bar.height} rx="1" />}</For>
        <line class="cursor-line" x1={props.cursor / Math.max(1, props.timeline.length - 1) * width} x2={props.cursor / Math.max(1, props.timeline.length - 1) * width} y1="0" y2={plotHeight} />
      </svg>
      <Show when={!props.values.length}><span class="empty-graph">Kies een locatie voor de regengrafiek</span></Show>
      <div class="now-line" style={{ left: `${nowPosition()}%` }}><span>Nu</span></div>
    </div>
    <div class="regimes" aria-hidden="true">
      <For each={regimes()}>{(regime) => <span class={regime.className} style={{ left: `${regime.start}%`, width: `${regime.end - regime.start}%` }}>{regime.label}</span>}</For>
    </div>
  </section>
}
