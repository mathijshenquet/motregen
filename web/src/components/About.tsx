import { For, onCleanup, type JSX } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import { BUTTON_ICON, INLINE_ICON, Moon, Sun, SunMoon, X } from './icons'
import { backdropHandlers } from './modal'

export const REPOSITORY_URL = 'https://github.com/mathijshenquet/motregen'

/** Wacht zo lang met openen dat een dubbel-/triple-tap op het merk de dialog niet over de volgende taps legt. */
const SINGLE_TAP_DELAY_MS = 350
const TAP_WINDOW_MS = 700

const THEMES = ['light', 'system', 'dark'] as const
export type ThemeChoice = typeof THEMES[number]
const THEME_CHOICES: Record<ThemeChoice, { icon: typeof Sun; label: string }> = {
  light: { icon: Sun, label: 'Licht' },
  system: { icon: SunMoon, label: 'Systeem' },
  dark: { icon: Moon, label: 'Donker' },
}

interface Props {
  theme: ThemeChoice
  onTheme: (theme: ThemeChoice) => void
  onTripleTap: () => void
  /** Links in de bron-regel, bv. de temperatuurlegenda. */
  sourcePrefix?: JSX.Element
}

export default function About(props: Props) {
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
    <button ref={trigger} type="button" class="map-brand round-action" aria-haspopup="dialog" aria-label="Over motregen en instellingen" title="Over motregen en instellingen" onClick={tapBrand}>
      <img src="/droplet.svg" alt="" />
    </button>
    <div class="source">{props.sourcePrefix}<span>Bron: KNMI · Kaart: OpenFreeMap</span></div>
    <dialog
      ref={dialog}
      class="about-dialog"
      aria-labelledby="about-title"
      onClose={() => trigger.focus()}
      {...backdropHandlers(() => dialog)}
    >
      <div class="about-body">
        <header>
          <img src="/droplet.svg" alt="" />
          <h2 id="about-title">motregen.nl</h2>
          <button type="button" class="about-close" aria-label="Sluiten" onClick={close} autofocus><X {...BUTTON_ICON} /></button>
        </header>
        <section class="about-settings" aria-labelledby="about-theme-title">
          <h3 id="about-theme-title">Weergave</h3>
          <div class="segmented about-theme" role="group" aria-labelledby="about-theme-title">
            <For each={THEMES}>{(choice) => <button type="button" classList={{ active: props.theme === choice }} aria-pressed={props.theme === choice} onClick={() => props.onTheme(choice)}>
              <Dynamic component={THEME_CHOICES[choice].icon} {...INLINE_ICON} />{THEME_CHOICES[choice].label}
            </button>}</For>
          </div>
        </section>
        <p class="about-lead">Data rechtstreeks van het KNMI. Gratis, zonder reclame, open source.</p>
        <p>Eén tijdlijn, van de regen die viel tot de verwachting voor morgen:</p>
        <dl>
          <dt>Observatie</dt><dd>gemeten neerslag van de KNMI-radar, elke 5 minuten</dd>
          <dt>Voorspelling</dt><dd>eerste 2 uur de KNMI-nowcast (radar vooruitgerekend), daarna HARMONIE-AROME van het KNMI: regen, temperatuur, wind en bewolking</dd>
          <dt>UV</dt><dd>UV-index van het KNMI, inclusief bewolking</dd>
          <dt>Kaart</dt><dd><a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a>, kaartdata © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>-bijdragers</dd>
          <dt>Zoeken</dt><dd>PDOK Locatieserver (Nederland) en de geolocatiedienst van Digitaal Vlaanderen (België)</dd>
        </dl>
        <p>De kaart dekt Nederland en Vlaanderen: de KNMI-radar en HARMONIE reiken tot ver over de grens.</p>
        <p class="about-privacy">Geen tracking en geen advertenties. Je locatie en favorieten blijven in je eigen browser.</p>
        <a class="about-repo" href={REPOSITORY_URL} target="_blank" rel="noopener">Broncode op GitHub ↗</a>
      </div>
    </dialog>
  </>
}
