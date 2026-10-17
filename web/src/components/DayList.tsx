import { createMemo, For, onCleanup, onMount, Show } from 'solid-js'
import type { DayRow } from '../core/days'
import { CALM_BAR_STOPS, cssRgb, paletteColor } from '../core/temperature-palette'
import { deriveDayIcon, summarizeWindFrom, UNLIKELY_RAIN_PERCENT, type WindUnit } from '../core/weather'
import WeatherIcon from './WeatherIcon'
import WindReading from './WindReading'

interface Props {
  rows: DayRow[]
  windUnit: WindUnit
  dayNight?: boolean
  /** De lijst komt bijna in beeld: pas dan de ECMWF-chunks en de volledige HARMONIE-reeks ophalen (U91). */
  onNear: () => void
}

const NEAR_MARGIN_PX = 600

export default function DayList(props: Props) {
  let element!: HTMLElement
  onMount(() => {
    if (typeof IntersectionObserver === 'undefined') {
      props.onNear()
      return
    }
    // Scrolt de tabel in zijn eigen paneel (desktop), dan is dat de wortel; anders het beeldscherm.
    const scroller = element.closest<HTMLElement>('.table-scroll')
    const root = scroller && /auto|scroll/.test(getComputedStyle(scroller).overflowY) ? scroller : null
    const observer = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return
      observer.disconnect()
      props.onNear()
    }, { root, rootMargin: `0px 0px ${NEAR_MARGIN_PX}px 0px` })
    observer.observe(element)
    onCleanup(() => observer.disconnect())
  })
  const scale = createMemo(() => {
    const lows = props.rows.flatMap((row) => row.tmin == null ? [] : [row.tmin])
    const highs = props.rows.flatMap((row) => row.tmax == null ? [] : [row.tmax])
    if (!lows.length || !highs.length) return undefined
    const low = Math.floor(Math.min(...lows))
    const high = Math.ceil(Math.max(...highs))
    return { low, span: Math.max(1, high - low) }
  })
  return <section ref={element} class="day-list" classList={{ 'day-night-list': props.dayNight !== false }} aria-labelledby="day-list-title">
    <h3 id="day-list-title" class="day-list-title">Komende dagen</h3>
    <ol>
      <For each={props.rows}>{(row) => {
        const placeholder = () => row.pending ? '…' : '—'
        const degrees = (value: number | null) => value == null ? placeholder() : `${Math.round(value)}°`
        const icon = createMemo(() => deriveDayIcon(row.precipMm, row.cloud))
        const rain = () => row.precipMm != null && row.precipMm >= 0.5 ? `${Math.round(row.precipMm)}` : undefined
        // ENS-kansen uit 51 leden: op tientallen afgerond, 0 % blijft leeg.
        const chance = () => row.precipProb == null ? undefined : Math.round(row.precipProb / 10) * 10
        const wind = createMemo(() => summarizeWindFrom(row.windMs, row.windFromDegrees, row.gustMs, props.windUnit))
        const bar = () => {
          const range = scale()
          if (!range || row.tmin == null || row.tmax == null) return undefined
          return {
            left: `${(row.tmin - range.low) / range.span * 100}%`,
            width: `${Math.max(0, row.tmax - row.tmin) / range.span * 100}%`,
            'background-image': `linear-gradient(90deg, ${cssRgb(paletteColor(row.tmin, CALM_BAR_STOPS))}, ${cssRgb(paletteColor(row.tmax, CALM_BAR_STOPS))})`,
          }
        }
        const label = () => [
          row.label,
          icon()?.label,
          row.tmax == null ? undefined : `max ${Math.round(row.tmax)}°, min ${Math.round(row.tmin ?? row.tmax)}°`,
          rain() ? `${rain()} mm neerslag` : undefined,
          chance() ? `${chance()} % kans op regen` : undefined,
        ].filter(Boolean).join(', ')
        return <li
          class="day-row"
          classList={{ 'pending-day': row.pending }}
          data-date={row.date}
          data-source={row.source}
          style={{ '--day-overcast': ((row.cloud ?? 50) / 100 * 0.75).toFixed(3) }}
          aria-label={label()}
        >
          <span class="day-name">{row.label}</span>
          <span class="day-weather">
            <Show when={icon()} fallback={<span class="day-icon-placeholder">{placeholder()}</span>}>{(model) => <WeatherIcon model={model()} />}</Show>
            <Show when={rain()}>{(amount) => <span class="rain-amount" classList={{ unlikely: (row.precipProb ?? 100) < UNLIKELY_RAIN_PERCENT }}>{amount()}<small> mm</small></span>}</Show>
          </span>
          <span class="day-chance" classList={{ likely: (chance() ?? 0) >= 50 }}>{chance() ? `${chance()}%` : ''}</span>
          <span class="day-temperatures">
            <span class="day-min">{degrees(row.tmin)}</span>
            <span class="day-bar" aria-hidden="true"><Show when={bar()}>{(style) => <i style={style()} />}</Show></span>
            <span class="day-max">{degrees(row.tmax)}</span>
          </span>
          <span class="day-wind"><Show when={wind()} fallback={placeholder()}>{(summary) => <WindReading summary={summary()} />}</Show></span>
        </li>
      }}</For>
    </ol>
  </section>
}
