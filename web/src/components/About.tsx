import { createSignal, lazy, onCleanup, Show, type JSX } from 'solid-js'
import type { WindUnit } from '../core/weather'

const AboutDialog = lazy(() => import('./AboutDialog'))

export const REPOSITORY_URL = 'https://github.com/mathijshenquet/motregen'

/** Wacht zo lang met openen dat een dubbel-/triple-tap op het merk de dialog niet over de volgende taps legt. */
const SINGLE_TAP_DELAY_MS = 350
const TAP_WINDOW_MS = 700

export type ThemeChoice = 'light' | 'system' | 'dark'

export interface AboutProps {
  theme: ThemeChoice
  onTheme: (theme: ThemeChoice) => void
  expressive?: boolean
  onExpressive?: (enabled: boolean) => void
  windUnit: WindUnit
  onWindUnit: (unit: WindUnit) => void
  onOpen?: () => void
  onShare?: () => void
  shareNotice?: string
  onTripleTap: () => void
  /** Links in de bron-regel, bv. de temperatuurlegenda. */
  sourcePrefix?: JSX.Element
}

export default function About(props: AboutProps) {
  const [opened, setOpened] = createSignal(false)
  let trigger!: HTMLButtonElement
  let tapCount = 0
  let lastTap = -Infinity
  let pendingOpen: number | undefined
  onCleanup(() => window.clearTimeout(pendingOpen))

  function open(): void { setOpened(true) }

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
    <div class="source">{props.sourcePrefix}<span>Bron: KNMI · © OpenStreetMap</span></div>
    <Show when={opened()}><AboutDialog {...props} onClose={() => { setOpened(false); trigger.focus() }} /></Show>
  </>
}
