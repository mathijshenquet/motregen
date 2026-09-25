import { smoothstep } from './isoline-spline'

// Tinten naar de KNMI-temperatuurkaarten (knmi.nl, actuele temperatuur): paars → blauw → groen → geel → oranje → rood; geen exacte kopie.
export const TEMPERATURE_PALETTE: ReadonlyArray<readonly [number, string]> = [
  [-20, '#7b3fa0'],
  [-15, '#5a3fae'],
  [-10, '#3452b8'],
  [-5, '#2f7fd6'],
  [0, '#4fb0e8'],
  [5, '#4fc6bd'],
  [10, '#62bf62'],
  [15, '#b7d747'],
  [20, '#f4d53a'],
  [25, '#f5a02e'],
  [30, '#e5512b'],
  [35, '#b3202b'],
  [40, '#7a1030'],
]

export type Rgb = [number, number, number]

const STOPS = TEMPERATURE_PALETTE.map(([temperature, hex]) => {
  const value = Number.parseInt(hex.slice(1), 16)
  return [temperature, [(value >> 16 & 255) / 255, (value >> 8 & 255) / 255, (value & 255) / 255] as Rgb] as const
})

/** Continue paletkleur (0–1) bij `temperature` °C, geklemd op de uiterste stops. */
export function paletteColor(temperature: number): Rgb {
  if (temperature <= STOPS[0]![0]) return [...STOPS[0]![1]]
  for (let index = 1; index < STOPS.length; index++) {
    const [high, to] = STOPS[index]!
    if (temperature > high) continue
    const [low, from] = STOPS[index - 1]!
    const mix = (temperature - low) / (high - low)
    return [0, 1, 2].map((channel) => from[channel]! + (to[channel]! - from[channel]!) * mix) as Rgb
  }
  return [...STOPS.at(-1)![1]]
}

/** Kleur van band `band` (in stappen): alles tussen niveau band·step en (band+1)·step, op het bandmidden. */
export function bandColor(band: number, step: number): Rgb {
  return paletteColor((band + 0.5) * step)
}

export interface FillSample {
  /** Band onder resp. boven de dichtstbijzijnde lijn, in stappen. */
  lower: number
  upper: number
  /** Aandeel van de bovenste band in de kleur. */
  mix: number
  opacity: number
}

/**
 * Vulling op veldwaarde `s` (in stappen) naast een lijn met zichtbaarheid `fade` (1 = volle
 * lijn). De bandgrens is een overgang over (1 − fade) stap rond de lijn: bij een volle lijn een
 * harde grens eronder, bij een weggevaagde lijn geen grens (op de bandmiddens altijd zuiver).
 * |s − L| / 0,5 is precies afstand / halve bandbreedte in px, dus de afval is in s-eenheden.
 * De verhoging bij de lijn vaagt mee, anders bleef een spookring van dekking over.
 */
export function fillSample(s: number, fade: number, base: number, falloff: number): FillSample {
  const level = Math.floor(s + 0.5)
  const offset = s - level
  const width = 1 - Math.max(0, Math.min(1, fade))
  const mix = width <= 0 ? (offset >= 0 ? 1 : 0) : Math.max(0, Math.min(1, 0.5 + offset / width))
  const opacity = base * (1 - falloff + falloff * fade * (1 - smoothstep(0, 0.5, Math.abs(offset))))
  return { lower: level - 1, upper: level, mix, opacity }
}

/** Voorvermenigvuldigde RGBA van de vulling, zoals de shader hem schrijft. */
export function fillColor(s: number, fade: number, step: number, base: number, falloff: number): [number, number, number, number] {
  const { lower, upper, mix, opacity } = fillSample(s, fade, base, falloff)
  const a = bandColor(lower, step), b = bandColor(upper, step)
  return [0, 1, 2].map((channel) => (a[channel]! + (b[channel]! - a[channel]!) * mix) * opacity).concat(opacity) as [number, number, number, number]
}

/** Stops als uniform-arrays voor de shader. */
export function paletteUniforms(): { temperatures: Float32Array; colors: Float32Array } {
  return {
    temperatures: new Float32Array(STOPS.map(([temperature]) => temperature)),
    colors: new Float32Array(STOPS.flatMap(([, color]) => color)),
  }
}

export const PALETTE_STOPS = STOPS.length
