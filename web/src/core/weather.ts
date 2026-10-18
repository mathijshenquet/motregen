export type WeatherCondition = 'clear' | 'partly-cloudy' | 'overcast' | 'rain' | 'heavy-rain'
export type DayPeriod = 'day' | 'night'

export interface WeatherIconModel {
  condition: WeatherCondition
  period: DayPeriod
  label: string
  /** Dicht bewolkt: dezelfde wolk, donkerder (U34). */
  dense?: boolean
}

export function deriveWeatherIcon(rainRate: number | null, cloudFraction: number | null, daylight: boolean): WeatherIconModel | null {
  if (rainRate == null || cloudFraction == null) return null
  const period = daylight ? 'day' : 'night'
  if (rainRate >= 7.5) return { condition: 'heavy-rain', period, label: daylight ? 'Zware regen overdag' : 'Zware regen in de nacht' }
  if (rainRate >= 0.1) return { condition: 'rain', period, label: daylight ? 'Regen overdag' : 'Regen in de nacht' }
  // Vier bewolkingsstappen (PO 2026-09-25 live, U34; was drie met de grens op 70 %).
  if (cloudFraction < 20) return { condition: 'clear', period, label: daylight ? 'Helder' : 'Heldere nacht' }
  if (cloudFraction < 50) return { condition: 'partly-cloudy', period, label: daylight ? 'Licht bewolkt' : 'Licht bewolkt in de nacht' }
  if (cloudFraction < 80) return { condition: 'overcast', period, label: 'Bewolkt' }
  return { condition: 'overcast', period, label: 'Zwaar bewolkt', dense: true }
}

// Dagicoon (U91): regen vanaf 0,5 mm per dag, de grens waarop de lijst ook een hoeveelheid toont; zware regen
// vanaf 10 mm. Altijd het dagicoon.
const DAY_RAIN_MM = 0.5
const DAY_HEAVY_RAIN_MM = 10

export function deriveDayIcon(precipMm: number | null, cloudFraction: number | null): WeatherIconModel | null {
  if (precipMm == null || cloudFraction == null) return null
  if (precipMm >= DAY_HEAVY_RAIN_MM) return { condition: 'heavy-rain', period: 'day', label: 'Veel regen' }
  if (precipMm >= DAY_RAIN_MM) return { condition: 'rain', period: 'day', label: 'Regen' }
  return deriveWeatherIcon(0, cloudFraction, true)
}

// Onder deze regenkans (ECMWF-ensemble) staat de hoeveelheid uit de hoofdrun gedempt (PO 2026-10-17).
export const UNLIKELY_RAIN_PERCENT = 30

// Grove tabelrijen (U91b): regen vanaf 0,2 mm in het venster, zwaar bij gemiddeld 2 mm/u of meer.
const SPAN_RAIN_MM = 0.2
const SPAN_HEAVY_RAIN_MM_PER_HOUR = 2

export function deriveSpanIcon(precipMm: number | null, cloudFraction: number | null, daylight: boolean, hours: number): WeatherIconModel | null {
  if (precipMm == null || cloudFraction == null) return null
  const rate = precipMm >= SPAN_RAIN_MM ? Math.max(0.1, precipMm / hours) : 0
  return deriveWeatherIcon(rate >= SPAN_HEAVY_RAIN_MM_PER_HOUR ? 7.5 : rate, cloudFraction, daylight)
}

/** Windsamenvatting uit snelheid en meteorologische richting, zoals `summarizeWind` die uit u/v maakt. */
export function summarizeWindFrom(speed: number | null, fromDegrees: number | null, gust: number | null = null, unit: WindUnit = 'bft'): WindSummary | null {
  if (speed == null || fromDegrees == null) return null
  const radians = fromDegrees * Math.PI / 180
  return summarizeWind(-speed * Math.sin(radians), -speed * Math.cos(radians), gust, unit)
}

const beaufortLimits = [0.3, 1.6, 3.4, 5.5, 8, 10.8, 13.9, 17.2, 20.8, 24.5, 28.5, 32.7]
const directions = ['N', 'NO', 'O', 'ZO', 'Z', 'ZW', 'W', 'NW'] as const

export const WIND_UNITS = ['bft', 'kn', 'kmh', 'ms'] as const
export type WindUnit = typeof WIND_UNITS[number]
export const WIND_UNIT_LABELS: Record<WindUnit, string> = { bft: 'Bft', kn: 'kn', kmh: 'km/u', ms: 'm/s' }
const MS_PER_UNIT: Record<Exclude<WindUnit, 'bft'>, number> = { kn: 1852 / 3600, kmh: 1 / 3.6, ms: 1 }

export interface WindSummary {
  speed: number
  beaufort: number
  direction: typeof directions[number]
  /** Meteorologische richting: waar de wind vandaan komt, in graden vanaf noord. */
  fromDegrees: number
  unit: WindUnit
  /** Hoofdwaarde, afgerond in `unit`. */
  value: number
  /**
   * Stoot in dezelfde eenheid als de hoofdwaarde (PO 2026-09-25 live, U34: "3 Bft · 22" zonder eenheid was
   * verwarrend); alleen als hij minstens één eenheidsstap boven de hoofdwaarde ligt (anders ruis).
   */
  gust: number | null
}

export function summarizeWind(u: number | null, v: number | null, gust: number | null = null, unit: WindUnit = 'bft'): WindSummary | null {
  if (u == null || v == null) return null
  const speed = Math.hypot(u, v)
  const beaufort = beaufortOf(speed)
  const fromDegrees = (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360
  const value = unit === 'bft' ? beaufort : Math.round(speed / MS_PER_UNIT[unit])
  const gustStep = gust == null ? null : unit === 'bft' ? beaufortOf(gust) : Math.round(gust / MS_PER_UNIT[unit])
  return {
    speed,
    beaufort,
    direction: directions[Math.round(fromDegrees / 45) % directions.length]!,
    fromDegrees,
    unit,
    value,
    gust: gustStep != null && gustStep >= value + 1 ? gustStep : null,
  }
}

function beaufortOf(speed: number): number {
  const beaufort = beaufortLimits.findIndex((limit) => speed < limit)
  return beaufort < 0 ? 12 : beaufort
}
