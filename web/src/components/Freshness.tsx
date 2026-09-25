import { createMemo, createSignal, For, onCleanup, Show } from 'solid-js'
import { Portal } from 'solid-js/web'
import type { Manifest, Source } from '../core/contract'
import { ageMs, expectedNextRadar, formatAge, formatAgeShort, formatClock, freshnessStatus, latestRadarEpoch, sourceFreshness, STATUS_LABELS, type RefreshState } from '../core/freshness'
import { BUTTON_ICON, X } from './icons'
import { backdropHandlers } from './modal'

interface Props {
  // Epoch shown on the map (scrubber position) and the frame's source and run.
  mapEpoch: number
  mapFrame?: { source: Source; run: string }
  manifest: Manifest | undefined
  refresh: RefreshState | undefined
  onRefresh: () => Promise<void>
  // PO-smaaktest U21: bronaccent als gekleurde linkerrand (default) of als stip voor de tijd.
  accent?: 'dot' | 'edge'
}

const TICK_MS = 15_000

// Zelfde regimes en kleuren als de balk onder het histogram.
function mapRegime(source: Source | undefined): { kind: 'observations' | 'nowcast' | 'model'; word: string } {
  if (source === 'rtcor') return { kind: 'observations', word: 'radar' }
  if (source === 'nowcast') return { kind: 'nowcast', word: 'nowcast' }
  return { kind: 'model', word: 'model' }
}

export default function Freshness(props: Props) {
  let dialog!: HTMLDialogElement
  let trigger!: HTMLButtonElement
  const [clock, setClock] = createSignal(Date.now())
  const [refreshing, setRefreshing] = createSignal(false)
  const timer = window.setInterval(() => setClock(Date.now()), TICK_MS)
  onCleanup(() => window.clearInterval(timer))

  const time = (epoch: number) => new Date(epoch).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  const day = (epoch: number) => new Date(epoch).toLocaleDateString('nl-NL', { weekday: 'short' })
  const mapDay = () => day(props.mapEpoch) === day(clock()) ? '' : ` · ${day(props.mapEpoch)}`
  const mapTime = () => props.mapFrame ? time(props.mapEpoch) : '––:––'
  const regime = createMemo(() => mapRegime(props.mapFrame?.source))

  const radar = createMemo(() => props.manifest ? latestRadarEpoch(props.manifest) : undefined)
  const status = createMemo(() => freshnessStatus(radar(), clock(), props.refresh))
  const rows = createMemo(() => props.manifest ? sourceFreshness(props.manifest) : [])
  const radarAge = () => { const epoch = radar(); return epoch === undefined ? undefined : ageMs(epoch, clock()) }
  const summary = () => {
    const age = radarAge()
    return age === undefined ? 'Geen radar' : `Radar ${formatClock(radar()!, clock())}, ${formatAge(age)}`
  }

  // Het paneel opent gecentreerd onder de pil, binnen het venster gehouden.
  function openPanel(): void {
    const pill = trigger.parentElement!.getBoundingClientRect()
    const margin = 16
    const width = Math.min(420, window.innerWidth - 2 * margin)
    const center = Math.min(Math.max(pill.left + pill.width / 2, margin + width / 2), window.innerWidth - margin - width / 2)
    // Pil (bijna) uit beeld gescrold: dan bovenaan het venster.
    const below = Math.round(pill.bottom + 8)
    const top = below < margin || below > window.innerHeight * 0.6 ? margin : below
    dialog.style.setProperty('--panel-left', `${Math.round(center - width / 2)}px`)
    dialog.style.setProperty('--panel-top', `${top}px`)
    dialog.showModal()
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

  // Onder de kaarttijd: wanneer de getoonde data is. Radar en nowcast hangen aan de laatste
  // radarscan (met leeftijd); modelbeelden aan hun run.
  return <div class="map-clock" classList={{ 'accent-dot': props.accent === 'dot' }} data-freshness={status()} data-source={regime().kind}>
    <button
      ref={trigger}
      type="button"
      class="freshness-trigger"
      aria-haspopup="dialog"
      aria-label={`Kaart ${mapTime()}${mapDay()}, ${regime().word}. ${STATUS_LABELS[status()]}: ${summary()}. Details over dataversheid`}
      title="Hoe vers is de data?"
      onClick={openPanel}
    >
      <span class="clock-main">
        <i class="clock-source-dot" aria-hidden="true" />
        <strong class="clock-map-time">{mapTime()}</strong>
        <small class="clock-source">{regime().word}{mapDay()}</small>
      </span>
      <span class="clock-data">
        <i class="freshness-dot" aria-hidden="true" />
        <Show when={regime().kind !== 'model' || !props.mapFrame} fallback={<span class="freshness-run">run {time(Date.parse(props.mapFrame!.run))}</span>}>
          <Show when={radarAge() !== undefined} fallback={<span>geen radar</span>}>
            <span class="freshness-scan">radar {time(radar()!)}</span>{' · '}<span class="freshness-age">{status() === 'offline' ? 'offline' : formatAgeShort(radarAge()!)}</span>
          </Show>
        </Show>
      </span>
    </button>
    {/* Alleen de statustekst is live: tikkende minuten worden niet voorgelezen. */}
    <span class="sr-only" aria-live="polite">{STATUS_LABELS[status()]}</span>
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
