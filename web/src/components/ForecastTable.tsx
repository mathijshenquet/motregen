import { createEffect, createMemo, For, onCleanup, Show } from 'solid-js'
import type { HourlyForecastRow } from '../core/forecast'
import { solarElevationSin, sunEvents, type SunEvent } from '../core/solar'
import { estimateUv, formatUv, uvAdvice } from '../core/uv'
import { deriveWeatherIcon, summarizeWind } from '../core/weather'
import WeatherIcon from './WeatherIcon'

export type SunForm = 'row' | 'marker'

export interface ForecastSeries {
  rain: Array<number | null>
  rainLoaded: boolean[]
  uv: Array<number | null>
  radiation: Array<number | null>
  temperature: Array<number | null>
  feelsLike: Array<number | null>
  humidity: Array<number | null>
  cloud: Array<number | null>
  windU: Array<number | null>
  windV: Array<number | null>
}

interface Props {
  rows: HourlyForecastRow[]
  series: ForecastSeries
  location: { lng: number; lat: number }
  columns: { weather: boolean; uv: boolean; temperature: boolean; humidity: boolean; wind: boolean }
  // Rows after this epoch have not been fetched yet; scrolling near them asks for them.
  loadedUntil: number
  // History rows stay folded (and unfetched) until the header row is tapped.
  historyOpen: boolean
  historyLoaded: boolean
  onNeedRows: () => void
  onOpenHistory: () => void
  sunForm: SunForm
}

const hour = 3_600_000

