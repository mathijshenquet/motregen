import { solarPosition } from './solar'

export type UvLevel = 'laag' | 'matig' | 'hoog' | 'zeer hoog' | 'extreem'

// WHO/KNMI-klassen van de UV-index; `key` is de CSS-kleurnaam.
export const UV_LEVELS: ReadonlyArray<{ level: UvLevel; from: number; key: string }> = [
  { level: 'laag', from: 0, key: 'low' },
  { level: 'matig', from: 3, key: 'moderate' },
  { level: 'hoog', from: 6, key: 'high' },
  { level: 'zeer hoog', from: 8, key: 'very-high' },
  { level: 'extreem', from: 11, key: 'extreme' },
]
/** Right end of the bar scale; everything from 11 up shares the extreme band. */
export const UV_SCALE_MAX = 12

export interface UvAdvice {
  value: number
  strength: Exclude<UvLevel, 'laag'>
}

export function uvLevel(value: number): (typeof UV_LEVELS)[number] {
  let found = UV_LEVELS[0]!
  for (const level of UV_LEVELS) if (value >= level.from) found = level
  return found
}

export function formatUv(value: number | null | undefined): string {
  return value == null ? '—' : value.toLocaleString('nl-NL', { maximumFractionDigits: 1 })
}

export function uvChipLabel(value: number | null | undefined): string | null {
  const advice = uvAdvice(value)
  return advice ? `Insmeren · UV ${formatUv(advice.value)} ${advice.strength}` : null
}

export function uvAdvice(value: number | null | undefined): UvAdvice | null {
  if (value == null || !Number.isFinite(value) || value < 3) return null
  return { value: Math.round(value * 10) / 10, strength: uvLevel(value).level as UvAdvice['strength'] }
}

// Fitted on KNMI uvi_clear (26 days April–September 2026) and on the KNMI
// cloud modification against HARMONIE hour-mean radiation; runs and errors are
// documented in docs/fields.md (UV-schatting).
export const CLEAR_SKY_UV_SCALE = 9.2
export const CLEAR_SKY_UV_EXPONENT = 2.584
export const CLEAR_SKY_OZONE_AMPLITUDE = 0.127
export const CLEAR_SKY_OZONE_PEAK_DAY = 102
export const UV_ESTIMATE_EXPONENT = 0.3

const day = 86_400_000

/** Clear-sky UV index for a sun at sin(elevation) `mu`, with the spring ozone maximum damping it. */
export function clearSkyUv(mu: number, epoch: number): number {
  if (mu <= 0) return 0
  const year = new Date(epoch).getUTCFullYear()
  const dayOfYear = (epoch - Date.UTC(year, 0, 1)) / day + 1
  const ozone = 1 - CLEAR_SKY_OZONE_AMPLITUDE * Math.cos(2 * Math.PI * (dayOfYear - CLEAR_SKY_OZONE_PEAK_DAY) / 365)
  return CLEAR_SKY_UV_SCALE * Math.pow(mu, CLEAR_SKY_UV_EXPONENT) * ozone
}

/**
 * The day's ceiling for the UV bar: clear-sky UV with the sun at its highest that day,
 * where sin(noon elevation) = cos(latitude − declination).
 */
export function dailyClearSkyUvMax(epoch: number, latitude: number): number {
  return clearSkyUv(Math.cos(latitude * Math.PI / 180 - solarPosition(epoch).declination), epoch)
}

/** Haurwitz clear-sky global horizontal irradiance in W/m². */
export function clearSkyRadiation(mu: number): number {
  return mu > 0.01 ? 1_098 * mu * Math.exp(-0.057 / mu) : 0
}

/**
 * UV index at `epoch` from the HARMONIE hour means that end at `epoch`
 * (`radiationBefore`) and one hour later (`radiationAfter`): the clear-sky UV
 * scaled by how much of the clear-sky irradiance reached the ground.
 */
export function estimateUv(
  epoch: number,
  radiationBefore: number | null | undefined,
  radiationAfter: number | null | undefined,
  sinElevation: (epoch: number) => number,
  clearUv = clearSkyUv(sinElevation(epoch), epoch),
): number | null {
  const ratios: number[] = []
  for (const [radiation, end] of [[radiationBefore, epoch], [radiationAfter, epoch + 3_600_000]] as const) {
    if (radiation == null || !Number.isFinite(radiation)) continue
    let clear = 0
    for (let step = 0; step < 6; step++) clear += clearSkyRadiation(sinElevation(end - (step + 0.5) * 600_000)) / 6
    if (clear > 20) ratios.push(Math.max(0, Math.min(1, radiation / clear)))
  }
  if (!ratios.length) return radiationBefore == null && radiationAfter == null ? null : clearUv
  const cloudModification = ratios.reduce((sum, ratio) => sum + ratio, 0) / ratios.length
  return clearUv * Math.pow(cloudModification, UV_ESTIMATE_EXPONENT)
}

export interface UvReading {
  /** Cloud-modified UV index: what the sun does today. */
  value: number
  /** The same hour without clouds. */
  clear: number
  estimated: boolean
  clearEstimated: boolean
}

/**
 * One table row: KNMI analysis and KNMI clear-sky UV where they exist, else
 * the estimate on top of whichever clear-sky value is at hand.
 */
export function uvReading(
  epoch: number,
  measured: number | null,
  measuredClear: number | null,
  radiationBefore: number | null,
  radiationAfter: number | null,
  sinElevation: (epoch: number) => number,
  mayEstimate: boolean,
): UvReading | null {
  const clearEstimated = measuredClear == null
  const clear = measuredClear ?? clearSkyUv(sinElevation(epoch), epoch)
  if (measured != null) return { value: measured, clear: Math.max(clear, measured), estimated: false, clearEstimated }
  if (!mayEstimate) return null
  const estimate = estimateUv(epoch, radiationBefore, radiationAfter, sinElevation, clear)
  return estimate == null ? null : { value: estimate, clear, estimated: true, clearEstimated }
}
