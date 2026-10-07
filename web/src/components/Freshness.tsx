import { createMemo, createSignal, For, onCleanup, Show } from 'solid-js'
import { Portal } from 'solid-js/web'
import { CLOCK_JOG_MS_PER_PX, clockKeyCursor, jogCursor, sourceStrip, STRIP_ZONES, stripEpochAtPosition, stripPositionAtEpoch, type ClockJogScale, type SourceStripZone } from '../core/clock-timeline'
import type { Manifest, Source, TimelineFrame } from '../core/contract'
import { ageMs, expectedNext, formatAge, formatAgeShort, formatClock, freshnessStatus, latestRadarEpoch, sourceFreshness, STATUS_LABELS, type RefreshState } from '../core/freshness'
import { SCRUBBER_VIEW_HOURS, sourceZone, timelineCursorAtEpoch, timelineEpochAtCursor } from '../core/time-model'
import { BUTTON_ICON, INLINE_ICON, Play, X } from './icons'
import { backdropHandlers } from './modal'
import { formatTime, formatWeekdayShort } from '../core/locale'

interface Props {
  // Epoch shown on the map (scrubber position) and the frame's source and run.
  mapEpoch: number
  mapFrame?: { source: Source; run: string }
  manifest: Manifest | undefined
  refresh: RefreshState | undefined
  onRefresh: () => Promise<void>
  onOpen?: () => void
  onClose?: () => void
  /** Bewust gepauzeerd (spatie): de klok toont ▶ om verder te spelen (PO 2026-09-25 live). */
  paused?: boolean
  onPlay?: () => void
  onPause?: () => void
  /** Tijdlijn en cursor van de scrubber: slepen op de klok en tikken in de strook verzetten de tijd (U56). */
  timeline?: TimelineFrame[]
  cursor?: number
  onCursor?: (cursor: number) => void
  jogScale?: ClockJogScale
}

const TICK_MS = 15_000
const CLOSE_FALLBACK_MS = 600
// Gelijk aan de scrubber: tot zoveel px is het een tik, en na een sleep hervat afspelen na zoveel rust.
const TAP_SLOP_PX = 4
const RESUME_IDLE_MS = 1_000
const HOUR_MS = 3_600_000

// Leeftijd als tikkend label (PO 2026-09-25 live): zichtbaar dat hij meeloopt met de klok.
function LiveAge(props: { ms: number; short?: boolean; title?: string }) {
  return <span class="live-age" title={props.title}><i aria-hidden="true" />{props.short ? formatAgeShort(props.ms) : formatAge(props.ms)}</span>
}

