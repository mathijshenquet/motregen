import { erbsDiffuseFraction } from './sunshine'
import { hourSubstepEpochs, HOUR_SUBSTEPS } from './uv'

// Gevoelstemperatuur met zon (MIP-41, U105). Herkomst van de formules en getallen: docs/fields.md §Gevoelstemperatuur.

/** ?dev&gevoel: `nu` = de ingestwaarde (MIP-10), `zon` = MIP-41, `zon-sterk` = dubbele Q als bovengrens (vervalt 2026-11-23). */
export const FEELS_VARIANTS = ['nu', 'zon', 'zon-sterk'] as const
export type FeelsVariant = typeof FEELS_VARIANTS[number]
export const FEELS_Q_FACTOR: Record<FeelsVariant, number> = { nu: 0, zon: 1, 'zon-sterk': 2 }

const WIND_CHILL_MAX_C = 10
const WIND_CHILL_MIN_WIND_MS = 1.3
const FEELS_LIKE_BLEND_C = 5
// ISO 7726: kortgolvige absorptie van huid en kleding.
const BODY_SHORTWAVE_ABSORPTIVITY = 0.7
// Onder deze gemiddelde zonshoogte in het uur is de Erbs-splitsing ruis; de directe bundel telt dan niet.
const MIN_HOUR_SUN_SIN = Math.sin(3 * Math.PI / 180)
const MAX_DIRECT_NORMAL_W_M2 = 1_000
const SOLAR_CONSTANT = 1361

export function vapourPressureHpa(temperatureC: number, relativeHumidity: number): number {
  return Math.min(1, Math.max(0, relativeHumidity)) * 6.105 * Math.exp(17.27 * temperatureC / (237.7 + temperatureC))
}

/** KNMI JAG/TI, TR-309 vgl. 2.3; onder 1,3 m/s gelijk aan T. */
export function windChillC(temperatureC: number, windMs: number): number {
  if (windMs < WIND_CHILL_MIN_WIND_MS) return temperatureC
  const windFactor = (windMs * 3.6) ** 0.16
  return 13.12 + 0.6215 * temperatureC - 11.37 * windFactor + 0.3965 * temperatureC * windFactor
}

/** BoM-vorm zonder straling (MIP-10, nu in de ingest). */
export function apparentShadeC(temperatureC: number, relativeHumidity: number, windMs: number): number {
  return temperatureC + 0.33 * vapourPressureHpa(temperatureC, relativeHumidity) - 0.70 * windMs - 4.00
}

/** BoM-vorm met straling (Steadman 1994); `q` in W/m² lichaamsoppervlak. */
export function apparentSunC(temperatureC: number, relativeHumidity: number, windMs: number, q: number): number {
  return temperatureC + 0.348 * vapourPressureHpa(temperatureC, relativeHumidity) - 0.70 * windMs + 0.70 * Math.max(0, q) / (windMs + 10) - 4.25
}

function blendWeight(temperatureC: number): number {
  return Math.min(1, Math.max(0, (temperatureC - WIND_CHILL_MAX_C) / FEELS_LIKE_BLEND_C))
}

/** Gelijk aan `feels_like_c` in crates/ingest/src/pipeline.rs (MIP-10). */
export function feelsLikeC(temperatureC: number, relativeHumidity: number, windMs: number): number {
  const weight = blendWeight(temperatureC)
  if (weight === 0) return windChillC(temperatureC, windMs)
  const apparent = apparentShadeC(temperatureC, relativeHumidity, windMs)
  return weight === 1 ? apparent : windChillC(temperatureC, windMs) * (1 - weight) + apparent * weight
}

/** MIP-41: dezelfde overgang, met de stralingsvorm boven de windchill-zone. */
export function feelsLikeSunC(temperatureC: number, relativeHumidity: number, windMs: number, q: number): number {
  const weight = blendWeight(temperatureC)
  if (weight === 0) return windChillC(temperatureC, windMs)
  const apparent = apparentSunC(temperatureC, relativeHumidity, windMs, q)
  return weight === 1 ? apparent : windChillC(temperatureC, windMs) * (1 - weight) + apparent * weight
}

/** Projectiefactor van een staande persoon voor de directe bundel (Underwood & Ward 1966, zoals in RayMan/SOLWEIG). */
export function standingProjectedAreaFactor(sinElevation: number): number {
  if (sinElevation <= 0) return 0
  const degrees = Math.asin(Math.min(1, sinElevation)) * 180 / Math.PI
  return 0.308 * Math.cos(degrees * (1 - degrees ** 2 / 48_402) * Math.PI / 180)
}

/** Q: door een staande persoon geabsorbeerde directe zon per m² lichaam, uit de directe normaalstraling. */
export function absorbedSunQ(directNormalWm2: number, sinElevation: number): number {
  return BODY_SHORTWAVE_ABSORPTIVITY * standingProjectedAreaFactor(sinElevation) * Math.max(0, directNormalWm2)
}

function extraterrestrial(epoch: number): number {
  const year = new Date(epoch).getUTCFullYear()
  const dayOfYear = Math.floor((epoch - Date.UTC(year, 0, 1)) / 86_400_000) + 1
  return SOLAR_CONSTANT * (1 + 0.033 * Math.cos(2 * Math.PI * dayOfYear / 365))
}

/**
 * Directe normaalstraling als gemiddelde over het uur dat eindigt op `end`, uit het HARMONIE-uurgemiddelde van de
 * globale straling: helderheidsindex op het uur, Erbs splitst diffuus en direct.
 */
export function directNormalFromGlobalHour(globalMean: number, end: number, sinElevation: (epoch: number) => number): number {
  if (!(globalMean > 0)) return 0
  let mu = 0
  for (const epoch of hourSubstepEpochs(end)) mu += Math.max(0, sinElevation(epoch)) / HOUR_SUBSTEPS
  if (mu < MIN_HOUR_SUN_SIN) return 0
  const clearness = Math.min(1, globalMean / (extraterrestrial(end) * mu))
  const directHorizontal = globalMean * (1 - erbsDiffuseFraction(clearness))
  return Math.min(MAX_DIRECT_NORMAL_W_M2, directHorizontal / mu)
}

/**
 * Q op tijdstip `epoch`: de directe normaalstraling van de uren die eindigen op `epoch` en een uur later (zo ligt
 * het midden op `epoch`), op de zonshoogte van dat moment. Ontbreekt één uur, dan telt het andere.
 */
export function sunQAt(
  epoch: number,
  hourEndingAt: number | null | undefined,
  hourEndingAfter: number | null | undefined,
  sinElevation: (epoch: number) => number,
): number {
  const sinNow = sinElevation(epoch)
  if (sinNow <= 0) return 0
  const directs = [
    hourEndingAt == null ? undefined : directNormalFromGlobalHour(hourEndingAt, epoch, sinElevation),
    hourEndingAfter == null ? undefined : directNormalFromGlobalHour(hourEndingAfter, epoch + 3_600_000, sinElevation),
  ].filter((value): value is number => value !== undefined)
  if (!directs.length) return 0
  return absorbedSunQ(directs.reduce((sum, value) => sum + value, 0) / directs.length, sinNow)
}
