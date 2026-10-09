import { For, onMount } from 'solid-js'
import { Dynamic } from 'solid-js/web'
import { brandName } from '../core/page-meta'
import { WIND_UNITS, type WindUnit } from '../core/weather'
import { BUTTON_ICON, INLINE_ICON, Moon, Palette, Share2, Sun, SunMoon, X } from './icons'
import { backdropHandlers } from './modal'
import { REPOSITORY_URL, type AboutProps, type ThemeChoice } from './About'

const THEMES = ['light', 'system', 'dark'] as const
const THEME_CHOICES: Record<ThemeChoice, { icon: typeof Sun; label: string }> = {
  light: { icon: Sun, label: 'Licht' },
  system: { icon: SunMoon, label: 'Systeem' },
  dark: { icon: Moon, label: 'Donker' },
}
const WIND_UNIT_CHOICES: Record<WindUnit, string> = { bft: 'Bft', kn: 'knopen', kmh: 'km/u', ms: 'm/s' }
interface Props extends Omit<AboutProps, 'onTripleTap' | 'sourcePrefix'> {
  onClose: () => void
}

export default function AboutDialog(props: Props) {
  let dialog!: HTMLDialogElement
  onMount(() => {
    dialog.showModal()
    props.onOpen?.()
  })
  function close(): void {
    dialog.close()
  }
  return <dialog
      ref={dialog}
      class="about-dialog"
      aria-labelledby="about-title"
      onClose={props.onClose}
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
          <div class="segmented about-theme about-wind-unit" role="group" aria-label="Eenheid van de wind">
            <For each={WIND_UNITS}>{(unit) => <button type="button" classList={{ active: props.windUnit === unit }} aria-pressed={props.windUnit === unit} onClick={() => props.onWindUnit(unit)}>
              {WIND_UNIT_CHOICES[unit]}
            </button>}</For>
          </div>
          <button
            type="button"
            class="about-expressive"
            aria-pressed={props.expressive !== false}
            onClick={() => props.onExpressive?.(props.expressive === false)}
          >
            <Palette {...INLINE_ICON} />
            <span><b>Expressief</b><small>Hemel in de grafiek, dag en nacht in de tabel</small></span>
            <i aria-hidden="true">{props.expressive === false ? 'Uit' : 'Aan'}</i>
          </button>
        </section>
        <header>
          <img src="/droplet.svg" alt="" />
          <h2 id="about-title">{brandName}</h2>
        </header>
        <p class="about-lead">Regenradar en weersverwachting</p>
        <div class="about-share"><button type="button" onClick={() => void props.onShare?.()}><Share2 {...INLINE_ICON} />Deel deze stand</button><span aria-live="polite">{props.shareNotice}</span></div>
        <dl>
          <dt>Observatie</dt><dd>KNMI-radar, elke 5 min · NL en Vlaanderen</dd>
          <dt>Voorspelling</dt><dd>KNMI-nowcast (2 uur), dan HARMONIE-AROME</dd>
          <dt>UV</dt><dd>UV-index van het KNMI, met bewolking</dd>
          <dt>Maan</dt><dd>Textuur: <a href="https://svs.gsfc.nasa.gov/5587/" target="_blank" rel="noopener">NASA Scientific Visualization Studio</a></dd>
          <dt>Kaart</dt><dd>© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a></dd>
          <dt>Zoeken</dt><dd>PDOK (NL) · Digitaal Vlaanderen (BE)</dd>
          <dt>Privacy</dt><dd>Geen tracking, geen advertenties. Anoniem geteld: sessies en gebruikte functies, zonder IP of identificatie; locatie en favorieten blijven in je browser</dd>
          <dt>Telegram</dt><dd>De bot bewaart chat-id’s alleen tijdens verzoeken in het geheugen; er worden geen persoonsgegevens op schijf opgeslagen.</dd>
          <dt>Broncode</dt><dd><a href={REPOSITORY_URL} target="_blank" rel="noopener">GitHub ↗</a></dd>
        </dl>
      </div>
    </dialog>
}
