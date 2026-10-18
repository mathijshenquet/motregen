import { clearSkyHourMean, HOUR_SUBSTEPS, hourSubstepEpochs } from './uv'

// S1 uit MIP-38: gefit tegen KNMI-SQ per uur, zie tools/zonneschijn/results.md.
export const SUNSHINE_SUN_ELEVATION_DEGREES = 4.2
export const SUNSHINE_CLEAR_INDEX_LOW = 0.28
export const SUNSHINE_CLEAR_INDEX_HIGH = 0.92

const SUN_THRESHOLD_SIN = Math.sin(SUNSHINE_SUN_ELEVATION_DEGREES * Math.PI / 180)

/** Share of the hour that ends at `end` in which the sun stands high enough for KNMI to count sunshine. */
export function sunshinePossibleShare(end: number, sinElevation: (epoch: number) => number): number {
  let steps = 0
  for (const epoch of hourSubstepEpochs(end)) if (sinElevation(epoch) > SUN_THRESHOLD_SIN) steps++
  return steps / HOUR_SUBSTEPS
}

/**
 * Minutes of sunshine (0–60) in the hour that ends at `end`, from the HARMONIE hour-mean global radiation
 * over that hour. Null without radiation; 0 when the sun stays too low.
 */
export function sunshineMinutes(
  end: number,
  radiation: number | null | undefined,
  sinElevation: (epoch: number) => number,
): number | null {
  if (radiation == null || !Number.isFinite(radiation)) return null
  const possible = sunshinePossibleShare(end, sinElevation)
  if (possible === 0) return 0
  const clear = clearSkyHourMean(end, sinElevation)
  if (clear <= 1) return 0
  const clearIndex = radiation / clear
  const ramp = (clearIndex - SUNSHINE_CLEAR_INDEX_LOW) / (SUNSHINE_CLEAR_INDEX_HIGH - SUNSHINE_CLEAR_INDEX_LOW)
  return 60 * possible * Math.max(0, Math.min(1, ramp))
}

/** "40 min zon", afgerond op `stepMinutes`; onder een halve stap "geen zon". */
export function sunshineLabel(minutes: number, stepMinutes: number): string {
  const rounded = Math.round(minutes / stepMinutes) * stepMinutes
  return rounded === 0 ? 'geen zon' : `${rounded} min zon`
}

/**
 * Fraction of time with sunshine (0–1) around `epoch`, at quarter-hour resolution: the hour clear index of the two
 * neighbouring HARMONIE hours, interpolated between hour centres, times whether the sun stands high enough at `epoch`.
 * `radiationAt(end)` gives the hour mean that ends at `end`. Null where both neighbouring hours lack radiation.
 */
export function sunshineFraction(
  epoch: number,
  radiationAt: (end: number) => number | null | undefined,
  sinElevation: (epoch: number) => number,
): number | null {
  if (sinElevation(epoch) <= SUN_THRESHOLD_SIN) return 0
  const hour = 3_600_000
  const shareAt = (end: number): number | null => {
    const radiation = radiationAt(end)
    if (radiation == null || !Number.isFinite(radiation)) return null
    const clear = clearSkyHourMean(end, sinElevation)
    if (clear <= 1) return null
    const ramp = (radiation / clear - SUNSHINE_CLEAR_INDEX_LOW) / (SUNSHINE_CLEAR_INDEX_HIGH - SUNSHINE_CLEAR_INDEX_LOW)
    return Math.max(0, Math.min(1, ramp))
  }
  // Hour [end − 1 h, end] stands for its centre end − 30 min.
  const previousEnd = Math.floor((epoch + hour / 2) / hour) * hour
  const nextEnd = previousEnd + hour
  const previous = shareAt(previousEnd)
  const next = shareAt(nextEnd)
  if (previous == null && next == null) return null
  if (previous == null) return next
  if (next == null) return previous
  const weight = (epoch - (previousEnd - hour / 2)) / hour
  return previous + (next - previous) * weight
}
