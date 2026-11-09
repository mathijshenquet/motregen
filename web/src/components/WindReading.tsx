import { Show } from 'solid-js'
import { WIND_UNIT_LABELS, type WindSummary } from '../core/weather'
import { windGlyphName, windGlyphSvg } from '../core/wind-glyph'
import { ArrowUp, Wind } from './icons'

// Windmodus-proef (U101 ronde 2): onder `?dev&vaan=<glyph>` dezelfde glyph als op de kaart, klein.
const search = typeof window === 'undefined' ? '' : window.location.search
const tableGlyph = new URLSearchParams(search).has('dev') ? windGlyphName(new URLSearchParams(search).get('vaan')) : undefined

// De pijl wijst waar de wind heen waait, zoals de deeltjes op de kaart; de letters blijven in de titel.
export default function WindReading(props: { summary: WindSummary }) {
  const unit = () => WIND_UNIT_LABELS[props.summary.unit]
  const label = () => `Wind uit ${props.summary.direction}, ${props.summary.value} ${unit()}` +
    (props.summary.gust == null ? '' : `, windstoten tot ${props.summary.gust} ${unit()}`)
  const toward = () => (props.summary.fromDegrees + 180) % 360
  // Pijl en hoofdwaarde, daaronder kleiner en lichter de vlaag met windicoon (PO 2026-09-25 live).
  return <span class="wind-reading" classList={{ 'with-glyph': !!tableGlyph }} role="img" aria-label={label()} title={label()}>
    <Show when={tableGlyph} fallback={
      <ArrowUp class="wind-arrow" size={15} strokeWidth={2.25} style={{ transform: `rotate(${toward()}deg)` }} aria-hidden="true" />
    }>{(glyph) => <span class="wind-glyph-cell" aria-hidden="true" innerHTML={windGlyphSvg(glyph(), props.summary.beaufort, 'tabel', toward())} />}</Show>
    <span class="wind-main"><b>{props.summary.value}</b><small class="wind-unit">{unit()}</small></span>
    <Show when={props.summary.gust}>{(gust) => <>
      <Wind class="wind-gust-icon" size={12} strokeWidth={2.25} aria-hidden="true" />
      <small class="wind-gust">{gust()} {unit()}</small>
    </>}</Show>
  </span>
}
