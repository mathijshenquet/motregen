// Tintvolgorde van de KNMI-temperatuurkaarten (knmi.nl, actuele temperatuur): blauw → groen → geel → oranje → rood; geen exacte kopie.
export const TEMPERATURE_RAMP: readonly string[] = ['#2f7fd6', '#4fb0e8', '#4fc6bd', '#62bf62', '#b7d747', '#f4d53a', '#f5a02e', '#e5512b']

/**
 * Het vaste KNMI-palet over −20…40 °C gaf binnen de 6–8 °C van één dag één à twee tinten (PO,
 * U25b); daarom rekt de ramp over het actuele bereik. Twee ankers houden de betekenis: onder
 * 0 °C blijft het blauw, vanaf 25 °C rood.
 */
export const COLD_ANCHOR_C = 0
export const WARM_ANCHOR_C = 25
export const MIN_SPAN_C = 8
// Ramppositie van lichtblauw (t/m 0 °C) en van het begin van rood (vanaf 25 °C).
const BLUE_END = 1 / (TEMPERATURE_RAMP.length - 1)
const RED_START = 1 - 0.5 / (TEMPERATURE_RAMP.length - 1)

export type Rgb = [number, number, number]

export interface PaletteRange {
  low: number
  high: number
}

/** Stops in °C: tussen twee stops lineair, daarbuiten de eindkleur. */
export type PaletteStops = ReadonlyArray<readonly [number, Rgb]>

const RAMP = TEMPERATURE_RAMP.map((hex): Rgb => {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16 & 255) / 255, (value >> 8 & 255) / 255, (value & 255) / 255]
})

/** Bereik op hele graden, minstens MIN_SPAN_C breed (symmetrisch aangevuld); undefined zonder waarden. */
export function paletteRange(min: number, max: number): PaletteRange | undefined {
  if (!Number.isFinite(min) || !Number.isFinite(max) || min > max) return undefined
  let low = Math.floor(min), high = Math.ceil(max)
  const missing = MIN_SPAN_C - (high - low)
  if (missing > 0) {
    low -= Math.floor(missing / 2)
    high += Math.ceil(missing / 2)
  }
  return { low, high }
}

/** Knopen (°C, ramppositie) van de monotone, stuksgewijs lineaire afbeelding temperatuur → ramp. */
export function rampKnots({ low, high }: PaletteRange): Array<[number, number]> {
  if (high <= COLD_ANCHOR_C) return [[low, 0], [high, BLUE_END]]
  if (low >= WARM_ANCHOR_C) return [[low, RED_START], [high, 1]]
  const knots: Array<[number, number]> = [[low, 0]]
  const linear = (temperature: number) => (temperature - low) / (high - low)
  if (low < COLD_ANCHOR_C && linear(COLD_ANCHOR_C) > BLUE_END) knots.push([COLD_ANCHOR_C, BLUE_END])
  if (high > WARM_ANCHOR_C && linear(WARM_ANCHOR_C) < RED_START) knots.push([WARM_ANCHOR_C, RED_START])
  knots.push([high, 1])
  return knots
}

function rampColor(position: number): Rgb {
  const scaled = Math.max(0, Math.min(1, position)) * (RAMP.length - 1)
  const index = Math.min(RAMP.length - 2, Math.floor(scaled))
  const mix = scaled - index
  return [0, 1, 2].map((channel) => RAMP[index]![channel]! + (RAMP[index + 1]![channel]! - RAMP[index]![channel]!) * mix) as Rgb
}

/** De ramp als stops in °C over `range`: elke rampkleur en elke knoop, zodat lineair tussen stops exact is. */
export function paletteStops(range: PaletteRange): PaletteStops {
  const knots = rampKnots(range)
  const stops: Array<readonly [number, Rgb]> = []
  for (let segment = 0; segment < knots.length - 1; segment++) {
    const [t0, p0] = knots[segment]!, [t1, p1] = knots[segment + 1]!
    const positions = [p0, ...RAMP.map((_, index) => index / (RAMP.length - 1)).filter((position) => position > p0 && position < p1)]
    for (const position of positions) stops.push([t0 + (t1 - t0) * (position - p0) / (p1 - p0), rampColor(position)])
  }
  const [last, position] = knots.at(-1)!
  stops.push([last, rampColor(position)])
  return stops
}

/** Paletkleur (0–1) bij `temperature` °C, geklemd op de eindstops. */
export function paletteColor(temperature: number, stops: PaletteStops): Rgb {
  if (temperature <= stops[0]![0]) return [...stops[0]![1]]
  for (let index = 1; index < stops.length; index++) {
    const [high, to] = stops[index]!
    if (temperature > high) continue
    const [low, from] = stops[index - 1]!
    const mix = (temperature - low) / (high - low)
    return [0, 1, 2].map((channel) => from[channel]! + (to[channel]! - from[channel]!) * mix) as Rgb
  }
  return [...stops.at(-1)![1]]
}

/** Kleur van band `band` (in stappen): alles tussen niveau band·step en (band+1)·step, op het bandmidden. */
export function bandColor(band: number, step: number, stops: PaletteStops): Rgb {
  return paletteColor((band + 0.5) * step, stops)
}

export interface FillSample {
  /** Band onder resp. boven de dichtstbijzijnde lijn, in stappen. */
  lower: number
  upper: number
  /** Aandeel van de bovenste band in de kleur. */
  mix: number
}

/**
 * Vulling op veldwaarde `s` (in stappen) naast een lijn met zichtbaarheid `fade` (1 = volle
 * lijn): vlakke bandkleur met een scherpe grens onder een volle lijn. Waar de lijn vervaagt
 * (lusjes, gradiëntfade) wordt de grens een overgang over (1 − fade) stap, zodat er geen
 * kleurgrens zonder lijn overblijft; op de bandmiddens altijd de zuivere bandkleur.
 */
export function fillSample(s: number, fade: number): FillSample {
  const level = Math.floor(s + 0.5)
  const offset = s - level
  const width = 1 - Math.max(0, Math.min(1, fade))
  const mix = width <= 0 ? (offset >= 0 ? 1 : 0) : Math.max(0, Math.min(1, 0.5 + offset / width))
  return { lower: level - 1, upper: level, mix }
}

/** Voorvermenigvuldigde RGBA van de vulling met dekking `opacity`, zoals de shader hem schrijft. */
export function fillColor(s: number, fade: number, step: number, stops: PaletteStops, opacity: number): [number, number, number, number] {
  const { lower, upper, mix } = fillSample(s, fade)
  const a = bandColor(lower, step, stops), b = bandColor(upper, step, stops)
  return [0, 1, 2].map((channel) => (a[channel]! + (b[channel]! - a[channel]!) * mix) * opacity).concat(opacity) as [number, number, number, number]
}

/** Maximaal aantal stops: elke rampkleur plus de twee ankers. */
export const PALETTE_STOPS = TEMPERATURE_RAMP.length + 2

/** Stops als uniform-arrays voor de shader, opgevuld met de laatste stop. */
export function paletteUniforms(stops: PaletteStops): { temperatures: Float32Array; colors: Float32Array } {
  const padded = Array.from({ length: PALETTE_STOPS }, (_, index) => stops[Math.min(index, stops.length - 1)]!)
  return {
    temperatures: new Float32Array(padded.map(([temperature]) => temperature)),
    colors: new Float32Array(padded.flatMap(([, color]) => color)),
  }
}
