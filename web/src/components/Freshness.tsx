import { createMemo, createSignal, For, onCleanup, Show } from 'solid-js'
import { Portal } from 'solid-js/web'
import type { Manifest, Source } from '../core/contract'
import { ageMs, expectedNext, formatAge, formatAgeShort, formatClock, freshnessStatus, latestRadarEpoch, sourceFreshness, STATUS_LABELS, type RefreshState } from '../core/freshness'
import { sourceZone } from '../core/time-model'
import { BUTTON_ICON, INLINE_ICON, Play, X } from './icons'
import { backdropHandlers } from './modal'

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
}

const TICK_MS = 15_000
const CLOSE_FALLBACK_MS = 600

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

  const time = (epoch: number) => new Date(epoch).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  const day = (epoch: number) => new Date(epoch).toLocaleDateString('nl-NL', { weekday: 'short' })
  const mapDay = () => day(props.mapEpoch) === day(clock()) ? '' : day(props.mapEpoch)
  const mapTime = () => props.mapFrame ? time(props.mapEpoch) : '––:––'
  // Alleen voor de schermlezer; zichtbaar scheidt de nu-lijn observatie van verwachting.
  const regime = () => sourceZone(props.mapFrame?.source ?? 'harmonie').label.toLowerCase()

  const radar = createMemo(() => props.manifest ? latestRadarEpoch(props.manifest) : undefined)
  const status = createMemo(() => freshnessStatus(radar(), clock(), props.refresh))
  const rows = createMemo(() => props.manifest ? sourceFreshness(props.manifest) : [])
  const radarAge = () => { const epoch = radar(); return epoch === undefined ? undefined : ageMs(epoch, clock()) }
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
    <Show when={props.paused}>
      <button type="button" class="clock-play" aria-label="Afspelen" title="Afspelen" onClick={() => props.onPlay?.()}><Play {...INLINE_ICON} fill="currentColor" /></button>
    </Show>
    <button
      ref={trigger}
      type="button"
      class="freshness-trigger"
      aria-haspopup="dialog"
      aria-label={`Kaart ${mapTime()}${mapDay() ? ` ${mapDay()}` : ''}, ${regime()}. ${STATUS_LABELS[status()]}: ${summary()}. Details over dataversheid`}
      title="Hoe actueel is de data?"
      onClick={openPanel}
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
        onClose={() => { stopSeconds(); props.onClose?.(); trigger.focus() }}
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
