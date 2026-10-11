export interface RainPresentation {
  opacity: number
  /** 1 = het palet zoals het is; lager is grijzer bij gelijke helderheid. */
  saturation: number
  /** 1 = het palet zoals het is; lager is donkerder bij gelijke tint. */
  brightness: number
  /** De regen vermenigvuldigt met wat eronder ligt in plaats van eroverheen te liggen (alleen op een lichte kaart). */
  multiply: boolean
}

// Hoe regen in Wind en Lucht terugtreedt. `huidig` is het product (PO 2026-10-08, U62). De overige standen zijn de
// U77-proef onder ?dev › Regen (vervalt 2026-10-17): sinds Weer met echte alfa-over en een drempel tekent, geeft
// schakelen naar Wind of Lucht overdag een sprong naar fletse buien met een witte zoom. De proefstanden tekenen de
// regen daar met dezelfde menging als Weer en verschillen alleen in hoe hij terugtreedt.
export const FOCUS_RAIN_VARIANTS = ['huidig', 'als-weer', 'gedempt', 'vermenigvuldigd'] as const
export type FocusRainVariant = typeof FOCUS_RAIN_VARIANTS[number]
export const DEFAULT_FOCUS_RAIN_VARIANT: FocusRainVariant = 'huidig'
export const FOCUS_RAIN_VARIANT_STORAGE_KEY = 'motregen-dev-regen-wind-lucht'

/** Of de regen in Wind en Lucht de menging van Weer gebruikt (echte alfa-over) in plaats van die van vóór U77. */
export function focusRainUsesWeatherBlend(variant: FocusRainVariant): boolean {
  return variant !== 'huidig'
}

export function loadFocusRainVariant(storage: Pick<Storage, 'getItem'> = localStorage): FocusRainVariant {
  const stored = storage.getItem(FOCUS_RAIN_VARIANT_STORAGE_KEY) as FocusRainVariant
  return FOCUS_RAIN_VARIANTS.includes(stored) ? stored : DEFAULT_FOCUS_RAIN_VARIANT
}

interface PresentationInput {
  temperatureFocus: number
  windFocus: number
  airFocus: number
  night: boolean
  /** Weggelaten = het product. */
  variant?: FocusRainVariant
}

/**
 * Hoe de regen getekend wordt bij deze focuswaarden (PO 2026-10-08, U62: "beide veel beter"). Regen verdwijnt
 * bij temperatuurfocus. In Wind en in Lucht treedt hij terug zonder te verbleken: dimmen via alfa mengt met de
 * lichte kaart en maakt geel crème.
 * - Wind overdag: vermenigvuldigd met de kaart op 0,9; geel blijft geel maar rustiger.
 * - Lucht overdag: vermenigvuldigd met de witte bewolkingssluier, wat het palet zelf geeft.
 * - 's Nachts (donkere kaart, waar vermenigvuldigen de regen laat verdwijnen): gedempt — in Wind dekking 0,8,
 *   verzadiging 0,7, helderheid 0,9; in Lucht dekking 0,7, verzadiging 0,7, helderheid 0,85.
 * De proefstanden (zie `FOCUS_RAIN_VARIANTS`):
 * - `als-weer`: de regen treedt niet terug; de referentie zonder sprong.
 * - `gedempt`: overdag doorzichtiger en iets grijzer (Wind dekking 0,7, Lucht 0,65; verzadiging 0,85 — op 0,7
 *   werd het blauw op de lichte kaart vuilgrijs), 's nachts de waarden van het product.
 * - `vermenigvuldigd`: overdag zoals het product (vermenigvuldigd, Wind op 0,9), 's nachts de waarden van het product.
 */
export function rainPresentation(input: PresentationInput): RainPresentation {
  const { windFocus, airFocus, night } = input
  const variant = input.variant ?? DEFAULT_FOCUS_RAIN_VARIANT
  const visible = 1 - input.temperatureFocus
  if (variant === 'als-weer') return { opacity: visible, saturation: 1, brightness: 1, multiply: false }
  if (night) {
    return {
      opacity: visible * (1 - 0.2 * windFocus) * (1 - 0.3 * airFocus),
      saturation: (1 - 0.3 * windFocus) * (1 - 0.3 * airFocus),
      brightness: (1 - 0.1 * windFocus) * (1 - 0.15 * airFocus),
      multiply: false,
    }
  }
  if (variant === 'gedempt') {
    return {
      opacity: visible * (1 - 0.3 * windFocus) * (1 - 0.35 * airFocus),
      saturation: (1 - 0.15 * windFocus) * (1 - 0.15 * airFocus),
      brightness: 1,
      multiply: false,
    }
  }
  return { opacity: visible * (1 - 0.1 * windFocus), saturation: 1, brightness: 1, multiply: windFocus >= 0.5 || airFocus >= 0.5 }
}
