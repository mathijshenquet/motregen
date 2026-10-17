/**
 * Een nieuwe versie wacht niet meer op de knop (PO 2026-10-17: "nieuwe sessies blijven nu de oude pagina gebruiken
 * tot je de knop klikt"). Ze gaat in op een veilig moment: meteen als de pagina net open is en nog niet aangeraakt,
 * anders zodra hij naar de achtergrond gaat. Nooit midden in schuiven of afspelen; de knop blijft voor wie niet wil
 * wachten.
 */
export const FRESH_START_MS = 10_000

export interface UpdatePage {
  now: () => number
  hidden: () => boolean
  touched: () => boolean
  onHidden: (listener: () => void) => void
}

export function applyUpdateWhenSafe(apply: () => void, page: UpdatePage): void {
  if (page.hidden() || (page.now() < FRESH_START_MS && !page.touched())) {
    apply()
    return
  }
  page.onHidden(apply)
}

/** Moet vroeg geïnstalleerd worden: een update die binnenkomt moet weten of er al iets aangeraakt is. */
export function browserUpdatePage(target: Window = window, document: Document = target.document): UpdatePage {
  let touched = false
  const touch = () => { touched = true }
  for (const type of ['pointerdown', 'keydown', 'wheel'] as const) target.addEventListener(type, touch, { capture: true, once: true, passive: true })
  return {
    now: () => target.performance.now(),
    hidden: () => document.visibilityState === 'hidden',
    touched: () => touched,
    onHidden(listener) {
      const changed = () => {
        if (document.visibilityState !== 'hidden') return
        document.removeEventListener('visibilitychange', changed)
        listener()
      }
      document.addEventListener('visibilitychange', changed)
    },
  }
}
