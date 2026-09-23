import { onCleanup } from 'solid-js'
import { BUTTON_ICON, INLINE_ICON, Info, X } from './icons'

export const REPOSITORY_URL = 'https://github.com/mathijshenquet/motregen'

/** Wacht zo lang met openen dat een dubbel-/triple-tap op het merk de dialog niet over de volgende taps legt. */
const SINGLE_TAP_DELAY_MS = 350
const TAP_WINDOW_MS = 700

export default function About(props: { onTripleTap: () => void }) {
  let dialog!: HTMLDialogElement
  let trigger!: HTMLButtonElement
  let tapCount = 0
  let lastTap = -Infinity
  let pendingOpen: number | undefined
  onCleanup(() => window.clearTimeout(pendingOpen))

  function open(): void {
    dialog.showModal()
  }

  function close(): void {
    dialog.close()
  }

  function tapBrand(event: MouseEvent): void {
    window.clearTimeout(pendingOpen)
    // Toetsenbordactivatie (detail 0) is nooit een tapreeks.
    if (event.detail === 0) { open(); return }
    const now = performance.now()
    tapCount = now - lastTap <= TAP_WINDOW_MS ? tapCount + 1 : 1
    lastTap = now
    if (tapCount === 1) pendingOpen = window.setTimeout(open, SINGLE_TAP_DELAY_MS)
    if (tapCount === 3) {
      tapCount = 0
      props.onTripleTap()
    }
  }

  return <>
    <button ref={trigger} type="button" class="map-brand brand" aria-haspopup="dialog" aria-label="Over motregen" title="Over motregen" onClick={tapBrand}>
      <img src="/droplet.svg" alt="" /><strong>motregen.nl</strong><Info {...INLINE_ICON} />
    </button>
    <div class="source"><span>Bron: KNMI · Kaart: OpenFreeMap</span></div>
    <dialog
      ref={dialog}
      class="about-dialog"
      aria-labelledby="about-title"
      onClose={() => trigger.focus()}
      onClick={(event) => { if (event.target === dialog) close() }}
    >
      <div class="about-body">
        <header>
          <img src="/droplet.svg" alt="" />
          <h2 id="about-title">Over motregen</h2>
          <button type="button" class="about-close" aria-label="Sluiten" onClick={close} autofocus><X {...BUTTON_ICON} /></button>
        </header>
        <p class="about-lead">Data rechtstreeks van het KNMI. Gratis, zonder reclame, open source.</p>
        <p>Eén tijdlijn, van de regen die viel tot de verwachting voor morgen:</p>
        <dl>
          <dt>Radar</dt><dd>gemeten neerslag van de KNMI-radar, elke 5 minuten</dd>
          <dt>Nowcast</dt><dd>KNMI-neerslagverwachting voor de komende 2 uur</dd>
          <dt>Model</dt><dd>HARMONIE-AROME van het KNMI: regen, temperatuur, wind en bewolking</dd>
          <dt>UV</dt><dd>UV-index van het KNMI, inclusief bewolking</dd>
          <dt>Kaart</dt><dd><a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>, kaartdata © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-bijdragers</dd>
        </dl>
        <p class="about-privacy">Geen tracking en geen advertenties. Je locatie en favorieten blijven in je eigen browser.</p>
        <a class="about-repo" href={REPOSITORY_URL} target="_blank" rel="noopener">Broncode op GitHub ↗</a>
      </div>
    </dialog>
  </>
}
