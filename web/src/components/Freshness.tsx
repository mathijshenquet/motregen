import { createMemo, createSignal, For, onCleanup, Show } from 'solid-js'
import { Portal } from 'solid-js/web'
import type { Manifest } from '../core/contract'
import { ageMs, expectedNextRadar, formatAge, formatAgeShort, formatClock, freshnessStatus, latestRadarEpoch, sourceFreshness, STATUS_LABELS, type RefreshState } from '../core/freshness'
import { BUTTON_ICON, X } from './icons'
import { backdropHandlers } from './modal'

interface Props {
  // Epoch shown on the map (scrubber position) and the manifest's "now".
  mapEpoch: number
  now: number
  manifest: Manifest | undefined
  refresh: RefreshState | undefined
  onRefresh: () => Promise<void>
}

// Within half a radar frame of "now" the map shows the present.
const PRESENT_TOLERANCE_MS = 150_000
const TICK_MS = 15_000

export default function Freshness(props: Props) {
  let dialog!: HTMLDialogElement
  let trigger!: HTMLButtonElement
  const [clock, setClock] = createSignal(Date.now())
  const [refreshing, setRefreshing] = createSignal(false)
  const timer = window.setInterval(() => setClock(Date.now()), TICK_MS)
  onCleanup(() => window.clearInterval(timer))

  const time = (epoch: number) => new Date(epoch).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  const day = (epoch: number) => new Date(epoch).toLocaleDateString('nl-NL', { weekday: 'short' })
  const elsewhere = () => props.now > 0 && Math.abs(props.mapEpoch - props.now) > PRESENT_TOLERANCE_MS
  const mapDay = () => day(props.mapEpoch) === day(clock()) ? '' : ` · ${day(props.mapEpoch)}`

  const radar = createMemo(() => props.manifest ? latestRadarEpoch(props.manifest) : undefined)
  const status = createMemo(() => freshnessStatus(radar(), clock(), props.refresh))
  const rows = createMemo(() => props.manifest ? sourceFreshness(props.manifest) : [])
  const radarAge = () => { const epoch = radar(); return epoch === undefined ? undefined : ageMs(epoch, clock()) }
  const summary = () => {
    const age = radarAge()
    return age === undefined ? 'Geen radar' : `Radar ${formatClock(radar()!, clock())}, ${formatAge(age)}`
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
    <button
      ref={trigger}
      type="button"
      class="freshness-trigger"
      aria-haspopup="dialog"
      aria-label={`${STATUS_LABELS[status()]}: ${summary()}. Details over dataversheid`}
      title="Hoe vers is de data?"
      onClick={() => dialog.showModal()}
    >
      <i class="freshness-dot" aria-hidden="true" />
      <Show when={radarAge() !== undefined} fallback={<small>Geen radar</small>}>
        <span class="clock-stack">
          <strong>{time(radar()!)}</strong>
          <small>Radar · <span class="freshness-age">{status() === 'offline' ? 'offline' : formatAgeShort(radarAge()!)}</span></small>
        </span>
      </Show>
    </button>
    {/* Alleen de statustekst is live: tikkende minuten worden niet voorgelezen. */}
    <span class="sr-only" aria-live="polite">{STATUS_LABELS[status()]}</span>
    <Show when={elsewhere()}>
      <span class="map-clock-map" classList={{ future: props.mapEpoch > props.now }} title="Tijd van het kaartbeeld">
        <span class="clock-stack"><strong>{time(props.mapEpoch)}</strong><small>Kaart{mapDay()}</small></span>
      </span>
    </Show>
    {/* Buiten de kaartpil: die is pointer-events:none en stijlt small/strong. */}
    <Portal>
      <dialog
        ref={dialog}
        class="about-dialog freshness-dialog"
        aria-labelledby="freshness-title"
        onClose={() => trigger.focus()}
        {...backdropHandlers(() => dialog)}
      >
        <div class="about-body">
          <header>
            <i class="freshness-dot" data-status={status()} aria-hidden="true" />
            <h2 id="freshness-title">Hoe vers is de data?</h2>
            <button type="button" class="about-close" aria-label="Sluiten" onClick={() => dialog.close()} autofocus><X {...BUTTON_ICON} /></button>
          </header>
          <p class="freshness-lead" data-status={status()}>
            <strong>{STATUS_LABELS[status()]}</strong>
            {' · '}
            <Show when={status() === 'offline'} fallback={radarAge() === undefined ? 'geen radarmeting in de data' : `laatste radarmeting ${formatAge(radarAge()!)}`}>
              verversen mislukt om {time(props.refresh!.failedAt!)}; je ziet de laatst opgehaalde data
            </Show>
          </p>
          <Show when={status() === 'fresh' && radar() !== undefined}>
            <p class="freshness-cadence">
              Een radarbeeld komt elke 5 minuten, meestal 3 à 5 minuten na de meting.{' '}
              {expectedNextRadar(radar()!) > clock() ? `Het volgende verwachten we rond ${time(expectedNextRadar(radar()!))}.` : 'Het volgende is onderweg.'}
            </p>
          </Show>
          <dl class="freshness-sources">
            <For each={rows()}>{(row) => <>
              <dt>{row.label}</dt>
              <dd>
                <span>{row.kind === 'measured' ? 'meting' : 'run'} {formatClock(row.epoch, clock())}</span>
                <span class="freshness-row-age">{formatAge(ageMs(row.epoch, clock()))}</span>
                <small>{row.cadence}</small>
              </dd>
            </>}</For>
          </dl>
          <p class="freshness-meta">
            <Show when={props.manifest}>Gepubliceerd {formatClock(Date.parse(props.manifest!.generated), clock())}</Show>
            <Show when={props.refresh}>{' · '}gecontroleerd {time(props.refresh!.checkedAt)}</Show>
          </p>
          <button type="button" class="freshness-refresh" disabled={refreshing()} onClick={() => void refreshNow()}>
            {refreshing() ? 'Bezig met verversen…' : 'Nu verversen'}
          </button>
        </div>
      </dialog>
    </Portal>
  </div>
}
