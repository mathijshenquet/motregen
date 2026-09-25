import { Show } from 'solid-js'
import { formatUv, UV_SCALE_MAX, uvLevel, type UvReading } from '../core/uv'

export type UvBarVariant = 'double' | 'dot'

interface Props {
  reading: UvReading | null
  variant: UvBarVariant
  // Chip: alleen de balk, getal en klasse staan al in de chiptekst.
  bare?: boolean
  // Volle balk: de tabel geeft de heldere-hemel-UV van die dag op het middaguur mee, zodat de lengte
  // "hoeveel van wat vandaag kan" leest; de kleur blijft de absolute WHO-klasse.
  scale?: number
}

const clampPercent = (value: number, scale: number) => `${(Math.min(Math.max(value, 0), scale) / scale) * 100}%`
const bands = [3, 6, 8, 11] as const

export function uvBarLabel(reading: UvReading): string {
  const clear = reading.clear - reading.value >= 0.1
    ? `; zonder wolken ${reading.clearEstimated ? 'ongeveer ' : ''}${formatUv(reading.clear)} ${uvLevel(reading.clear).level}`
    : ''
  return `UV ${reading.estimated ? 'ongeveer ' : ''}${formatUv(reading.value)} ${uvLevel(reading.value).level}${clear}`
}

export default function UvBar(props: Props) {
  const reading = () => props.reading
  const scale = () => Math.max(props.scale ?? UV_SCALE_MAX, reading()?.clear ?? 0, reading()?.value ?? 0, 0.1)
  const percent = (value: number) => clampPercent(value, scale())
  const bandStops = () => Object.fromEntries(bands.map((band, index) => [`--uv-band-${index + 1}`, percent(band)]))
  const dark = () => !reading() || reading()!.clear < 0.05
  return <span
    class="uv-bar"
    classList={{ 'uv-bar-dark': dark(), 'uv-bar-bare': props.bare === true, estimated: reading()?.estimated === true }}
    data-variant={props.variant}
    data-level={reading() && !dark() ? uvLevel(reading()!.value).key : undefined}
    data-clear-level={reading() && !dark() ? uvLevel(reading()!.clear).key : undefined}
    role="img"
    aria-label={reading() && !dark() ? uvBarLabel(reading()!) : 'Geen zon'}
    title={reading() && !dark() ? uvBarLabel(reading()!) : undefined}
  >
    <span class="uv-bar-track" aria-hidden="true" style={bandStops()}>
      <Show when={reading() && !dark()}>
        <Show when={props.variant === 'double'}><span class="uv-bar-clear" style={{ width: percent(reading()!.clear) }} /></Show>
        <span class="uv-bar-fill" style={{ width: percent(reading()!.value) }} />
        <Show when={props.variant === 'dot' && reading()!.clear - reading()!.value >= 0.3}>
          <span class="uv-bar-dot" style={{ left: percent(reading()!.clear) }} />
        </Show>
      </Show>
    </span>
    <Show when={!props.bare && reading() && !dark()}>
      <span class="uv-bar-value" aria-hidden="true">{reading()!.estimated ? '≈' : ''}{formatUv(reading()!.value)}</span>
      <span class="uv-bar-level" aria-hidden="true">{reading()!.value >= 3 ? uvLevel(reading()!.value).level : ''}</span>
    </Show>
  </span>
}
