import { createEffect, createMemo, For, onCleanup, Show } from 'solid-js'
import type { FocusKind } from '../core/focus-mode'
import type { HourlyForecastRow } from '../core/forecast'
import { solarElevationSin, sunEvents, type SunEvent } from '../core/solar'
import { dailyClearSkyUvMax, uvReading } from '../core/uv'
import { deriveWeatherIcon, dewPoint, summarizeWind, type WindSummary } from '../core/weather'
import { ArrowUp, BUTTON_ICON, Clock, CloudSun, Droplet, Droplets, Navigation2, Sun, Thermometer, Wind } from './icons'
import UvBar, { type UvBarVariant } from './UvBar'
import WeatherIcon from './WeatherIcon'

export type SunForm = 'row' | 'marker'
export type WindForm = 'arrow' | 'dial'
export type HumidityForm = 'text' | 'dew-point'

export interface ForecastSeries {
  rain: Array<number | null>
  uv: Array<number | null>
  uvClear: Array<number | null>
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
  // Touch: history rows stay folded (and unfetched) until the toggle row is tapped. Desktop (inline):
  // they sit above the now-row, the table opens scrolled to now and fetches them once one scrolls into view.
  historyInline: boolean
  historyOpen: boolean
  historyLoaded: boolean
  onNeedRows: () => void
  onNeedHistory: () => void
  onOpenHistory: () => void
  sunForm: SunForm
  uvBar: UvBarVariant
  windForm: WindForm
  humidityForm: HumidityForm
  // De koppenrij is de modebalk: Gevoel en Wind zijn kaartmodes (hover/toetsenbordfocus tijdelijk,
  // klik pint), Weer is de standaard en zet een pin uit.
  focus: {
    pinned: FocusKind | undefined
    onTogglePin: (mode: FocusKind) => void
    onFocus: (mode: FocusKind, source: 'table' | 'keyboard', active: boolean) => void
  }
}

const hour = 3_600_000

