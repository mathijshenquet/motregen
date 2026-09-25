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
  onOpen?: () => void
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
    props.onOpen?.()
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
        <button type="button" class="about-close" aria-label="Sluiten" onClick={close} autofocus><X {...BUTTON_ICON} /></button>
        <section class="about-settings" aria-labelledby="about-theme-title">
          <h3 id="about-theme-title">Weergave</h3>
          <div class="segmented about-theme" role="group" aria-labelledby="about-theme-title">
            <For each={THEMES}>{(choice) => <button type="button" classList={{ active: props.theme === choice }} aria-pressed={props.theme === choice} onClick={() => props.onTheme(choice)}>
              <Dynamic component={THEME_CHOICES[choice].icon} {...INLINE_ICON} />{THEME_CHOICES[choice].label}
            </button>}</For>
          </div>
        </section>
        <header>
          <img src="/droplet.svg" alt="" />
          <h2 id="about-title">motregen.nl</h2>
        </header>
        <p class="about-lead">Rechtstreeks van het KNMI<br />Gratis en zonder reclame</p>
        <dl>
          <dt>Observatie</dt><dd>KNMI-radar, elke 5 min · NL en Vlaanderen</dd>
          <dt>Voorspelling</dt><dd>KNMI-nowcast (2 uur), dan HARMONIE-AROME</dd>
          <dt>UV</dt><dd>UV-index van het KNMI, met bewolking</dd>
          <dt>Kaart</dt><dd><a href="https://openfreemap.org" target="_blank" rel="noopener">OpenFreeMap</a> · © <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a></dd>
          <dt>Zoeken</dt><dd>PDOK (NL) · Digitaal Vlaanderen (BE)</dd>
          <dt>Privacy</dt><dd>Anoniem geteld: sessies en gebruikte functies, zonder IP of identificatie; locatie en favorieten blijven in je browser</dd>
          <dt>Broncode</dt><dd><a href={REPOSITORY_URL} target="_blank" rel="noopener">GitHub ↗</a></dd>
        </dl>
      </div>
    </dialog>
  </>
}
