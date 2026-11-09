import type { MrfHeader } from './contract.js'
import type { PaletteStops, Rgb } from './temperature-palette.js'
import { temperaturePlaces, type TemperaturePlace } from './temperature.js'

/** Ondergrens in m/s van Beaufort 1 t/m 12 (KNMI, gemiddelde wind over 10 minuten). */
export const BEAUFORT_LOWER_MS = [0.3, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7] as const
export const BEAUFORT_MAX = 12

/**
 * Fietsweer (PO 2026-11-09, U101 ronde 4: "how does it feel"): tot 3 Bft bijna kleurloos (lekker), 4–5 zacht geel
 * (tegenwind die je voelt), 6–7 oranje (zwaar), vanaf 8 rood naar donker (storm). Het contrast zit waar het ertoe
 * doet; de dekking bouwt op met de windkracht (WIND_FILL), zodat de kaart bij rustig weer zichtbaar blijft.
 */
export const BEAUFORT_COLORS: readonly string[] = [
  '#f7f5ee', '#f3f1e6', '#eeebdb', '#e6e2cc', '#f4df8a', '#f0c95b', '#ef9a3d', '#e8742f', '#d84a33', '#b92f37', '#93233f', '#6e1d45', '#4a173f',
]

/** Welke klassen samen één gevoel zijn; de legenda zet het woord eronder. */
export const BEAUFORT_FEEL_ZONES: ReadonlyArray<{ word: string; from: number; to: number }> = [
  { word: 'lekker', from: 0, to: 3 }, { word: 'tegenwind', from: 4, to: 5 }, { word: 'zwaar', from: 6, to: 7 }, { word: 'storm', from: 8, to: 10 },
]

export function beaufortNumber(speed: number): number {
  let force = 0
  while (force < BEAUFORT_MAX && speed >= BEAUFORT_LOWER_MS[force]!) force++
  return force
}

/**
 * Continue Beaufortwaarde: precies k op de ondergrens van k Bft, lineair daartussen. Isolijnen met stap 1
 * op dit veld liggen zo exact op de Beaufortgrenzen, en de band tussen k en k+1 is klasse k.
 */
export function beaufortScale(speed: number): number {
  if (!(speed > 0)) return 0
  if (speed < BEAUFORT_LOWER_MS[0]) return speed / BEAUFORT_LOWER_MS[0]
  for (let force = 1; force < BEAUFORT_MAX; force++) {
    const lower = BEAUFORT_LOWER_MS[force - 1]!, upper = BEAUFORT_LOWER_MS[force]!
    if (speed < upper) return force + (speed - lower) / (upper - lower)
  }
  return Math.min(BEAUFORT_MAX + 0.99, BEAUFORT_MAX + (speed - BEAUFORT_LOWER_MS[BEAUFORT_MAX - 1]!) / 4)
}

// Fijn genoeg dat de gladde B-spline-snede geen trappen ziet, en 13 klassen passen in één byte.
export const CODES_PER_FORCE = 18
const NO_DATA = 255

/**
 * Eén Beaufortframe als gekwantiseerd veld, zodat de isolijnketen (blend, blur, worker, GPU-snede) het
 * behandelt als elk ander uurframe.
 */
export function beaufortFrame(u: Uint8Array, v: Uint8Array, uHeader: MrfHeader, vHeader: MrfHeader): { data: Uint8Array; quant: Array<number | null> } {
  const data = new Uint8Array(u.length)
  for (let index = 0; index < u.length; index++) {
    const east = uHeader.quant[u[index]!]
    const north = vHeader.quant[v[index]!]
    if (east == null || north == null) { data[index] = NO_DATA; continue }
    data[index] = Math.min(NO_DATA - 1, Math.round(beaufortScale(Math.hypot(east, north)) * CODES_PER_FORCE))
  }
  return { data, quant: BEAUFORT_QUANT }
}

