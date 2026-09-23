export const RAIN_BANDS = [
  { key: 'light', label: 'Licht', minimum: 0, maximum: 2.5 },
  { key: 'moderate', label: 'Matig', minimum: 2.5, maximum: 7.5 },
  { key: 'heavy', label: 'Zwaar', minimum: 7.5, maximum: Number.POSITIVE_INFINITY },
] as const

export type RainClass = typeof RAIN_BANDS[number]['key']

export function classifyRain(value: number): RainClass {
  return RAIN_BANDS.find((band) => value < band.maximum)!.key
}

export function rainChartMaximum(values: Array<number | null>): number {
  const peak = Math.max(0, ...values.map((value) => value ?? 0))
  return [15, 30, 60, 150].find((ceiling) => peak <= ceiling) ?? Math.ceil(peak / 50) * 50
}

export function rainChartPosition(value: number, maximum: number): number {
  const clamped = Math.max(0, Math.min(maximum, value))
  if (clamped <= 0.1) return clamped / 0.1 * 0.08
  if (clamped <= 2.5) return 0.08 + logarithmicFraction(clamped, 0.1, 2.5) * (1 / 3 - 0.08)
  if (clamped <= 7.5) return 1 / 3 + logarithmicFraction(clamped, 2.5, 7.5) / 3
  return 2 / 3 + logarithmicFraction(clamped, 7.5, Math.max(maximum, 7.5001)) / 3
}

function logarithmicFraction(value: number, minimum: number, maximum: number): number {
  return Math.log(value / minimum) / Math.log(maximum / minimum)
}

export function rainColormap(): Uint8Array {
  const stops = [[0, 54, 183, 255], [55, 54, 183, 255], [105, 31, 231, 190], [150, 255, 222, 44], [195, 255, 82, 35], [235, 188, 45, 214], [255, 188, 45, 214]]
  const lut = new Uint8Array(256 * 4)
  for (let value = 0; value < 255; value++) {
    let stop = 1; while (value > stops[stop]![0]) stop++
    const a = stops[stop - 1]!, b = stops[stop]!, mix = (value - a[0]!) / (b[0]! - a[0]!)
    for (let channel = 1; channel < 4; channel++) lut[value * 4 + channel - 1] = Math.round(a[channel]! + (b[channel]! - a[channel]!) * mix)
    lut[value * 4 + 3] = Math.min(210, Math.round(value * 1.6))
  }
  return lut
}

let barColors: string[] | undefined

// Same colour as the map overlay for this rate: invert the mrf v0 rain table
// (docs/mrf.md) to a byte index and read the overlay LUT at full opacity.
export function rainColor(value: number): string {
  if (!barColors) {
    const lut = rainColormap()
    barColors = Array.from({ length: 256 }, (_, index) => `rgb(${lut[index * 4]}, ${lut[index * 4 + 1]}, ${lut[index * 4 + 2]})`)
  }
  const index = value < 0.005 ? 0 : Math.round(1 + 253 * Math.log(value / 0.01) / Math.log(150 / 0.01))
  return barColors[Math.max(0, Math.min(254, index))]!
}
