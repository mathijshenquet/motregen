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

// Op 10 minuten: met een MAE van 10 min/u suggereert een fijner getal precisie die er niet is (MIP-38).
const SUNSHINE_LABEL_STEP_MINUTES = 10

export function sunshineLabel(minutes: number): string {
  const rounded = Math.round(minutes / SUNSHINE_LABEL_STEP_MINUTES) * SUNSHINE_LABEL_STEP_MINUTES
  return rounded === 0 ? 'geen zon' : `${rounded} min zon`
}
