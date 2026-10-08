import { createEffect, createMemo, createSignal, createUniqueId, For, onCleanup, onMount, Show } from 'solid-js'
import { lightDarkness } from '../core/cloud-section'
import type { FocusKind } from '../core/focus-mode'
import type { HourlyForecastRow } from '../core/forecast'
import { moonHorizonAngle, moonLitPath, moonPhase } from '../core/moon'
import { isSunUp, solarElevationSin, sunEvents, type SunEvent } from '../core/solar'
import { cloudModification, dailyClearSkyUvMax, uvReading } from '../core/uv'
import { deriveWeatherIcon, summarizeWind, WIND_UNIT_LABELS, type WindSummary, type WindUnit } from '../core/weather'
import { ArrowUp, BUTTON_ICON, Clock, CloudRain, CloudSun, Table2, Thermometer, Wind } from './icons'
import UvBar from './UvBar'
import WeatherIcon from './WeatherIcon'
import { measurePerfPhase } from '../core/perf'
import { formatTime, formatWeekdayShort } from '../core/locale'
import { sameFields } from '../core/stable'

export interface ForecastSeries {
  rain: Array<number | null>
  uv: Array<number | null>
  uvClear: Array<number | null>
  radiation: Array<number | null>
  temperature: Array<number | null>
  feelsLike: Array<number | null>
  cloud: Array<number | null>
  windU: Array<number | null>
  windV: Array<number | null>
  gust: Array<number | null>
}

interface Props {
  onMountTable?: (element: HTMLTableElement) => void
  rows: HourlyForecastRow[]
  series: ForecastSeries
  location: { lng: number; lat: number }
  columns: { weather: boolean; air: boolean; temperature: boolean; wind: boolean }
  windUnit: WindUnit
  dayNight?: boolean
  // Rows after this epoch have not been fetched yet; scrolling near them asks for them.
  loadedUntil: number
  // Desktop (inline) keeps history above now; portrait mobile reveals it when table mode opens.
  // Other touch layouts keep the explicit foldout.
  historyInline: boolean
  historyOpen: boolean
  historyLoaded: boolean
  onNeedRows: () => void
  /** Uren van de rijen die nu in de viewport staan; alleen gezet op apparaten die per zichtbare rij laden. */
  onVisibleRows?: (epochs: number[]) => void
  onNeedHistory: () => void
  onOpenHistory: () => void
  /** Klik op een rij: de scrubber springt naar dat uur (U34). */
  onSelectTime?: (epoch: number) => void
  /** Portrait-mobiel gebruikt de eerste kop als wissel tussen kaart en tabel. */
  mobileTableOpen?: boolean
  onOpenMobileTable?: () => void
  onSelectMobileMode?: () => void
  // De koppenrij is de modebalk: hover/toetsenbordfocus is tijdelijk, klikken pint één modus.
  focus: {
    pinned: FocusKind
    onPin: (mode: FocusKind) => void
    onFocus: (mode: FocusKind, source: 'table' | 'keyboard', active: boolean) => void
  }
}

const hour = 3_600_000
const HOVER_LEAVE_MS = 80
// De piep volgt de cursor met een vloeiende scroll; rijen die daarbij alleen langsschuiven tellen niet als
// zichtbaar en worden dus niet gedecodeerd.
const SHOWN_ROWS_REST_MS = 200

