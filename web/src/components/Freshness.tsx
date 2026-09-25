import { createMemo, createSignal, For, onCleanup, Show } from 'solid-js'
import { Portal } from 'solid-js/web'
import type { Manifest, Source } from '../core/contract'
import { ageMs, expectedNextRadar, formatAge, formatAgeShort, formatClock, freshnessStatus, latestRadarEpoch, sourceFreshness, STATUS_LABELS, type RefreshState } from '../core/freshness'
import { sourceZone } from '../core/time-model'
import { BUTTON_ICON, X } from './icons'
import { backdropHandlers } from './modal'

interface Props {
  // Epoch shown on the map (scrubber position) and the frame's source and run.
  mapEpoch: number
  mapFrame?: { source: Source; run: string }
  manifest: Manifest | undefined
  refresh: RefreshState | undefined
  onRefresh: () => Promise<void>
}

const TICK_MS = 15_000

export default function Freshness(props: Props) {
  let dialog!: HTMLDialogElement
  let trigger!: HTMLButtonElement
  let opener: HTMLButtonElement | undefined
  const [clock, setClock] = createSignal(Date.now())
  const [refreshing, setRefreshing] = createSignal(false)
  const timer = window.setInterval(() => setClock(Date.now()), TICK_MS)
  onCleanup(() => window.clearInterval(timer))

  const time = (epoch: number) => new Date(epoch).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  const day = (epoch: number) => new Date(epoch).toLocaleDateString('nl-NL', { weekday: 'short' })
  const mapDay = () => day(props.mapEpoch) === day(clock()) ? '' : day(props.mapEpoch)
  const mapTime = () => props.mapFrame ? time(props.mapEpoch) : '––:––'
  const regime = createMemo(() => {
    const zone = sourceZone(props.mapFrame?.source ?? 'harmonie')
    return { kind: zone.kind, word: zone.label.toLowerCase() }
  })

  const radar = createMemo(() => props.manifest ? latestRadarEpoch(props.manifest) : undefined)
  const status = createMemo(() => freshnessStatus(radar(), clock(), props.refresh))
  const rows = createMemo(() => props.manifest ? sourceFreshness(props.manifest) : [])
  const radarAge = () => { const epoch = radar(); return epoch === undefined ? undefined : ageMs(epoch, clock()) }
  const summary = () => {
    const age = radarAge()
    return age === undefined ? 'Geen radar' : `Radar ${formatClock(radar()!, clock())}, ${formatAge(age)}`
  }
  const badgeLabel = () => {
    const age = radarAge()
    const ago = age === undefined ? '' : formatAgeShort(age)
    const detail = age === undefined ? 'geen radar' : `radar ${time(radar()!)}, ${status() === 'offline' ? 'verversen mislukt' : ago === 'zojuist' ? ago : `${ago} oud`}`
    return `Dataversheid: ${STATUS_LABELS[status()].toLowerCase()}, ${detail}`
  }

  // Het paneel opent gecentreerd onder de klok, binnen het venster gehouden.
  function openPanel(event: MouseEvent & { currentTarget: HTMLButtonElement }): void {
    opener = event.currentTarget
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

  // Een knop in een knop mag niet: de hele klok is één transparante knop eronder, de amber
  // versheidsknop ligt erbovenop. Beide openen het versheidspaneel.
  return <div class="map-clock" data-freshness={status()} data-source={regime().kind}>
    <button
      ref={trigger}
      type="button"
      class="freshness-trigger"
      aria-haspopup="dialog"
      aria-label={`Kaart ${mapTime()}${mapDay() ? ` ${mapDay()}` : ''}, ${regime().word}. ${STATUS_LABELS[status()]}: ${summary()}. Details over dataversheid`}
      title="Hoe vers is de data?"
      onClick={openPanel}
    />
    <span class="clock-main" aria-hidden="true">
      <Show when={mapDay()}><small class="clock-day">{mapDay()}</small></Show>
      <strong class="clock-map-time">{mapTime()}</strong>
    </span>
    <span class="clock-data">
      <span class="clock-source" aria-hidden="true">{regime().word}</span>
      <button type="button" class="freshness-badge" aria-haspopup="dialog" aria-label={badgeLabel()} title="Hoe vers is de data?" onClick={openPanel} />
    </span>
    {/* Alleen de statustekst is live: tikkende minuten worden niet voorgelezen. */}
    <span class="sr-only" aria-live="polite">{STATUS_LABELS[status()]}</span>
    {/* Buiten de kaartpil: die is pointer-events:none en stijlt small/strong. */}
    <Portal>
      <dialog
        ref={dialog}
        class="about-dialog freshness-dialog"
        aria-labelledby="freshness-title"
        onClose={() => (opener ?? trigger).focus()}
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
