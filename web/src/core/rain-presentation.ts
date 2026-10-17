export interface RainPresentation {
  opacity: number
  /** 1 = het palet zoals het is; lager is grijzer bij gelijke helderheid. */
  saturation: number
  /** 1 = het palet zoals het is; lager is donkerder bij gelijke tint. */
  brightness: number
  /** De regen vermenigvuldigt met wat eronder ligt in plaats van eroverheen te liggen (alleen op een lichte kaart). */
  multiply: boolean
}

interface PresentationInput {
  temperatureFocus: number
  windFocus: number
  airFocus: number
  night: boolean
}

/**
 * Hoe de regen getekend wordt bij deze focuswaarden. Regen verdwijnt bij temperatuurfocus; in Wind en in Lucht
 * treedt hij terug (MIP-24). Het product (PO 2026-10-11, U77):
 * - Wind overdag: gedempt — dekking 0,7 en verzadiging 0,85 (op 0,7 werd het blauw op de lichte kaart vuilgrijs).
 * - Lucht overdag: vermenigvuldigd met de witte bewolkingssluier, wat het palet zelf geeft.
 * - 's Nachts (donkere kaart, waar vermenigvuldigen de regen laat verdwijnen): gedempt — in Wind dekking 0,8,
 *   verzadiging 0,7, helderheid 0,9; in Lucht dekking 0,7, verzadiging 0,7, helderheid 0,85 (PO 2026-10-08, U62).
 */
// U89, PO 2026-10-17: per-modus vastgezet; de vergelijkingsstanden vervallen.
export function rainPresentation(input: PresentationInput): RainPresentation {
  const { windFocus, airFocus, night } = input
  const visible = 1 - input.temperatureFocus
  if (night) {
    return {
      opacity: visible * (1 - 0.2 * windFocus) * (1 - 0.3 * airFocus),
      saturation: (1 - 0.3 * windFocus) * (1 - 0.3 * airFocus),
      brightness: (1 - 0.1 * windFocus) * (1 - 0.15 * airFocus),
      multiply: false,
    }
  }
  return {
    opacity: visible * (1 - 0.3 * windFocus),
    saturation: 1 - 0.15 * windFocus,
    brightness: 1,
    multiply: airFocus >= 0.5,
  }
}
