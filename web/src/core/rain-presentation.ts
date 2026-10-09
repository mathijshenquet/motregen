export interface RainPresentation {
  opacity: number
  /** 1 = het palet zoals het is; lager is grijzer bij gelijke helderheid. */
  saturation: number
  /** 1 = het palet zoals het is; lager is donkerder bij gelijke tint. */
  brightness: number
  /** De regen vermenigvuldigt met wat eronder ligt in plaats van eroverheen te liggen (alleen op een lichte kaart). */
  multiply: boolean
}

/**
 * Hoe de regen getekend wordt bij deze focuswaarden (PO 2026-10-08, U62: "beide veel beter"). Regen verdwijnt
 * bij temperatuurfocus. In Wind en in Lucht treedt hij terug zonder te verbleken: dimmen via alfa mengt met de
 * lichte kaart en maakt geel crème.
 * - Wind overdag: vermenigvuldigd met de kaart op 0,9; geel blijft geel maar rustiger.
 * - Lucht overdag: vermenigvuldigd met de witte bewolkingssluier, wat het palet zelf geeft.
 * - 's Nachts (donkere kaart, waar vermenigvuldigen de regen laat verdwijnen): gedempt — in Wind dekking 0,8,
 *   verzadiging 0,7, helderheid 0,9; in Lucht dekking 0,7, verzadiging 0,7, helderheid 0,85.
 */
export function rainPresentation(input: { temperatureFocus: number; windFocus: number; airFocus: number; night: boolean }): RainPresentation {
  const { windFocus, airFocus, night } = input
  let opacity = 1 - input.temperatureFocus
  let saturation = 1
  let brightness = 1
  if (!night) {
    opacity *= 1 - 0.1 * windFocus
    return { opacity, saturation, brightness, multiply: windFocus >= 0.5 || airFocus >= 0.5 }
  }
  opacity *= (1 - 0.2 * windFocus) * (1 - 0.3 * airFocus)
  saturation *= (1 - 0.3 * windFocus) * (1 - 0.3 * airFocus)
  brightness *= (1 - 0.1 * windFocus) * (1 - 0.15 * airFocus)
  return { opacity, saturation, brightness, multiply: false }
}

