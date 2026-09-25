import { createEffect, createMemo, createSignal, createUniqueId, For, onCleanup, Show } from 'solid-js'
import type { FocusKind } from '../core/focus-mode'
import type { HourlyForecastRow } from '../core/forecast'
import { moonLitPath, moonPhase } from '../core/moon'
import { solarElevationSin, sunEvents, type SunEvent } from '../core/solar'
import { dailyClearSkyUvMax, uvReading } from '../core/uv'
import { deriveWeatherIcon, summarizeWind, WIND_UNIT_LABELS, type WindSummary, type WindUnit } from '../core/weather'
import { ArrowUp, BUTTON_ICON, Clock, CloudSun, Droplets, Sun, Thermometer, Wind } from './icons'
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
  columns: { weather: boolean; uv: boolean; temperature: boolean; humidity: boolean; wind: boolean }
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
  /** Klik op een rij: de scrubber springt naar dat uur (U34). */
  onSelectTime?: (epoch: number) => void
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

  const columnCount = () => 2 + Number(props.columns.weather) + Number(props.columns.uv) + Number(props.columns.temperature) +
    Number(props.columns.humidity) + Number(props.columns.wind)

  return <table class="forecast-table" data-mode={props.focus.pinned} data-hover={hovered()}>
    <thead><tr>
      {/* Weer is de wolkenmodus (PO 2026-09-25 live, U34): bewolkingssluier op de kaart en de wolkenlagen
          in de grafiek; nog eens klikken op de gepinde kop geeft de standaardweergave. */}
      {/* Tijd weer als eigen kolom (PO 2026-09-25 live); een klik op een rij springt de scrubber erheen. */}
      <th class="time-heading"><span class="column-mode"><ColumnLabel icon={Clock} text="Uur" /></span></th>
      <Show when={props.columns.weather}><th class="weather-heading" {...columnHover('clouds')}>
        <FocusHeading mode="clouds" icon={CloudSun} label="Weer" title="Toon de bewolking op de kaart en de wolkenlagen in de grafiek" />
      </th></Show>
      <Show when={props.columns.uv}><th class="uv-heading" title="UV-index met en zonder wolken">
        <span class="column-mode"><ColumnLabel icon={Sun} text="UV" /></span>
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
          onClick={() => props.onSelectTime?.(row.epoch)}
        >
          <td class="time-cell">
            <button type="button" class="time-label" title="Naar dit uur in de grafiek" onClick={(event) => { event.stopPropagation(); props.onSelectTime?.(row.epoch) }}>
              <strong>{time(row.epoch)}</strong>
              <span classList={{ 'now-label': row.kind === 'now' }}>{row.kind === 'now' ? 'Nu' : new Date(row.epoch).toLocaleDateString('nl-NL', { weekday: 'short' })}</span>
            </button>
          </td>
          <Show when={props.columns.weather}>
            <td class="weather-cell" {...columnHover('clouds')}>
              <div class="weather-glyph">
                <Show when={icon()}>{(model) => <WeatherIcon model={model()} />}</Show>
                <Show when={rainAmount()}>{(amount) => <span class="rain-amount">{amount()}<small> mm/u</small></span>}</Show>
              </div>
            </td>
          </Show>
          <Show when={props.columns.uv}>
            <td class="uv-cell">
              {/* Overdag de zon (UV), 's nachts de maan (PO 2026-09-25 live, U34). */}
              <Show when={elevation(row.epoch) > 0} fallback={<MoonReading epoch={row.epoch} />}>
                <Show when={uv()} fallback={pending() ? '…' : ''}>
                  <UvBar reading={uv()} scale={dailyClearSkyUvMax(row.epoch, props.location.lat)} />
                </Show>
              </Show>
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

function MoonReading(props: { epoch: number }) {
  const moon = () => moonPhase(props.epoch)
  const text = () => `${moon().label}, ${Math.round(moon().illumination * 100)} % verlicht`
  return <span class="moon-reading" role="img" aria-label={text()} title={text()}>
    <MoonGlyph phase={moon().phase} illumination={moon().illumination} />
    <small>{Math.round(moon().illumination * 100)}%</small>
  </span>
}

/** Maantje met verloop, zachte schemergrens, vage maria, aardschijn en een gloed die met de fase meegroeit. */
function MoonGlyph(props: { phase: number; illumination: number }) {
  const id = createUniqueId()
  const lit = () => moonLitPath(props.phase, 8, 8, 6.2)
  return <svg class="moon-glyph" viewBox="0 0 16 16" aria-hidden="true">
    <defs>
      <radialGradient id={`${id}-lit`} cx="42%" cy="38%" r="68%">
        <stop offset="0" stop-color="#fffbea" /><stop offset=".65" stop-color="#efe3b8" /><stop offset="1" stop-color="#cdbf92" />
      </radialGradient>
      <radialGradient id={`${id}-night`} cx="45%" cy="40%" r="70%">
        <stop offset="0" class="moon-night-core" /><stop offset="1" class="moon-night-edge" />
      </radialGradient>
      <clipPath id={`${id}-disc`}><circle cx="8" cy="8" r="6.2" /></clipPath>
      <clipPath id={`${id}-litclip`}><path d={lit()} /></clipPath>
      <filter id={`${id}-soft`} x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation=".4" /></filter>
      <filter id={`${id}-glow`} x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="1.3" /></filter>
    </defs>
    <circle class="moon-glow" cx="8" cy="8" r="6.2" filter={`url(#${id}-glow)`} opacity={(0.15 + 0.45 * props.illumination).toFixed(2)} />
    <circle cx="8" cy="8" r="6.2" fill={`url(#${id}-night)`} />
    <g clip-path={`url(#${id}-disc)`}>
      <path d={lit()} fill={`url(#${id}-lit)`} filter={`url(#${id}-soft)`} />
      <g class="moon-maria" clip-path={`url(#${id}-litclip)`}>
        <ellipse cx="6.2" cy="6.4" rx="2" ry="1.4" /><ellipse cx="9.8" cy="5.6" rx="1.3" ry="1" />
        <ellipse cx="9.2" cy="9.6" rx="1.8" ry="1.2" /><ellipse cx="5.9" cy="10.1" rx="1" ry=".8" />
      </g>
    </g>
  </svg>
}

function SunGlyph() {
  // Halve zon op de horizon met stralen (PO 2026-09-25 live).
  return <svg class="sun-glyph" viewBox="0 2 20 10" aria-hidden="true">
    <path class="sun-glyph-rays" d="M4.74 9.08L2.86 8.40M6.79 6.41L5.64 4.77M10.00 5.40L10.00 3.40M13.21 6.41L14.36 4.77M15.26 9.08L17.14 8.40" />
    <path class="sun-glyph-horizon" d="M1 11h18" />
    <path class="sun-glyph-disc" d="M6 11a4 4 0 0 1 8 0Z" />
  </svg>
}
