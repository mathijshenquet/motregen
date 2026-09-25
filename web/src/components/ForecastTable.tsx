import { createEffect, createMemo, createSignal, For, onCleanup, Show } from 'solid-js'
import type { FocusKind } from '../core/focus-mode'
import type { HourlyForecastRow } from '../core/forecast'
import { solarElevationSin, sunEvents, type SunEvent } from '../core/solar'
import { dailyClearSkyUvMax, uvReading } from '../core/uv'
import { deriveWeatherIcon, summarizeWind, WIND_UNIT_LABELS, type WindSummary, type WindUnit } from '../core/weather'
import { ArrowUp, BUTTON_ICON, Clock, Cloud, CloudSun, Droplets, Thermometer, Wind } from './icons'
import UvBar from './UvBar'
import WeatherIcon from './WeatherIcon'

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
  gust: Array<number | null>
}

interface Props {
  rows: HourlyForecastRow[]
  series: ForecastSeries
  location: { lng: number; lat: number }
  /** `sky`: de kolom Lucht (U34) — bewolkingsglyph plus overdag de UV-balk; vervangt UV en Wolken. */
  columns: { weather: boolean; sky: boolean; temperature: boolean; humidity: boolean; wind: boolean }
  windUnit: WindUnit
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
  // De koppenrij is de modebalk: Gevoel en Wind zijn kaartmodes (hover/toetsenbordfocus tijdelijk,
  // klik pint), Weer is de standaard en zet een pin uit.
  focus: {
    pinned: FocusKind | undefined
    onTogglePin: (mode: FocusKind) => void
    onFocus: (mode: FocusKind, source: 'table' | 'keyboard', active: boolean) => void
  }
}

const hour = 3_600_000
const HOVER_LEAVE_MS = 80