export default function ForecastTable(props: Props) {
  const sun = createMemo(() => {
    const first = props.rows[0]
    const last = props.rows.at(-1)
    if (!first || !last) return new Map<number, SunEvent>()
    const events = sunEvents(first.epoch, last.epoch + hour, props.location.lng, props.location.lat)
    return new Map(events.map((event) => [Math.floor(event.epoch / hour) * hour, event]))
  })
  const elevation = (epoch: number) => solarElevationSin(epoch, props.location.lng, props.location.lat)

  const rowElements = new Map<number, HTMLTableRowElement>()
  const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver((entries) => {
    if (entries.some((entry) => entry.isIntersecting)) props.onNeedRows()
  }, { rootMargin: '0px 0px 320px 0px' })
  createEffect(() => {
    const until = props.loadedUntil
    void props.rows
    observer?.disconnect()
    for (const [epoch, element] of rowElements) if (epoch > until) observer?.observe(element)
  })
  const pastCount = () => props.rows.filter((row) => row.kind === 'past').length
  const visibleRows = () => props.historyOpen ? props.rows : props.rows.filter((row) => row.kind !== 'past')
  onCleanup(() => observer?.disconnect())

  const columnCount = () => 2 + Number(props.columns.weather) + Number(props.columns.uv) + Number(props.columns.temperature) +
    Number(props.columns.humidity) + Number(props.columns.wind)

  return <table>
    <thead><tr>
      <th>Uur</th>
      <Show when={props.columns.weather}><th class="weather-heading">Weer</th></Show>
      <Show when={props.columns.uv}><th class="uv-heading" title="UV-index; ≈ = schatting uit modelstraling en zonshoogte">UV</th></Show>
      <Show when={props.columns.temperature}><th>Gevoel</th></Show>
      <Show when={props.columns.humidity}><th>RV</th></Show>
      <Show when={props.columns.wind}><th>Wind</th></Show>
      <th>Regen</th>
    </tr></thead>
    <tbody>
    <Show when={pastCount() > 0}>
      <tr class="history-toggle-row">
        <td colSpan={columnCount()}>
          <button type="button" class="history-toggle" aria-expanded={props.historyOpen} onClick={() => props.onOpenHistory()}>
            <span aria-hidden="true">{props.historyOpen ? '▾' : '▸'}</span>
            {props.historyOpen ? 'Afgelopen uren verbergen' : `Afgelopen ${pastCount()} uur tonen`}
          </button>
        </td>
      </tr>
    </Show>
    <For each={visibleRows()}>{(row) => {
      const pending = () => row.epoch > props.loadedUntil || (row.kind === 'past' && !props.historyLoaded)
      const value = (series: Array<number | null>, index: number | null) => index == null ? null : series[index] ?? null
      const rain = () => value(props.series.rain, row.rainIndex)
      const cloud = () => value(props.series.cloud, row.cloudIndex)
      const feelsLike = () => value(props.series.feelsLike, row.feelsLikeIndex)
      const temperature = () => value(props.series.temperature, row.temperatureIndex)
      const degrees = (reading: number | null) => reading == null ? placeholder() : `${Math.round(reading)}°`
      const humidity = () => value(props.series.humidity, row.humidityIndex)
      const wind = () => summarizeWind(value(props.series.windU, row.windUIndex), value(props.series.windV, row.windVIndex))
      const icon = () => deriveWeatherIcon(rain(), cloud(), elevation(row.epoch) > 0)
      const uv = createMemo(() => {
        const measured = value(props.series.uv, row.uvIndex)
        if (measured != null) return { value: measured, estimated: false }
        if (row.kind === 'past') return null
        const estimate = estimateUv(row.epoch, value(props.series.radiation, row.radiationIndex),
          value(props.series.radiation, row.radiationNextIndex), elevation)
        return estimate == null ? null : { value: estimate, estimated: true }
      })
      const uvText = () => {
        const reading = uv()
        if (!reading) return pending() ? '…' : ''
        if (reading.value < 0.05 && elevation(row.epoch) <= 0) return ''
        return `${reading.estimated ? '≈' : ''}${formatUv(reading.value)}`
      }
      const sunEvent = () => sun().get(row.epoch)
      const time = (epoch: number) => new Date(epoch).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
      const sunLabel = (event: SunEvent) => `${event.kind === 'rise' ? 'Zon op' : 'Zon onder'} ${time(event.epoch)}`
      const placeholder = () => pending() ? '…' : '—'
      return <>
        <tr
          ref={(element) => {
            rowElements.set(row.epoch, element)
            onCleanup(() => rowElements.delete(row.epoch))
          }}
          classList={{ 'current-hour': row.kind === 'now', 'past-hour': row.kind === 'past', 'pending-hour': pending() }}
        >
          <td>
            <strong>{time(row.epoch)}</strong>
            <span classList={{ 'now-label': row.kind === 'now' }}>{row.kind === 'now' ? 'Nu' : new Date(row.epoch).toLocaleDateString('nl-NL', { weekday: 'short' })}</span>
            <Show when={props.sunForm === 'marker' && sunEvent()}>{(event) =>
              <span class="sun-mark" title={sunLabel(event())}><SunGlyph kind={event().kind} />{time(event().epoch)}</span>
            }</Show>
          </td>
          <Show when={props.columns.weather}><td class="weather-cell"><Show when={icon()}>{(model) => <WeatherIcon model={model()} />}</Show></td></Show>
          <Show when={props.columns.uv}>
            <td class="uv-cell" classList={{ estimated: uv()?.estimated === true, strong: uvAdvice(uv()?.value) != null }}
              title={uv()?.estimated ? 'Schatting uit modelstraling en zonshoogte' : uv() ? 'KNMI UV-analyse' : undefined}>
              {uvText()}
            </td>
          </Show>
          <Show when={props.columns.temperature}><td class="temperature-cell">{degrees(feelsLike())}<small class="air-temperature" title="Luchttemperatuur">{degrees(temperature())}</small></td></Show>
          <Show when={props.columns.humidity}><td>{humidity() == null ? placeholder() : `${Math.round(humidity()!)}%`}</td></Show>
          <Show when={props.columns.wind}><td class="wind-cell"><Show when={wind()} fallback={placeholder()}>{(summary) =>
            <span title={`${summary().speed.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} m/s`}>{summary().direction} · {summary().beaufort} Bft</span>
          }</Show></td></Show>
          <td>{rain() == null ? (row.rainIndex != null && !props.series.rainLoaded[row.rainIndex] ? '…' : placeholder()) : rain()!.toLocaleString('nl-NL', { maximumFractionDigits: rain()! < 1 ? 2 : 1 })}<small> mm/u</small></td>
        </tr>
        <Show when={props.sunForm === 'row' && sunEvent()}>{(event) =>
          <tr class="sun-row" classList={{ 'past-hour': row.kind === 'past' }}>
            <td colSpan={columnCount()}><SunGlyph kind={event().kind} />{sunLabel(event())}</td>
          </tr>
        }</Show>
      </>
    }}</For>
    </tbody>
  </table>
}

function SunGlyph(props: { kind: SunEvent['kind'] }) {
  return <svg class="sun-glyph" viewBox="0 0 20 12" aria-hidden="true">
    <path class="sun-glyph-horizon" d="M1 10.5h18" />
    <path class="sun-glyph-disc" d="M5 10.5a5 5 0 0 1 10 0Z" />
    <path class="sun-glyph-arrow" d={props.kind === 'rise' ? 'M10 5V1M8 3l2-2 2 2' : 'M10 1v4M8 3l2 2 2-2'} />
  </svg>
}