const BEAUFORT_QUANT: Array<number | null> = Array.from({ length: 256 }, (_, code) => code === NO_DATA ? null : code / CODES_PER_FORCE)

/** Bandkleuren voor de isolijnlaag: band k (tussen de lijnen k en k+1) samplet het palet op k + 0,5. */
export function beaufortPalette(): PaletteStops {
  return BEAUFORT_COLORS.map((hex, force) => [force + 0.5, hexRgb(hex)] as const)
}

/** Klassen voor de legenda; hogere klassen dan in de data voorkomen zijn zeldzaam, dus 0–9 en "10+". */
export const BEAUFORT_LEGEND: ReadonlyArray<{ label: string; color: string }> = [
  ...BEAUFORT_COLORS.slice(0, 10).map((color, force) => ({ label: String(force), color })),
  { label: '10+', color: BEAUFORT_COLORS[10]! },
]

function hexRgb(hex: string): Rgb {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16 & 255) / 255, (value >> 8 & 255) / 255, (value & 255) / 255]
}

/**
 * Plaatsen voor de vaantjes: de temperatuurplaatsen plus punten op zee en het IJsselmeer, omdat het verschil
 * kust ↔ binnenland juist daar zit. De zeepunten staan achteraan: plaatsen gaan voor bij gelijke afstand.
 */
export const windVanePlaces: readonly TemperaturePlace[] = [
  ...temperaturePlaces,
  { name: 'Noordzee west', lng: 3.3, lat: 52.3 },
  { name: 'Noordzee noord', lng: 4.3, lat: 53.5 },
  { name: 'Waddenzee noord', lng: 5.9, lat: 53.6 },
  { name: 'Noordzee zuid', lng: 2.9, lat: 51.7 },
  { name: 'IJsselmeer', lng: 5.35, lat: 52.85 },
  { name: 'Markermeer', lng: 5.25, lat: 52.55 },
  { name: 'Noordzee kust', lng: 3.9, lat: 52.7 },
  { name: 'Eems', lng: 6.75, lat: 53.6 },
]

/**
 * Minimale schermafstand tussen twee vaantjes. Een vaantje is groter dan een temperatuurlabel, dus ruimer
 * dan TEMPERATURE_LABEL_SPACING, maar zo dat er ±30–40 over NL staan op telefoon en desktop.
 */
export const WIND_VANE_SPACING = { viewportFraction: 1 / 16, minimumPx: 40, maximumPx: 64 } as const

export function windVaneSpacingPx(width: number, height: number): number {
  const { viewportFraction, minimumPx, maximumPx } = WIND_VANE_SPACING
  return Math.round(Math.max(minimumPx, Math.min(maximumPx, Math.min(width, height) * viewportFraction)))
}

/** Lijnbreedtefactor van de deeltjes bij volle windfocus: ze geven beweging, de vlakken en zakken de waarde. */
export const WIND_THIN_PARTICLE_WIDTH = 0.55
/**
 * Dekking van de Beaufortvlakken: bijna doorzichtig onder `clearBelow` Bft, vol (`opacity`) vanaf `fullAt`
 * (PO 2026-11-09: "te heftig, ik zie de kaart amper"). App, Node-bot en Rust bouwen hem zo op.
 */
export const WIND_FILL = { opacity: 0.75, clearBelow: 0.5, fullAt: 8 } as const

/** De dekking van klasse `force` (midden van de band), zoals de vulling hem opbouwt; voor de legenda. */
export function windClassOpacity(force: number): number {
  const t = Math.max(0, Math.min(1, (force + 0.5 - WIND_FILL.clearBelow) / (WIND_FILL.fullAt - WIND_FILL.clearBelow)))
  return WIND_FILL.opacity * t * t * (3 - 2 * t)
}
/** Lijnkleur van de Bft-grenzen 's nachts: de vulkleur maal deze factor (lichter), overdag verdonkerd zoals Gevoel. */
export const WIND_NIGHT_LINE_LIGHTEN = 1.45
