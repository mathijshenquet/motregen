import { Show } from 'solid-js'
import { WIND_UNIT_LABELS, type WindSummary } from '../core/weather'
import { ArrowUp, Wind } from './icons'

// De pijl wijst waar de wind heen waait, zoals de deeltjes op de kaart; de letters blijven in de titel.
export default function WindReading(props: { summary: WindSummary }) {
  const unit = () => WIND_UNIT_LABELS[props.summary.unit]
  const label = () => `Wind uit ${props.summary.direction}, ${props.summary.value} ${unit()}` +
    (props.summary.gust == null ? '' : `, windstoten tot ${props.summary.gust} ${unit()}`)
  // Pijl en hoofdwaarde, daaronder kleiner en lichter de vlaag met windicoon (PO 2026-09-25 live).
  return <span class="wind-reading" role="img" aria-label={label()} title={label()}>
    <ArrowUp class="wind-arrow" size={15} strokeWidth={2.25} style={{ transform: `rotate(${(props.summary.fromDegrees + 180) % 360}deg)` }} aria-hidden="true" />
    <span class="wind-main"><b>{props.summary.value}</b><small class="wind-unit">{unit()}</small></span>
    <Show when={props.summary.gust}>{(gust) => <>
      <Wind class="wind-gust-icon" size={12} strokeWidth={2.25} aria-hidden="true" />
      <small class="wind-gust">{gust()} {unit()}</small>
    </>}</Show>
  </span>
}
