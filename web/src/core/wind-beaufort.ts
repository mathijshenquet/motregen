import type { MrfHeader } from './contract.js'
import type { PaletteStops, Rgb } from './temperature-palette.js'
import { temperaturePlaces, type TemperaturePlace } from './temperature.js'

/** Ondergrens in m/s van Beaufort 1 t/m 12 (KNMI, gemiddelde wind over 10 minuten). */
export const BEAUFORT_LOWER_MS = [0.3, 1.6, 3.4, 5.5, 8.0, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7] as const
export const BEAUFORT_MAX = 12

/** Groen licht → donker tot en met 5 Bft, vanaf 6 Bft oranje → rood (PO-referentie Buienradar, U101). */
export const BEAUFORT_COLORS: readonly string[] = [
  '#f2f9ec', '#e0f1d2', '#c8e6b0', '#a8d68b', '#82c166', '#5aa547',
  '#f7b44f', '#f08f38', '#e4662b', '#cf3f24', '#ac241e', '#861719', '#5f0e13',
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
/**
 * Paletvarianten voor de Bft-vlakken (U101 ronde 4, `?dev&windpalet=`, PO 2026-11-09: "kleurschema nog niet
 * geweldig"). Alleen de app; de bot gebruikt BEAUFORT_COLORS tot de PO kiest.
 */
export const WIND_PALETTES = {
  huidig: BEAUFORT_COLORS,
  /**
   * Doorlopend (PO 2026-11-09 over 5→6 Bft: "niet goed op een of andere manier"): de lichtheid daalt per klasse en
   * de tint loopt via geelgroen en geel naar oranje en rood, zonder sprong van groen naar zijn complement (dat
   * mengde over de groene kaart tot modderig beige).
   */
  doorlopend: ['#f4f9ee', '#e6f3d8', '#d3eabd', '#bfe0a0', '#aad483', '#98c86c', '#c4bb47', '#e09f3a', '#e07a30', '#d0552a', '#b13a2b', '#8c2a2f', '#5e1c2c'],
  /** ColorBrewer YlGnBu, doorgetrokken naar 13 klassen: perceptueel oplopend, veel contrast per stap, koel naast de zakken. */
  helder: ['#ffffd9', '#f1f9bd', '#dcf1b2', '#b6e2b6', '#85cdbb', '#57bac2', '#34a0c2', '#1f80b8', '#2161a6', '#243f96', '#1e2a7a', '#141d5a', '#0b1440'],
  /** Elke klasse een eigen tint, zoals bekende wind-apps: blauw → teal → limoen → geel → oranje → rood → paars. */
  storm: ['#e9f2f9', '#c7e1f2', '#9bcbe8', '#6fb3d9', '#52c2b0', '#9ad25b', '#f2d23c', '#f6a23a', '#ec6a33', '#d63a3a', '#b02a6b', '#7d2a8c', '#4b1f6f'],
  /** Zeegroen naar diepblauw, warm pas vanaf 6 Bft: rustig onder de oranje zakken, storm valt op. */
  zee: ['#eef7f6', '#d8eeec', '#bfe2e1', '#a0d0d3', '#7fbac5', '#5fa1b6', '#f6c35c', '#f29b3e', '#e66a2e', '#cf442b', '#ab2c3d', '#83224f', '#5b1c5d'],
  /** Crème en zand naar terracotta en baksteen: warm en papierachtig. */
  zand: ['#fbf6ea', '#f5ecd6', '#eedfbe', '#e5cfa2', '#d9bb85', '#cba36b', '#c08552', '#b36a43', '#a1523a', '#8a3f35', '#70302f', '#572528', '#3e1b20'],
  /** Eén koele leisteentint die donkerder wordt: de zakken zijn het enige kleuraccent. */
  mono: ['#f3f5f8', '#e2e8f0', '#cfd8e5', '#b7c4d8', '#9caecb', '#8196bd', '#677dac', '#52669a', '#415386', '#33426f', '#283559', '#1f2946', '#171f35'],
} as const satisfies Record<string, readonly string[]>
export type WindPaletteName = keyof typeof WIND_PALETTES

export function windPaletteName(value: string | null): WindPaletteName {
  return value && value in WIND_PALETTES ? value as WindPaletteName : 'huidig'
}

/** Bandkleuren voor de isolijnlaag: band k (tussen de lijnen k en k+1) samplet het palet op k + 0,5. */
export function beaufortPalette(colors: readonly string[] = BEAUFORT_COLORS): PaletteStops {
  return colors.map((hex, force) => [force + 0.5, hexRgb(hex)] as const)
}

/** Klassen voor de legenda; hogere klassen dan in de data voorkomen zijn zeldzaam, dus 0–9 en "10+". */
export function beaufortLegend(colors: readonly string[] = BEAUFORT_COLORS): ReadonlyArray<{ label: string; color: string }> {
  return [...colors.slice(0, 10).map((color, force) => ({ label: String(force), color })), { label: '10+', color: colors[10]! }]
}

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
/** Dekking van de Beaufortvlakken; veel hoger dan Gevoel (0,35), want de klasse moet zonder legenda leesbaar zijn. */
export const WIND_FILL_OPACITY = 0.65
/** Lijnkleur van de Bft-grenzen 's nachts: de vulkleur maal deze factor (lichter), overdag verdonkerd zoals Gevoel. */
export const WIND_NIGHT_LINE_LIGHTEN = 1.45