export default function ForecastTable(props: Props) {
  // Touch vuurt ook pointerenter; dat mag geen blijvende hover worden (tap op de kop toggelt).
  const hover = (mode: FocusKind, event: PointerEvent, active: boolean) => {
    if (event.pointerType !== 'touch') props.focus.onFocus(mode, 'table', active)
  }
  const ColumnLabel = (label: { icon: typeof CloudSun; text: string }) =>
    <><label.icon {...BUTTON_ICON} aria-hidden="true" /><span class="column-word">{label.text}</span></>
  const FocusHeading = (heading: { mode: FocusKind; icon: typeof CloudSun; label: string; title: string }) => <button
    type="button"
    class={`column-mode column-focus ${heading.mode}-focus`}
    aria-pressed={props.focus.pinned === heading.mode}
    title={heading.title}
    onClick={() => props.focus.onTogglePin(heading.mode)}
    onFocus={(event) => { if (event.currentTarget.matches(':focus-visible')) props.focus.onFocus(heading.mode, 'keyboard', true) }}
    onBlur={() => props.focus.onFocus(heading.mode, 'keyboard', false)}
    onPointerEnter={(event) => hover(heading.mode, event, true)}
    onPointerLeave={(event) => hover(heading.mode, event, false)}
  ><ColumnLabel icon={heading.icon} text={heading.label} /></button>
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
  const visibleRows = () => props.historyInline || props.historyOpen ? props.rows : props.rows.filter((row) => row.kind !== 'past')
  const historyObserver = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver((entries) => {
    if (!entries.some((entry) => entry.isIntersecting)) return
    historyObserver?.disconnect()
    props.onNeedHistory()
  })
  // Desktop opent op de nu-rij. Rijen komen in delen binnen (historie later bóven nu), dus de nu-rij blijft
  // bij elke groei vastgepind tot de gebruiker zelf de tabel aanraakt; pas dan gaat de historie-observer aan,
  // zodat historiedata alleen laadt als iemand echt omhoog scrolt.
  let nowElement: HTMLTableRowElement | undefined
  let pinning = false
  // Opruimen op tabelniveau: de nu-rij zelf wordt bij elke herberekening van de rijen vervangen.
  let release = () => {}
  onCleanup(() => release())
  const pinNow = (element: HTMLTableRowElement) => {
    nowElement = element
    if (pinning || !props.historyInline || typeof ResizeObserver === 'undefined') return
    pinning = true
    // De ref vuurt vóór de rij in de DOM hangt: een frame later bestaat de scroller.
    requestAnimationFrame(() => {
      const scroller = element.closest<HTMLElement>('.table-scroll')
      const table = element.closest('table')
      if (!scroller || !table) return
      const pin = () => {
        if (!nowElement?.isConnected) return
        const head = table.tHead?.getBoundingClientRect().height ?? 0
        scroller.scrollTop += nowElement.getBoundingClientRect().top - scroller.getBoundingClientRect().top - head
      }
      const sized = new ResizeObserver(pin)
      sized.observe(scroller)
      sized.observe(table)
      const inputs = ['wheel', 'pointerdown', 'touchstart', 'keydown'] as const
      const letGo = () => {
        release()
        if (props.historyLoaded) return
        for (const row of props.rows) {
          const past = row.kind === 'past' ? rowElements.get(row.epoch) : undefined
          if (past) historyObserver?.observe(past)
        }
      }
      for (const input of inputs) scroller.addEventListener(input, letGo, { passive: true })
      release = () => {
        sized.disconnect()
        for (const input of inputs) scroller.removeEventListener(input, letGo)
      }
    })
  }
  onCleanup(() => {
    observer?.disconnect()
    historyObserver?.disconnect()
  })

  const columnCount = () => 2 + Number(props.columns.uv) + Number(props.columns.temperature) +
    Number(props.columns.humidity) + Number(props.columns.wind)

  return <table class="forecast-table" data-mode={props.focus.pinned}>
    <thead><tr>
      <th class="weather-heading">
        <button type="button" class="column-mode default-mode" title="Standaardkaart: regen, wolken en zon" onClick={() => {
          const pinned = props.focus.pinned
          if (pinned) props.focus.onTogglePin(pinned)
        }}>
          <Show when={props.columns.weather} fallback={<ColumnLabel icon={Clock} text="Uur" />}><ColumnLabel icon={CloudSun} text="Weer" /></Show>
        </button>
      </th>
      <Show when={props.columns.uv}><th class="uv-heading" title="UV-index met en zonder wolken; ≈ = schatting uit modelstraling en zonshoogte">
        <span class="column-mode"><ColumnLabel icon={Sun} text="UV" /></span>
      </th></Show>
      <Show when={props.columns.temperature}><th class="temperature-heading">
        <FocusHeading mode="temperature" icon={Thermometer} label="Gevoel" title="Toon temperatuurlijnen op de kaart" />
      </th></Show>
      <Show when={props.columns.humidity}><th title="Relatieve luchtvochtigheid"><span class="column-mode"><ColumnLabel icon={Droplets} text="RV" /></span></th></Show>
      <Show when={props.columns.wind}><th class="wind-heading">
        <FocusHeading mode="wind" icon={Wind} label="Wind" title="Toon de wind op de kaart op volle sterkte" />
      </th></Show>
    </tr></thead>
    <tbody>
    <Show when={!props.historyInline && pastCount() > 0}>
      <tr class="history-toggle-row">
        <td colSpan={columnCount()}>
          <button type="button" class="history-toggle" aria-expanded={props.historyOpen} onClick={() => props.onOpenHistory()}>
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
      const uv = createMemo(() => uvReading(row.epoch, value(props.series.uv, row.uvIndex), value(props.series.uvClear, row.uvClearIndex),
        value(props.series.radiation, row.radiationIndex), value(props.series.radiation, row.radiationNextIndex), elevation, row.kind !== 'past'))
      const sunEvent = () => sun().get(row.epoch)
      const time = (epoch: number) => new Date(epoch).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
      const sunLabel = (event: SunEvent) => `${event.kind === 'rise' ? 'Zon op' : 'Zon onder'} ${time(event.epoch)}`
      const placeholder = () => pending() ? '…' : '—'
      const rainAmount = () => {
        const reading = rain()
        const text = reading?.toLocaleString('nl-NL', { maximumFractionDigits: reading < 1 ? 2 : 1 })
        return text === undefined || text === '0' ? undefined : text
      }
      const dew = () => temperature() == null || humidity() == null ? null : dewPoint(temperature()!, humidity()!)
      return <>
        <tr
          ref={(element) => {
            rowElements.set(row.epoch, element)
            onCleanup(() => rowElements.delete(row.epoch))
            if (row.kind === 'now') pinNow(element)
          }}
          classList={{ 'current-hour': row.kind === 'now', 'past-hour': row.kind === 'past', 'pending-hour': pending() }}
        >
          <td class="weather-cell">
            <div class="time-weather">
              <div class="time-label">
                <strong>{time(row.epoch)}</strong>
                <span classList={{ 'now-label': row.kind === 'now' }}>{row.kind === 'now' ? 'Nu' : new Date(row.epoch).toLocaleDateString('nl-NL', { weekday: 'short' })}</span>
                <Show when={props.sunForm === 'marker' && sunEvent()}>{(event) =>
                  <span class="sun-mark" title={sunLabel(event())}><SunGlyph />{time(event().epoch)}</span>
                }</Show>
              </div>
              <div class="weather-glyph">
                <Show when={props.columns.weather && icon()}>{(model) => <WeatherIcon model={model()} />}</Show>
                <Show when={rainAmount()}>{(amount) => <span class="rain-amount">{amount()}<small> mm/u</small></span>}</Show>
              </div>
            </div>
          </td>
          <Show when={props.columns.uv}>
            <td class="uv-cell">
              <Show when={uv() || elevation(row.epoch) <= 0} fallback={pending() ? '…' : ''}>
                <UvBar reading={elevation(row.epoch) > 0 ? uv() : null} variant={props.uvBar} scale={dailyClearSkyUvMax(row.epoch, props.location.lat)} />
              </Show>
            </td>
          </Show>
          <Show when={props.columns.temperature}><td class="temperature-cell" onPointerEnter={(event) => hover('temperature', event, true)} onPointerLeave={(event) => hover('temperature', event, false)}>{degrees(feelsLike())}<small class="air-temperature" title="Luchttemperatuur">{degrees(temperature())}</small></td></Show>
          <Show when={props.columns.humidity}><td class="humidity-cell">{humidity() == null ? placeholder() : `${Math.round(humidity()!)}%`}<Show when={props.humidityForm === 'dew-point' && dew() != null}>
            <small class="dew-point" classList={{ muggy: dew()! >= 16 }} title="Dauwpunt; vanaf 16° voelt het benauwd"><Droplet size={9} strokeWidth={2.5} aria-hidden="true" />{Math.round(dew()!)}°</small>
          </Show></td></Show>
          <Show when={props.columns.wind}><td class="wind-cell" onPointerEnter={(event) => hover('wind', event, true)} onPointerLeave={(event) => hover('wind', event, false)}><Show when={wind()} fallback={placeholder()}>{(summary) =>
            <WindReading summary={summary()} form={props.windForm} />
          }</Show></td></Show>
        </tr>
        <Show when={props.sunForm === 'row' && sunEvent()}>{(event) =>
          <tr class="sun-row" classList={{ 'past-hour': row.kind === 'past' }}>
            <td colSpan={columnCount()}><SunGlyph />{sunLabel(event())}</td>
          </tr>
        }</Show>
      </>
    }}</For>
    </tbody>
  </table>
}

