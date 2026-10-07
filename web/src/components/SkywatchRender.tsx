import { For } from 'solid-js'
import { CLOUD_LAYERS, cloudBand, type CloudLayer } from '../core/cloud-section'
import type { TimelineFrame } from '../core/contract'

const WIDTH = 960
const HEIGHT = 360
const LABEL_WIDTH = 118
const PLOT_TOP = 44
const PLOT_HEIGHT = 270
const HOUR = 3_600_000
const LABELS: Record<CloudLayer, string> = { high: 'Hoge wolken', mid: 'Middenwolken', low: 'Lage wolken' }

interface RenderInput {
  at: number
  sampleId: string
  times: number[]
  values: Record<CloudLayer, Array<number | null>>
}

function inputFromQuery(): RenderInput {
  const query = new URLSearchParams(location.search)
  const at = Date.parse(query.get('at') ?? '')
  const times = parseArray(query, 'times').map((value) => Date.parse(String(value)))
  const values = Object.fromEntries(CLOUD_LAYERS.map((layer) => [layer, parseArray(query, layer).map(numberOrNull)])) as RenderInput['values']
  if (!Number.isFinite(at) || times.length < 2 || times.some((time) => !Number.isFinite(time)) || CLOUD_LAYERS.some((layer) => values[layer].length !== times.length)) {
    throw new Error('Ongeldige skywatch-renderparameters')
  }
  return { at, sampleId: query.get('sample') ?? '', times, values }
}

function parseArray(query: URLSearchParams, key: string): unknown[] {
  const value: unknown = JSON.parse(query.get(key) ?? '[]')
  return Array.isArray(value) ? value : []
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

export default function SkywatchRender() {
  const input = inputFromQuery()
  const plotWidth = WIDTH - LABEL_WIDTH - 24
  const bandHeight = PLOT_HEIGHT / CLOUD_LAYERS.length
  const start = input.at
  const end = input.at + 3 * HOUR
  const timeline = input.times.map((epoch, frameIndex) => ({
    time: new Date(epoch).toISOString(), epoch, source: 'harmonie', run: '', frameIndex,
    chunk: { url: '', source: 'harmonie', field: 'cloud_low', run: '', header_len: 0, times: [] },
  }) satisfies TimelineFrame)
  const bands = CLOUD_LAYERS.map((layer, index) => ({
    layer,
    top: PLOT_TOP + index * bandHeight,
    ...cloudBand(timeline, input.values[layer], layer, { width: plotWidth, top: PLOT_TOP + index * bandHeight, height: bandHeight, start, end }),
  }))
  const ticks = Array.from({ length: 4 }, (_, index) => ({
    x: LABEL_WIDTH + plotWidth * index / 3,
    label: new Date(start + index * HOUR).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' }),
  }))
  return <main data-testid="skywatch-render" style={{ width: `${WIDTH}px`, height: `${HEIGHT}px`, background: 'var(--surface)', color: 'var(--ink)', padding: '0', overflow: 'hidden' }}>
    <svg width={WIDTH} height={HEIGHT} viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={`Wolkendoorsnede De Bilt vanaf ${new Date(start).toISOString()}`}>
      <rect width={WIDTH} height={HEIGHT} fill="var(--surface)" />
      <text x="16" y="25" font-size="14" font-weight="700" fill="var(--ink)">De Bilt · wolkendoorsnede</text>
      <text x={WIDTH - 16} y="25" text-anchor="end" font-size="11" fill="var(--muted)">{input.sampleId}</text>
      <For each={bands}>{(band) => <>
        <rect x={LABEL_WIDTH} y={band.top} width={plotWidth} height={bandHeight} fill={band.layer === 'high' ? '#dbe8ed' : band.layer === 'mid' ? '#d2dfe4' : '#c7d9e0'} opacity="0.22" />
        <text x={LABEL_WIDTH - 10} y={band.top + bandHeight / 2 + 4} text-anchor="end" font-size="12" fill="var(--muted)">{LABELS[band.layer]}</text>
        <g transform={`translate(${LABEL_WIDTH} 0)`}>
          {/* Sinds U47 zit de bedekking in de gaten; de vulling is één vaste laagkleur. */}
          <For each={band.paths}>{(path) => <path d={path} fill={`var(--cloud-${band.layer})`} />}</For>
        </g>
        <line x1={LABEL_WIDTH} x2={LABEL_WIDTH + plotWidth} y1={band.top + bandHeight} y2={band.top + bandHeight} stroke="var(--line)" />
      </>}</For>
      <For each={ticks}>{(tick) => <>
        <line x1={tick.x} x2={tick.x} y1={PLOT_TOP} y2={PLOT_TOP + PLOT_HEIGHT} stroke="var(--line)" stroke-dasharray="2 4" />
        <text x={tick.x} y={PLOT_TOP + PLOT_HEIGHT + 24} text-anchor={tick.x === LABEL_WIDTH ? 'start' : tick.x === LABEL_WIDTH + plotWidth ? 'end' : 'middle'} font-size="12" fill="var(--muted)">{tick.label}</text>
      </>}</For>
    </svg>
  </main>
}
