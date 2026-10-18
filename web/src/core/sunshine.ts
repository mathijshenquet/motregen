import { clearSkyHourMean, clearSkyRadiation, HOUR_SUBSTEPS, hourSubstepEpochs } from './uv'

// S1 uit MIP-38: gefit tegen KNMI-SQ per uur, zie tools/zonneschijn/results.md.
export const SUNSHINE_SUN_ELEVATION_DEGREES = 4.2
export const SUNSHINE_CLEAR_INDEX_LOW = 0.28
export const SUNSHINE_CLEAR_INDEX_HIGH = 0.92
// D1 uit MIP-39: dezelfde overgang op de directe straling van ICON-D2, zie tools/zonneschijn/results-icon-d2.md.
export const SUNSHINE_DIRECT_INDEX_LOW = 0.02
export const SUNSHINE_DIRECT_INDEX_HIGH = 0.66
// Aan beide randen van de ICON-D2-reeks loopt het aandeel over deze uren naar HARMONIE, zodat de curve niet springt.
export const ICON_D2_EDGE_HOURS = 3

const HOUR = 3_600_000
const SOLAR_CONSTANT = 1361
const SUN_THRESHOLD_SIN = Math.sin(SUNSHINE_SUN_ELEVATION_DEGREES * Math.PI / 180)

/** A point series by frame time: HARMONIE global or ICON-D2 direct hour means that end at the frame time. */
export interface SunshineSeries {
  timeline: ReadonlyArray<{ epoch: number }>
  values: ReadonlyArray<number | null>
}

export interface SunshineInputs {
  /** HARMONIE hour-mean global radiation of the hour that ends at `end`. */
  globalAt: (end: number) => number | null | undefined
  /** ICON-D2 hour-mean direct radiation, with the first and last hour end the run covers (MIP-39). */
  direct?: { at: (end: number) => number | null | undefined; first: number; last: number }
  sinElevation: (epoch: number) => number
}

export function sunshineInputs(global: SunshineSeries, direct: SunshineSeries | undefined, sinElevation: (epoch: number) => number): SunshineInputs {
  const lookup = (series: SunshineSeries) => {
    const byEpoch = new Map(series.timeline.map((frame, index) => [frame.epoch, series.values[index]]))
    return (end: number) => byEpoch.get(end)
  }
  const covered = direct?.timeline.length ? direct : undefined
  return {
    globalAt: lookup(global),
    direct: covered && { at: lookup(covered), first: covered.timeline[0]!.epoch, last: covered.timeline.at(-1)!.epoch },
    sinElevation,
  }
}

/** Share of the hour that ends at `end` in which the sun stands high enough for KNMI to count sunshine. */
export function sunshinePossibleShare(end: number, sinElevation: (epoch: number) => number): number {
  let steps = 0
  for (const epoch of hourSubstepEpochs(end)) if (sinElevation(epoch) > SUN_THRESHOLD_SIN) steps++
  return steps / HOUR_SUBSTEPS
}

/** Erbs: diffuse share of the global irradiance at clearness `k`. */
function erbsDiffuseFraction(k: number): number {
  if (k <= 0.22) return 1 - 0.09 * k
  if (k <= 0.8) return 0.9511 - 0.1604 * k + 4.388 * k ** 2 - 16.638 * k ** 3 + 12.336 * k ** 4
  return 0.165
}

/** Clear-sky direct horizontal irradiance (Haurwitz + Erbs) as the mean over the hour that ends at `end`. */
export function clearSkyDirectHourMean(end: number, sinElevation: (epoch: number) => number): number {
  const year = new Date(end).getUTCFullYear()
  const dayOfYear = Math.floor((end - Date.UTC(year, 0, 1)) / 86_400_000) + 1
  const extraterrestrial = SOLAR_CONSTANT * (1 + 0.033 * Math.cos(2 * Math.PI * dayOfYear / 365))
  let clear = 0
  for (const epoch of hourSubstepEpochs(end)) {
    const mu = sinElevation(epoch)
    const global = clearSkyRadiation(mu)
    if (global > 0) clear += global * (1 - erbsDiffuseFraction(global / (extraterrestrial * mu))) / HOUR_SUBSTEPS
  }
  return clear
}