export default function Freshness(props: Props) {
  let dialog!: HTMLDialogElement
  let trigger!: HTMLButtonElement
  const [clock, setClock] = createSignal(Date.now())
  const [refreshing, setRefreshing] = createSignal(false)
  const timer = window.setInterval(() => setClock(Date.now()), TICK_MS)
  onCleanup(() => window.clearInterval(timer))
  // Secondeklok alleen zolang het paneel open is, voor "n seconden geleden" bij de laatste check.
  const [second, setSecond] = createSignal(Date.now())
  let secondTimer: number | undefined
  const stopSeconds = () => { if (secondTimer !== undefined) window.clearInterval(secondTimer); secondTimer = undefined }
  onCleanup(stopSeconds)
  const checkedAgo = (epoch: number) => {
    const seconds = Math.max(0, Math.floor((second() - epoch) / 1_000))
    return seconds < 60 ? `${seconds} ${seconds === 1 ? 'seconde' : 'seconden'} geleden` : formatAge(seconds * 1_000)
  }

  const time = formatTime
  const day = formatWeekdayShort
  const mapDay = () => day(props.mapEpoch) === day(clock()) ? '' : day(props.mapEpoch)
  const mapTime = () => props.mapFrame ? time(props.mapEpoch) : '––:––'
  // Alleen voor de schermlezer; zichtbaar scheidt de nu-lijn observatie van verwachting.
  const regime = () => sourceZone(props.mapFrame?.source ?? 'harmonie').label.toLowerCase()

  const radar = createMemo(() => props.manifest ? latestRadarEpoch(props.manifest) : undefined)
  const status = createMemo(() => freshnessStatus(radar(), clock(), props.refresh))
  const rows = createMemo(() => props.manifest ? sourceFreshness(props.manifest) : [])
  const radarAge = () => { const epoch = radar(); return epoch === undefined ? undefined : ageMs(epoch, clock()) }

  const frames = () => props.timeline ?? []
  const lastCursor = () => Math.max(0, frames().length - 1)
  const sliderValue = createMemo(() => Math.round(props.cursor ?? 0))
  let jog: { startX: number; startEpoch: number; msPerPx: number; moved: boolean } | undefined
  let swallowClick = false
  let resumeTimer: number | undefined
  // Onze eigen korte pauze tijdens slepen; de ▶ blijft dan weg, anders verspringt de pil onder de vinger.
  const [jogPaused, setJogPaused] = createSignal(false)
  const [jogging, setJogging] = createSignal(false)
  onCleanup(() => window.clearTimeout(resumeTimer))

  function jogMsPerPx(): number {
    if (props.jogScale !== 'scrubber') return CLOCK_JOG_MS_PER_PX
    const plotWidth = document.querySelector('.scrub-surface .chart-plot')?.clientWidth
    return plotWidth ? SCRUBBER_VIEW_HOURS * HOUR_MS / plotWidth : CLOCK_JOG_MS_PER_PX
  }

  function pauseForJog(): void {
    window.clearTimeout(resumeTimer)
    if (jogPaused() || props.paused) return
    setJogPaused(true)
    props.onPause?.()
  }

  function resumeAfterJog(): void {
    window.clearTimeout(resumeTimer)
    if (!jogPaused()) return
    resumeTimer = window.setTimeout(endJogPause, RESUME_IDLE_MS)
  }

  function endJogPause(): void {
    window.clearTimeout(resumeTimer)
    if (!jogPaused()) return
    setJogPaused(false)
    props.onPlay?.()
  }

  function jogStart(event: PointerEvent & { currentTarget: HTMLButtonElement }): void {
    if (event.button !== 0 || !frames().length || !props.onCursor) return
    jog = { startX: event.clientX, startEpoch: timelineEpochAtCursor(frames(), props.cursor ?? 0), msPerPx: jogMsPerPx(), moved: false }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function jogMove(event: PointerEvent): void {
    if (!jog) return
    const deltaPx = event.clientX - jog.startX
    if (!jog.moved) {
      if (Math.abs(deltaPx) <= TAP_SLOP_PX) return
      jog.moved = true
      setJogging(true)
      pauseForJog()
    }
    props.onCursor?.(jogCursor(frames(), jog.startEpoch, deltaPx, jog.msPerPx))
  }

  function jogEnd(event: PointerEvent & { currentTarget: HTMLButtonElement }): void {
    if (!jog) return
    const dragged = jog.moved
    jog = undefined
    setJogging(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
    if (!dragged) return
    resumeAfterJog()
    if (event.type !== 'pointerup') return
    // De klik die op het loslaten volgt mag het paneel niet openen; komt er geen (touch), dan vervalt dit.
    swallowClick = true
    window.setTimeout(() => { swallowClick = false }, 0)
  }
  function triggerClick(): void {
    if (swallowClick) { swallowClick = false; return }
    openPanel()
  }

  function triggerKeyDown(event: KeyboardEvent): void {
    if (event.key === ' ') {
      // Spatie is afspelen/pauzeren zoals op de scrubber; Enter opent het paneel.
      event.preventDefault()
      if (jogPaused()) endJogPause()
      else if (props.paused) props.onPlay?.()
      else props.onPause?.()
      return
    }
    if (!frames().length || !props.onCursor) return
    const next = clockKeyCursor(event.key, props.cursor ?? 0, lastCursor())
    if (next === undefined) return
    event.preventDefault()
    props.onCursor(next)
  }

  const [panelOpen, setPanelOpen] = createSignal(false)
  const strip = createMemo(() => panelOpen() ? sourceStrip(frames()) : [])
  const zoneAge = (zone: SourceStripZone) => {
    const sources = STRIP_ZONES.find((candidate) => candidate.key === zone.key)!.sources
    const row = sources.map((source) => rows().find((candidate) => candidate.source === source)).find((candidate) => candidate !== undefined)
    return row && { ms: ageMs(row.epoch, clock()), title: `${row.kind === 'measured' ? 'laatste meting' : 'laatste run'} ${formatClock(row.epoch, clock())}` }
  }
  const nowPosition = () => props.manifest ? stripPositionAtEpoch(strip(), Date.parse(props.manifest.now)) : undefined

  function jumpInStrip(event: MouseEvent & { currentTarget: HTMLDivElement }): void {
    const bounds = event.currentTarget.getBoundingClientRect()
    if (!bounds.width || !strip().length) return
    const epoch = stripEpochAtPosition(strip(), (event.clientX - bounds.left) / bounds.width * 100)
    props.onCursor?.(timelineCursorAtEpoch(frames(), epoch))
  }
  const summary = () => {
    const age = radarAge()
    return age === undefined ? 'Geen radar' : `Radar ${formatClock(radar()!, clock())}, ${formatAge(age)}`
  }

  // PO 2026-09-25 live (U34): het paneel is de klokpil die als een vel papier naar beneden uitrolt. Het
  // begint op de plek en in de vorm van de pil (clip-path) en houdt de klok bovenin op dezelfde plek.
  function openPanel(): void {
    const pill = trigger.parentElement!.getBoundingClientRect()
    const margin = 16
    const width = Math.min(760, window.innerWidth - 2 * margin)
    const center = Math.min(Math.max(pill.left + pill.width / 2, margin + width / 2), window.innerWidth - margin - width / 2)
    const left = Math.round(center - width / 2)
    dialog.style.setProperty('--panel-left', `${left}px`)
    dialog.style.setProperty('--panel-top', `${Math.max(0, Math.round(pill.top))}px`)
    dialog.style.setProperty('--clock-left', `${Math.max(0, Math.round(pill.left - left))}px`)
    dialog.style.setProperty('--clock-right', `${Math.max(0, Math.round(left + width - pill.right))}px`)
    dialog.style.setProperty('--clock-height', `${Math.round(pill.height)}px`)
    dialog.style.setProperty('--clock-center', `${Math.round(pill.left + pill.width / 2 - left)}px`)
    // Loopt de korte sleeppauze nog, dan eerst hervatten: het paneel onthoudt zelf of er werd afgespeeld.
    endJogPause()
    setPanelOpen(true)
    setSecond(Date.now())
    stopSeconds()
    secondTimer = window.setInterval(() => setSecond(Date.now()), 1_000)
    dialog.showModal()
    props.onOpen?.()
  }

  // Sluiten rolt het papier terug op naar de pil (dezelfde animatie achterstevoren) en sluit daarna pas.
  function closePanel(): void {
    if (!dialog.open || dialog.classList.contains('closing')) return
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) { dialog.close(); return }
    dialog.classList.add('closing')
    let done = false
    const finish = () => {
      if (done) return
      done = true
      dialog.classList.remove('closing')
      dialog.close()
    }
    dialog.addEventListener('animationend', finish, { once: true })
    // Vangnet als er geen animationend komt (bijv. animaties uit in de browser).
    window.setTimeout(finish, CLOSE_FALLBACK_MS)
  }

  async function refreshNow(): Promise<void> {
    if (refreshing()) return
    setRefreshing(true)
    try {
      await props.onRefresh()
    } finally {
      setRefreshing(false)
      setClock(Date.now())
    }
  }

  return <div class="map-clock" data-freshness={status()}>
    <Show when={props.paused && !jogPaused()}>
      <button type="button" class="clock-play" aria-label="Afspelen" title="Afspelen" onClick={() => props.onPlay?.()}><Play {...INLINE_ICON} fill="currentColor" /></button>
    </Show>
    <button
      ref={trigger}
      type="button"
      class="freshness-trigger"
      classList={{ jogging: jogging() }}
      role="slider"
      aria-haspopup="dialog"
      aria-label={`Kaart ${mapTime()}${mapDay() ? ` ${mapDay()}` : ''}, ${regime()}. ${STATUS_LABELS[status()]}: ${summary()}. Details over dataversheid`}
      aria-valuemin={0}
      aria-valuemax={lastCursor()}
      aria-valuenow={sliderValue()}
      aria-valuetext={`${mapTime()}${mapDay() ? ` ${mapDay()}` : ''}`}
      title="Sleep om de tijd te verzetten · tik voor de dataversheid"
      onClick={triggerClick}
      onKeyDown={triggerKeyDown}
      // Een knop klikt op het loslaten van de spatie; die is hier afspelen/pauzeren.
      onKeyUp={(event) => { if (event.key === ' ') event.preventDefault() }}
      onPointerDown={jogStart}
      onPointerMove={jogMove}
      onPointerUp={jogEnd}
      onPointerCancel={jogEnd}
    >
      {/* PO 2026-09-25: geen groene stip; alleen bij achterlopen/verouderd een stip links van de tijd en de leeftijd eronder. */}
      <span class="clock-main">
        <Show when={status() !== 'fresh'}><i class="freshness-dot" aria-hidden="true" /></Show>
        <strong class="clock-map-time">{mapTime()}</strong>
        <Show when={mapDay()}><small class="clock-day">{mapDay()}</small></Show>
      </span>
      <Show when={status() !== 'fresh'}>
        <small class="clock-age">{status() === 'offline' ? 'offline' : radarAge() === undefined ? 'geen radar' : `${formatAgeShort(radarAge()!)} oud`}</small>
      </Show>
    </button>
    {/* Alleen de statustekst is live: tikkende minuten worden niet voorgelezen. */}
    <span class="sr-only" aria-live="polite">{STATUS_LABELS[status()]}</span>
    {/* Buiten de kaartpil: die is pointer-events:none en stijlt small/strong. */}
    <Portal>
      <dialog
        ref={dialog}
        class="about-dialog freshness-dialog"
        aria-labelledby="freshness-title"
        onClose={() => { stopSeconds(); setPanelOpen(false); props.onClose?.(); trigger.focus() }}
        onCancel={(event) => { event.preventDefault(); closePanel() }}
        {...backdropHandlers(() => dialog, closePanel)}
      >
        {/* Nog eens op de klok klikken rolt het papier weer op; grijs = de tijd staat stil. */}
        <div class="freshness-clock">
          <button type="button" class="clock-main" aria-label="Sluiten" title="Sluiten" onClick={closePanel}>
            <strong class="clock-map-time">{mapTime()}</strong>
            <Show when={mapDay()}><small class="clock-day">{mapDay()}</small></Show>
          </button>
        </div>
        <div class="about-body">
          <header>
            <i class="freshness-dot" data-status={status()} aria-hidden="true" />
            <h2 id="freshness-title">Hoe actueel is de data?</h2>
            <button type="button" class="about-close" aria-label="Sluiten" onClick={closePanel} autofocus><X {...BUTTON_ICON} /></button>
          </header>
          <p class="freshness-lead" data-status={status()}>
            <strong>{STATUS_LABELS[status()]}</strong>
            {' · '}
            <Show when={status() === 'offline'} fallback={radarAge() === undefined ? 'geen radarmeting in de data' : <>laatste radarmeting <LiveAge ms={radarAge()!} /></>}>
              verversen mislukt om {time(props.refresh!.failedAt!)}; je ziet de laatst opgehaalde data
            </Show>
          </p>
          <Show when={strip().length}>
            {/* Tik springt naar dat moment; met het toetsenbord verzet de klok zelf de tijd. */}
            <div class="freshness-strip" data-testid="freshness-strip" title="Tik om naar dat moment te gaan" onClick={jumpInStrip}>
              <div class="freshness-strip-zones">
                <For each={strip()}>{(zone) => <div class="freshness-strip-zone" data-zone={zone.key} data-kind={zone.kind} style={{ width: `${zone.end - zone.start}%` }}>
                  <i aria-hidden="true" />
                  <span>{zone.label}</span>
                  <Show when={zoneAge(zone)}>{(age) => <small title={age().title}>{formatAgeShort(age().ms)}</small>}</Show>
                </div>}</For>
              </div>
              <Show when={nowPosition() !== undefined}><i class="freshness-strip-now" style={{ left: `${nowPosition()}%` }} aria-hidden="true"><b>Nu</b></i></Show>
              <i class="freshness-strip-marker" style={{ left: `${stripPositionAtEpoch(strip(), props.mapEpoch)}%` }} aria-hidden="true" />
            </div>
          </Show>
          <div class="freshness-table-scroll">
            <table class="freshness-sources">
              <thead><tr><th>Data</th><th>Bron</th><th>Uitleg</th><th>Frequentie</th><th>Volgende data</th></tr></thead>
              <tbody>
                <For each={rows()}>{(row) => <tr>
                  <th scope="row"><span>{row.label}</span><LiveAge ms={ageMs(row.epoch, clock())} short title={`${row.kind === 'measured' ? 'meting' : 'run'} ${formatClock(row.epoch, clock())}`} /></th>
                  <td>{row.provider}</td>
                  <td class="freshness-explanation">{row.explanation}</td>
                  <td>{row.cadence}</td>
                  <td>{expectedNext(row) > clock() ? `± ${time(expectedNext(row))}` : 'onderweg'}</td>
                </tr>}</For>
              </tbody>
            </table>
          </div>
          <footer class="freshness-footer">
            <span class="freshness-meta"><Show when={props.refresh}>Laatste check {time(props.refresh!.checkedAt)} · {checkedAgo(props.refresh!.checkedAt)}</Show></span>
            <button type="button" class="freshness-refresh" disabled={refreshing()} onClick={() => void refreshNow()}>
              {refreshing() ? 'Bezig met verversen…' : 'Nu verversen'}
            </button>
          </footer>
        </div>
      </dialog>
    </Portal>
  </div>
}
