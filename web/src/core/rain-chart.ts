export const RAIN_BANDS = [
  { key: 'dry', label: 'Droog', minimum: 0, maximum: 0.1 },
  { key: 'light', label: 'Licht', minimum: 0.1, maximum: 2.5 },
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
  if (clamped <= 2.5) return 0.08 + logarithmicFraction(clamped, 0.1, 2.5) * 0.31
  if (clamped <= 7.5) return 0.39 + logarithmicFraction(clamped, 2.5, 7.5) * 0.31
  return 0.7 + logarithmicFraction(clamped, 7.5, Math.max(maximum, 7.5001)) * 0.3
}

function logarithmicFraction(value: number, minimum: number, maximum: number): number {
  return Math.log(value / minimum) / Math.log(maximum / minimum)
}