export default function ForecastTable(props: Props) {
  // De hele kolom (kop én cellen) is het hoverdoel en kleurt mee (PO 2026-09-25 live, U34). Verlaten
  // wacht HOVER_LEAVE_MS: van cel naar cel (of over een zonrij) gaat de focus zo niet even uit.
  // Touch vuurt ook pointerenter; dat mag geen blijvende hover worden (tap op de kop toggelt).
  const [hovered, setHovered] = createSignal<FocusKind>()
  let leaveTimer: number | undefined
  onCleanup(() => window.clearTimeout(leaveTimer))
  const hover = (mode: FocusKind, event: PointerEvent, active: boolean) => {
    if (event.pointerType === 'touch') return
    window.clearTimeout(leaveTimer)
    if (active) {
      const previous = hovered()
      if (previous === mode) return
      if (previous) props.focus.onFocus(previous, 'table', false)
      setHovered(mode)
      props.focus.onFocus(mode, 'table', true)
      return
    }
    leaveTimer = window.setTimeout(() => {
      if (hovered() !== mode) return
      setHovered(undefined)
      props.focus.onFocus(mode, 'table', false)
    }, HOVER_LEAVE_MS)
  }
  const columnHover = (mode: FocusKind) => ({
    onPointerEnter: (event: PointerEvent) => hover(mode, event, true),
    onPointerLeave: (event: PointerEvent) => hover(mode, event, false),
  })
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

  const columnCount = () => 2 + Number(props.columns.sky) + Number(props.columns.temperature) +
    Number(props.columns.humidity) + Number(props.columns.wind)

  return <table class="forecast-table" data-mode={props.focus.pinned} data-hover={hovered()}>
    <thead><tr>
      <th class="weather-heading">
        <button type="button" class="column-mode default-mode" title="Standaardkaart: regen, wolken en zon" onClick={() => {
          const pinned = props.focus.pinned
          if (pinned) props.focus.onTogglePin(pinned)
        }}>
          <Show when={props.columns.weather} fallback={<ColumnLabel icon={Clock} text="Uur" />}><ColumnLabel icon={CloudSun} text="Weer" /></Show>
        </button>
      </th>
      <Show when={props.columns.sky}><th class="sky-heading" {...columnHover('clouds')}>
        <FocusHeading mode="clouds" icon={Cloud} label="Lucht" title="Bewolking en UV; toon de wolken op de kaart en de wolkenlagen in de grafiek" />
      </th></Show>
      <Show when={props.columns.temperature}><th class="temperature-heading" {...columnHover('temperature')}>
        <FocusHeading mode="temperature" icon={Thermometer} label="Gevoel" title="Toon temperatuurlijnen op de kaart" />
      </th></Show>
      <Show when={props.columns.humidity}><th title="Relatieve luchtvochtigheid"><span class="column-mode"><ColumnLabel icon={Droplets} text="RV" /></span></th></Show>
      <Show when={props.columns.wind}><th class="wind-heading" {...columnHover('wind')}>
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
      const wind = () => summarizeWind(value(props.series.windU, row.windUIndex), value(props.series.windV, row.windVIndex),
        value(props.series.gust, row.gustIndex), props.windUnit)
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
              </div>
              <div class="weather-glyph">
                <Show when={props.columns.weather && icon()}>{(model) => <WeatherIcon model={model()} />}</Show>
                <Show when={rainAmount()}>{(amount) => <span class="rain-amount">{amount()}<small> mm/u</small></span>}</Show>
              </div>
            </div>
          </td>
          <Show when={props.columns.sky}>
            <td class="sky-cell" {...columnHover('clouds')}>
              <span class="sky-reading">
                <CloudCoverGlyph percent={cloud()} />
                {/* 's Nachts is UV niet informatief: dan alleen de bewolking. */}
                <Show when={elevation(row.epoch) > 0}>
                  <Show when={uv()} fallback={pending() ? '…' : ''}>
                    <UvBar reading={uv()} scale={dailyClearSkyUvMax(row.epoch, props.location.lat)} />
                  </Show>
                </Show>
              </span>
            </td>
          </Show>
          <Show when={props.columns.temperature}><td class="temperature-cell" {...columnHover('temperature')}>{degrees(feelsLike())}<small class="air-temperature" title="Luchttemperatuur">{degrees(temperature())}</small></td></Show>
          <Show when={props.columns.humidity}><td>{humidity() == null ? placeholder() : `${Math.round(humidity()!)}%`}</td></Show>
          <Show when={props.columns.wind}><td class="wind-cell" {...columnHover('wind')}><Show when={wind()} fallback={placeholder()}>{(summary) =>
            <WindReading summary={summary()} />
          }</Show></td></Show>
        </tr>
        <Show when={sunEvent()}>{(event) =>
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
function WindReading(props: { summary: WindSummary }) {
  const unit = () => WIND_UNIT_LABELS[props.summary.unit]
  const label = () => `Wind uit ${props.summary.direction}, ${props.summary.value} ${unit()}` +
    (props.summary.gust == null ? '' : `, windstoten tot ${props.summary.gust} ${unit()}`)
  // "3 ⌇ 6 Bft": hoofdwaarde, vlaag met vlaagteken, één eenheid voor beide.
  return <span class="wind-reading" role="img" aria-label={label()} title={label()}>
    <ArrowUp class="wind-arrow" size={15} strokeWidth={2.25} style={{ transform: `rotate(${(props.summary.fromDegrees + 180) % 360}deg)` }} aria-hidden="true" />
    <b>{props.summary.value}</b>
    <Show when={props.summary.gust}>{(gust) => <small class="wind-gust">⌇ {gust()}</small>}</Show>
    <small class="wind-unit">{unit()}</small>
  </span>
}

/** Totale bewolking in vier stappen, als klassiek bedekkingsrondje: leeg, kwart, half, vol. */
export function cloudCoverStep(percent: number): { fill: number; label: string } {
  if (percent < 20) return { fill: 0, label: 'helder' }
  if (percent < 50) return { fill: 0.25, label: 'licht bewolkt' }
  if (percent < 80) return { fill: 0.5, label: 'half bewolkt' }
  return { fill: 1, label: 'bewolkt' }
}

function CloudCoverGlyph(props: { percent: number | null }) {
  const step = () => props.percent == null ? undefined : cloudCoverStep(props.percent)
  // Taartpunt vanaf 12 uur met de klok mee; vol is een hele cirkel.
  const wedge = (fill: number) => {
    const angle = fill * 2 * Math.PI
    const x = 7 + 5.5 * Math.sin(angle)
    const y = 7 - 5.5 * Math.cos(angle)
    return `M7 7V1.5A5.5 5.5 0 ${fill > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)}Z`
  }
  return <Show when={step()}>{(current) =>
    <svg class="cloud-cover-glyph" viewBox="0 0 14 14" role="img" aria-label={`Bewolking ${Math.round(props.percent!)} %, ${current().label}`}>
      <title>{`Bewolking ${Math.round(props.percent!)} % · ${current().label}`}</title>
      <Show when={current().fill >= 1} fallback={<Show when={current().fill > 0}><path class="cloud-cover-fill" d={wedge(current().fill)} /></Show>}>
        <circle class="cloud-cover-fill" cx="7" cy="7" r="5.5" />
      </Show>
      <circle class="cloud-cover-ring" cx="7" cy="7" r="5.5" />
    </svg>
  }</Show>
}

function SunGlyph() {
  return <svg class="sun-glyph" viewBox="0 4 20 8" aria-hidden="true">
    <path class="sun-glyph-horizon" d="M1 10.5h18" />
    <path class="sun-glyph-disc" d="M5 10.5a5 5 0 0 1 10 0Z" />
  </svg>
}