// De pijl wijst waar de wind heen waait, zoals de deeltjes op de kaart; de letters blijven in de titel.
function WindReading(props: { summary: WindSummary; form: WindForm }) {
  const label = () => `Wind uit ${props.summary.direction}, ${props.summary.beaufort} Bft, ${props.summary.speed.toLocaleString('nl-NL', { maximumFractionDigits: 1 })} m/s`
  const turn = () => ({ transform: `rotate(${(props.summary.fromDegrees + 180) % 360}deg)` })
  return <Show when={props.form === 'dial'} fallback={
    <span class="wind-reading" role="img" aria-label={label()} title={label()}>
      <ArrowUp class="wind-arrow" size={15} strokeWidth={2.25} style={turn()} aria-hidden="true" />
      <b>{props.summary.beaufort}</b><small>Bft</small>
    </span>
  }>
    <span class="wind-reading wind-dial-reading" role="img" aria-label={label()} title={label()}>
      <span class="wind-dial" aria-hidden="true"><Navigation2 size={11} strokeWidth={0} fill="currentColor" style={turn()} /></span>
      <span class="wind-dial-text"><b>{props.summary.beaufort}</b><small>{props.summary.direction}</small></span>
    </span>
  </Show>
}

function SunGlyph() {
  return <svg class="sun-glyph" viewBox="0 4 20 8" aria-hidden="true">
    <path class="sun-glyph-horizon" d="M1 10.5h18" />
    <path class="sun-glyph-disc" d="M5 10.5a5 5 0 0 1 10 0Z" />
  </svg>
}
