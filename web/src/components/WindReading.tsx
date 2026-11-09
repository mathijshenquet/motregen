import { Show } from 'solid-js'
import { WIND_UNIT_LABELS, type WindSummary } from '../core/weather'
import { beaufortScale } from '../core/wind-beaufort'
import { windsockSvg } from '../core/wind-glyph'
import { Wind } from './icons'

// De windzak wijst waar de wind heen waait, net als op de kaart (U101); de letters blijven in de titel.
export default function WindReading(props: { summary: WindSummary }) {
  const unit = () => WIND_UNIT_LABELS[props.summary.unit]
  const label = () => `Wind uit ${props.summary.direction}, ${props.summary.value} ${unit()}` +
    (props.summary.gust == null ? '' : `, windstoten tot ${props.summary.gust} ${unit()}`)
  const toward = () => (props.summary.fromDegrees + 180) % 360
  // Zak en hoofdwaarde, daaronder kleiner en lichter de vlaag met windicoon (PO 2026-09-25 live).
  return <span class="wind-reading" role="img" aria-label={label()} title={label()}>
    <span class="wind-glyph-cell" aria-hidden="true" innerHTML={windsockSvg(beaufortScale(props.summary.speed), toward())} />
    <span class="wind-main"><b>{props.summary.value}</b><small class="wind-unit">{unit()}</small></span>
    <Show when={props.summary.gust}>{(gust) => <>
      <Wind class="wind-gust-icon" size={12} strokeWidth={2.25} aria-hidden="true" />
      <small class="wind-gust">{gust()} {unit()}</small>
    </>}</Show>
  </span>
}