export default function ForecastTable(props: Props) {
  const tableMemo = <T,>(name: string, compute: () => T) => createMemo(() => measurePerfPhase('table-render', compute, { memo: name }))
  // De hele kolom (kop én cellen) is het hoverdoel en kleurt mee (PO 2026-09-25 live, U34). Verlaten
  // wacht HOVER_LEAVE_MS: van cel naar cel (of over een zonrij) gaat de focus zo niet even uit.
  // Touch vuurt ook pointerenter; dat mag geen blijvende hover worden (tap op de kop toggelt).
  const [hovered, setHovered] = createSignal<FocusKind>()
  let leaveTimer: number | undefined
  onCleanup(() => window.clearTimeout(leaveTimer))
  const hover = (mode: FocusKind, event: PointerEvent, active: boolean) => {
    if (event.pointerType === 'touch') {
      window.clearTimeout(leaveTimer)
      const previous = hovered()
      if (previous) props.focus.onFocus(previous, 'table', false)
      setHovered(undefined)
      return
    }
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
    aria-pressed={!props.mobileTableOpen && props.focus.pinned === heading.mode}
    title={heading.title}
    onClick={() => {
      props.focus.onPin(heading.mode)
      props.onSelectMobileMode?.()
    }}
    onFocus={(event) => { if (event.currentTarget.matches(':focus-visible')) props.focus.onFocus(heading.mode, 'keyboard', true) }}
    onBlur={() => props.focus.onFocus(heading.mode, 'keyboard', false)}
  ><ColumnLabel icon={heading.icon} text={heading.label} /></button>
  const sun = tableMemo('zonmomenten', () => {
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
  const rowEpochs = new WeakMap<Element, number>()
  const shownEpochs = new Set<number>()
  const reportShown = props.onVisibleRows
  let shownTimer: number | undefined
  const shownObserver = !reportShown || typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const epoch = rowEpochs.get(entry.target)
      if (epoch === undefined) continue
      if (entry.intersectionRatio >= 0.5) shownEpochs.add(epoch)
      else shownEpochs.delete(epoch)
    }
    window.clearTimeout(shownTimer)
    shownTimer = window.setTimeout(() => reportShown([...shownEpochs]), SHOWN_ROWS_REST_MS)
  // Half in beeld telt; een randje van de volgende rij is geen reden om zes velden te decoderen.
  }, { threshold: 0.5 })
  const pastCount = () => props.rows.filter((row) => row.kind === 'past').length
  const visibleRows = tableMemo('zichtbare-rijen', () => props.historyInline || props.historyOpen || props.onOpenMobileTable ? props.rows : props.rows.filter((row) => row.kind !== 'past'))
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
    shownObserver?.disconnect()
    window.clearTimeout(shownTimer)
  })

  const columnCount = () => 1 + Number(props.columns.weather) + Number(props.columns.air) + Number(props.columns.temperature) + Number(props.columns.wind)

  let table!: HTMLTableElement
  onMount(() => props.onMountTable?.(table))
  return <table ref={table} class="forecast-table" classList={{ 'day-night-table': props.dayNight !== false }} data-mode={props.focus.pinned} data-hover={hovered()}>
    <thead><tr>
      {/* Weer is de vaste standaardmodus: regen op de kaart en in de grafiek. */}
      <th class="time-heading"><Show when={props.onOpenMobileTable} fallback={<span class="column-mode"><ColumnLabel icon={Clock} text="Uur" /></span>}>
        <button
          type="button"
          class="column-mode column-focus table-focus"
          title="Toon de tabel"
          aria-pressed={Boolean(props.mobileTableOpen)}
          onClick={(event) => {
            event.stopPropagation()
            if (props.mobileTableOpen) props.onSelectMobileMode?.()
            else props.onOpenMobileTable?.()
          }}
        >
          <ColumnLabel icon={Table2} text="Tabel" />
        </button>
      </Show></th>
      <Show when={props.columns.weather}><th class="weather-heading" {...columnHover('weather')}>
        <FocusHeading mode="weather" icon={CloudRain} label="Weer" title="Toon regen op de kaart en in de grafiek" />
      </th></Show>
      <Show when={props.columns.air}><th class="air-heading" {...columnHover('air')}>
        <FocusHeading mode="air" icon={CloudSun} label="Lucht" title="Toon bewolking op de kaart en de wolkenlagen in de grafiek" />
      </th></Show>
      <Show when={props.columns.temperature}><th class="temperature-heading" {...columnHover('temperature')}>
        <FocusHeading mode="temperature" icon={Thermometer} label="Gevoel" title="Toon temperatuurlijnen op de kaart" />
      </th></Show>
      <Show when={props.columns.wind}><th class="wind-heading" {...columnHover('wind')}>
        <FocusHeading mode="wind" icon={Wind} label="Wind" title="Toon de wind op de kaart op volle sterkte" />
      </th></Show>
    </tr></thead>
    <tbody>
    <For each={visibleRows()}>{(row, rowIndex) => {
      const pending = () => row.epoch > props.loadedUntil || (row.kind === 'past' && !props.historyLoaded)
      const value = (series: Array<number | null>, index: number | null) => index == null ? null : series[index] ?? null
      // De reeksen komen in delen binnen en elke aanvulling is een nieuwe array. Een cel mag alleen opnieuw
      // tekenen als zijn eigen waarde verandert (telefoonopname 2026-10-07: ~1,5 s Solid-DOM-werk in 30 s).
      const rain = createMemo(() => value(props.series.rain, row.rainIndex))
      const cloud = createMemo(() => value(props.series.cloud, row.cloudIndex))
      const feelsLike = createMemo(() => value(props.series.feelsLike, row.feelsLikeIndex))
      const temperature = createMemo(() => value(props.series.temperature, row.temperatureIndex))
      const degrees = (reading: number | null) => reading == null ? placeholder() : `${Math.round(reading)}°`
      const wind = createMemo(() => summarizeWind(value(props.series.windU, row.windUIndex), value(props.series.windV, row.windVIndex),
        value(props.series.gust, row.gustIndex), props.windUnit), undefined, { equals: sameFields })
      const sunEvent = () => sun().get(row.epoch)
      const daylight = createMemo(() => sunEvent()?.kind === 'set' || (sunEvent() === undefined && isSunUp(row.epoch, props.location.lng, props.location.lat)))
      const radiationBefore = createMemo(() => value(props.series.radiation, row.radiationIndex))
      const radiationAfter = createMemo(() => value(props.series.radiation, row.radiationNextIndex))
      const darknessFor = (target: HourlyForecastRow) => {
        const cover = value(props.series.cloud, target.cloudIndex)
        // U47 gebruikt CMF op een perceptuele schaal; zonder straling volgt 100% bewolking 25% licht.
        const fallbackLight = cover == null ? 1 : 1 - 0.75 * Math.max(0, Math.min(1, cover / 100))
        return lightDarkness(cloudModification(target.epoch,
          value(props.series.radiation, target.radiationIndex),
          value(props.series.radiation, target.radiationNextIndex), elevation) ?? fallbackLight)
      }
      const dayDarkness = createMemo(() => darknessFor(row))
      const nextDayDarkness = createMemo(() => {
        const next = visibleRows()[rowIndex() + 1]
        if (!next || !isSunUp(next.epoch, props.location.lng, props.location.lat)) return dayDarkness()
        return darknessFor(next)
      })
      const icon = createMemo(() => deriveWeatherIcon(rain(), cloud(), daylight()), undefined, { equals: sameFields })
      const uv = createMemo(() => uvReading(row.epoch, value(props.series.uv, row.uvIndex), value(props.series.uvClear, row.uvClearIndex),
        radiationBefore(), radiationAfter(), elevation, row.kind !== 'past'), undefined, { equals: sameFields })
      const time = formatTime
      const sunLabel = (event: SunEvent) => `${event.kind === 'rise' ? 'Zon op' : 'Zon onder'} ${time(event.epoch)}`
      const placeholder = () => pending() ? '…' : '—'
      const rainAmount = createMemo(() => {
        const reading = rain()
        const text = reading?.toLocaleString('nl-NL', { maximumFractionDigits: reading < 1 ? 2 : 1 })
        return text === undefined || text === '0' ? undefined : text
      })
      return <>
        <tr
          data-epoch={row.epoch}
          data-day-overcast={daylight() ? dayDarkness().toFixed(3) : undefined}
          style={{
            '--day-overcast': dayDarkness().toFixed(3),
            '--day-overcast-next': nextDayDarkness().toFixed(3),
          }}
          ref={(element) => {
            rowElements.set(row.epoch, element)
            rowEpochs.set(element, row.epoch)
            shownObserver?.observe(element)
            onCleanup(() => {
              rowElements.delete(row.epoch)
              shownObserver?.unobserve(element)
              shownEpochs.delete(row.epoch)
            })
            if (row.kind === 'now') pinNow(element)
          }}
          classList={{
            'day-hour': daylight(),
            'night-hour': !daylight(),
            'current-hour': row.kind === 'now',
            'past-hour': row.kind === 'past',
            'pending-hour': pending(),
            'before-sun-row': !!sunEvent(),
            'before-sunrise': sunEvent()?.kind === 'rise',
            'before-sunset': sunEvent()?.kind === 'set',
          }}
          onClick={() => props.onSelectTime?.(row.epoch)}
        >
          <td class="time-cell">
            <button
              type="button"
              class="time-label"
              title={props.mobileTableOpen ? 'Toon dit uur op de kaart' : 'Naar dit uur in de grafiek'}
              onClick={(event) => {
                event.stopPropagation()
                props.onSelectTime?.(row.epoch)
                if (props.mobileTableOpen) props.onSelectMobileMode?.()
              }}
            >
              <strong>{time(row.epoch)}</strong>
              <span classList={{ 'now-label': row.kind === 'now' }}>{row.kind === 'now' ? 'Nu' : formatWeekdayShort(row.epoch)}</span>
            </button>
          </td>
          <Show when={props.columns.weather}>
            <td class="weather-cell" {...columnHover('weather')}>
              <div class="weather-glyph">
                <Show when={icon()}>{(model) => <WeatherIcon model={model()} />}</Show>
                <Show when={rainAmount()}>{(amount) => <span class="rain-amount">{amount()}<small> mm/u</small></span>}</Show>
              </div>
            </td>
          </Show>
          <Show when={props.columns.air}>
            <td class="air-cell" {...columnHover('air')}>
              <Show when={daylight()} fallback={<MoonReading epoch={row.epoch} longitude={props.location.lng} latitude={props.location.lat} />}>
                <Show when={uv()} fallback={<span class="air-uv-placeholder">{placeholder()}</span>}>
                  <UvBar reading={uv()} scale={dailyClearSkyUvMax(row.epoch, props.location.lat)} />
                </Show>
              </Show>
            </td>
          </Show>
          <Show when={props.columns.temperature}><td class="temperature-cell" {...columnHover('temperature')}>{degrees(feelsLike())}<small class="air-temperature" title="Luchttemperatuur">{degrees(temperature())}</small></td></Show>
          <Show when={props.columns.wind}><td class="wind-cell" {...columnHover('wind')}><Show when={wind()} fallback={placeholder()}>{(summary) =>
            <WindReading summary={summary()} />
          }</Show></td></Show>
        </tr>
        <Show when={!props.historyInline && !props.onOpenMobileTable && row.kind === 'now' && pastCount() > 0}>
          <tr class="history-toggle-row">
            <td colSpan={columnCount()}>
              <button type="button" class="history-toggle" aria-expanded={props.historyOpen} onClick={() => props.onOpenHistory()}>
                {props.historyOpen ? 'Afgelopen uren verbergen' : `Afgelopen ${pastCount()} uur tonen`}
              </button>
            </td>
          </tr>
        </Show>
        <Show when={sunEvent()}>{(event) =>
          <tr class="sun-row" classList={{ 'past-hour': row.kind === 'past', 'sunrise-row': event().kind === 'rise', 'sunset-row': event().kind === 'set' }}>
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

function MoonReading(props: { epoch: number; longitude: number; latitude: number }) {
  const moon = () => moonPhase(props.epoch)
  const angle = () => Math.round(moonHorizonAngle(props.epoch, props.longitude, props.latitude))
  const horizon = () => angle() >= 0 ? `${angle()} graden boven de horizon` : `${Math.abs(angle())} graden onder de horizon`
  const text = () => `${moon().label}, ${Math.round(moon().illumination * 100)} % verlicht, ${horizon()}`
  return <span class="moon-reading" role="img" aria-label={text()} title={text()}>
    <MoonGlyph phase={moon().phase} illumination={moon().illumination} />
    <span class="moon-meta"><small>{Math.round(moon().illumination * 100)}%</small><small class="moon-angle"><span aria-hidden="true">∠</span>{angle()}°</small></span>
  </span>
}

/** NASA's volle-maantextuur onder onze berekende terminator, met aardschijn en een zachte gloed. */
function MoonGlyph(props: { phase: number; illumination: number }) {
  const id = createUniqueId()
  const lit = () => moonLitPath(props.phase, 8, 8, 6.7)
  return <svg class="moon-glyph" viewBox="0 0 16 16" aria-hidden="true">
    <defs>
      <radialGradient id={`${id}-night`} cx="45%" cy="40%" r="70%">
        <stop offset="0" class="moon-night-core" /><stop offset="1" class="moon-night-edge" />
      </radialGradient>
      <clipPath id={`${id}-disc`}><circle cx="8" cy="8" r="6.7" /></clipPath>
      <clipPath id={`${id}-litclip`}><path d={lit()} /></clipPath>
      <filter id={`${id}-glow`} x="-60%" y="-60%" width="220%" height="220%"><feGaussianBlur stdDeviation="1.1" /></filter>
    </defs>
    <circle class="moon-glow" cx="8" cy="8" r="6.7" filter={`url(#${id}-glow)`} opacity={(0.18 + 0.48 * props.illumination).toFixed(2)} />
    <circle cx="8" cy="8" r="6.7" fill={`url(#${id}-night)`} />
    <image class="moon-earthshine" href="/moon@2x.png" x="1.3" y="1.3" width="13.4" height="13.4" clip-path={`url(#${id}-disc)`} />
    <image class="moon-texture" href="/moon@2x.png" x="1.3" y="1.3" width="13.4" height="13.4" clip-path={`url(#${id}-litclip)`} />
    <circle class="moon-rim" cx="8" cy="8" r="6.7" />
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