function ramp(index: number, low: number, high: number): number {
  return Math.max(0, Math.min(1, (index - low) / (high - low)))
}

/** 0–1 between both edges of the ICON-D2 run, rising over ICON_D2_EDGE_HOURS at each edge; 0 outside it. */
export function iconD2Weight(end: number, first: number, last: number): number {
  if (end < first || end > last) return 0
  const hoursFromEdge = Math.min(end - first, last - end) / HOUR
  return Math.min(1, (hoursFromEdge + 1) / (ICON_D2_EDGE_HOURS + 1))
}

/**
 * The 0–1 share of the possible sunshine in the hour that ends at `end`: S1 on the HARMONIE global
 * radiation, D1 on the ICON-D2 direct radiation where that run covers the hour, blended at its edges.
 * Null without radiation from either source.
 */
export function sunshineShare(end: number, inputs: SunshineInputs): number | null {
  const global = inputs.globalAt(end)
  let fromGlobal: number | null = null
  if (global != null && Number.isFinite(global)) {
    const clear = clearSkyHourMean(end, inputs.sinElevation)
    fromGlobal = clear > 1 ? ramp(global / clear, SUNSHINE_CLEAR_INDEX_LOW, SUNSHINE_CLEAR_INDEX_HIGH) : 0
  }
  const direct = inputs.direct
  const weight = direct ? iconD2Weight(end, direct.first, direct.last) : 0
  const value = weight > 0 ? direct!.at(end) : null
  if (value == null || !Number.isFinite(value)) return fromGlobal
  const clearDirect = clearSkyDirectHourMean(end, inputs.sinElevation)
  const index = clearDirect > 1 ? Math.min(1.5, value / clearDirect) : 0
  const fromDirect = ramp(index, SUNSHINE_DIRECT_INDEX_LOW, SUNSHINE_DIRECT_INDEX_HIGH)
  return fromGlobal == null ? fromDirect : weight * fromDirect + (1 - weight) * fromGlobal
}

/** Minutes of sunshine (0–60) in the hour that ends at `end`. Null without radiation; 0 when the sun stays too low. */
export function sunshineMinutes(end: number, inputs: SunshineInputs): number | null {
  const share = sunshineShare(end, inputs)
  if (share == null) return null
  const possible = sunshinePossibleShare(end, inputs.sinElevation)
  if (possible === 0 || clearSkyHourMean(end, inputs.sinElevation) <= 1) return 0
  return 60 * possible * share
}

/** "40 min zon", afgerond op `stepMinutes`; onder een halve stap "geen zon". */
export function sunshineLabel(minutes: number, stepMinutes: number): string {
  const rounded = Math.round(minutes / stepMinutes) * stepMinutes
  return rounded === 0 ? 'geen zon' : `${rounded} min zon`
}

/**
 * Fraction of time with sunshine (0–1) around `epoch`, at quarter-hour resolution: the share of the two
 * neighbouring hours, interpolated between hour centres, times whether the sun stands high enough at `epoch`.
 * Null where both neighbouring hours lack radiation.
 */
export function sunshineFraction(epoch: number, inputs: SunshineInputs): number | null {
  if (inputs.sinElevation(epoch) <= SUN_THRESHOLD_SIN) return 0
  const shareAt = (end: number): number | null => clearSkyHourMean(end, inputs.sinElevation) <= 1 ? null : sunshineShare(end, inputs)
  // Hour [end − 1 h, end] stands for its centre end − 30 min.
  const previousEnd = Math.floor((epoch + HOUR / 2) / HOUR) * HOUR
  const nextEnd = previousEnd + HOUR
  const previous = shareAt(previousEnd)
  const next = shareAt(nextEnd)
  if (previous == null && next == null) return null
  if (previous == null) return next
  if (next == null) return previous
  const weight = (epoch - (previousEnd - HOUR / 2)) / HOUR
  return previous + (next - previous) * weight
}
