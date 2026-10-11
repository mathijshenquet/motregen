export interface RainPresentation {
  opacity: number
  /** 1 = het palet zoals het is; lager is grijzer bij gelijke helderheid. */
  saturation: number
  /** 1 = het palet zoals het is; lager is donkerder bij gelijke tint. */
  brightness: number
  /** De regen vermenigvuldigt met wat eronder ligt in plaats van eroverheen te liggen (alleen op een lichte kaart). */
  multiply: boolean
}

// Hoe regen in Wind en Lucht terugtreedt. `per-modus` is het product (PO 2026-10-11, U77): gedempt in Wind,
// vermenigvuldigd in Lucht, met dezelfde menging als Weer. `huidig` is het beeld van vóór U77 (PO 2026-10-08, U62),
// dat sinds Weer met echte alfa-over en een drempel tekent bij schakelen naar Wind of Lucht overdag een sprong gaf
// naar fletse buien met een witte zoom; de bot rendert daar nog mee. De overige standen zijn ter vergelijking
// (?dev › Regen, vervalt 2026-10-17).
export const FOCUS_RAIN_VARIANTS = ['per-modus', 'huidig', 'als-weer', 'gedempt', 'vermenigvuldigd'] as const
export type FocusRainVariant = typeof FOCUS_RAIN_VARIANTS[number]
export const DEFAULT_FOCUS_RAIN_VARIANT: FocusRainVariant = 'per-modus'
/** Hoort bij `PRE_U77_RAIN_LOOK`: de bot houdt Wind op het beeld van vóór U77 tot hij echte alfa-over heeft. */
export const PRE_U77_FOCUS_RAIN_VARIANT: FocusRainVariant = 'huidig'
export const FOCUS_RAIN_VARIANT_STORAGE_KEY = 'motregen-dev-regen-wind-lucht'

/** Of de regen in Wind en Lucht de menging van Weer gebruikt (echte alfa-over) in plaats van die van vóór U77. */
export function focusRainUsesWeatherBlend(variant: FocusRainVariant): boolean {
  return variant !== PRE_U77_FOCUS_RAIN_VARIANT
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
 * Hoe de regen getekend wordt bij deze focuswaarden. Regen verdwijnt bij temperatuurfocus; in Wind en in Lucht
 * treedt hij terug (MIP-24). Het product (PO 2026-10-11, U77):
 * - Wind overdag: gedempt — dekking 0,7 en verzadiging 0,85 (op 0,7 werd het blauw op de lichte kaart vuilgrijs).
 * - Lucht overdag: vermenigvuldigd met de witte bewolkingssluier, wat het palet zelf geeft.
 * - 's Nachts (donkere kaart, waar vermenigvuldigen de regen laat verdwijnen): gedempt — in Wind dekking 0,8,
 *   verzadiging 0,7, helderheid 0,9; in Lucht dekking 0,7, verzadiging 0,7, helderheid 0,85 (PO 2026-10-08, U62).
 * De andere standen (zie `FOCUS_RAIN_VARIANTS`) verschillen alleen overdag:
 * - `huidig` en `vermenigvuldigd`: in beide modi vermenigvuldigd, Wind op dekking 0,9.
 * - `gedempt`: in beide modi gedempt, Lucht op dekking 0,65.
 * - `als-weer`: de regen treedt niet terug, ook 's nachts niet; de referentie zonder sprong.
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
  const windMuted = variant === 'per-modus' || variant === 'gedempt'
  const airMuted = variant === 'gedempt'
  const windOpacity = 1 - (windMuted ? 0.3 : 0.1) * windFocus
  const airOpacity = airMuted ? 1 - 0.35 * airFocus : 1
  const windSaturation = windMuted ? 1 - 0.15 * windFocus : 1
  const airSaturation = airMuted ? 1 - 0.15 * airFocus : 1
  return {
    opacity: visible * windOpacity * airOpacity,
    saturation: windSaturation * airSaturation,
    brightness: 1,
    multiply: (!windMuted && windFocus >= 0.5) || (!airMuted && airFocus >= 0.5),
  }
}
