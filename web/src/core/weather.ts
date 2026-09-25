export type WeatherCondition = 'clear' | 'partly-cloudy' | 'overcast' | 'rain' | 'heavy-rain'
export type DayPeriod = 'day' | 'night'

export interface WeatherIconModel {
  condition: WeatherCondition
  period: DayPeriod
  label: string
}

export function deriveWeatherIcon(rainRate: number | null, cloudFraction: number | null, daylight: boolean): WeatherIconModel | null {
  if (rainRate == null || cloudFraction == null) return null
  const period = daylight ? 'day' : 'night'
  if (rainRate >= 7.5) return { condition: 'heavy-rain', period, label: daylight ? 'Zware regen overdag' : 'Zware regen in de nacht' }
  if (rainRate >= 0.1) return { condition: 'rain', period, label: daylight ? 'Regen overdag' : 'Regen in de nacht' }
  if (cloudFraction < 20) return { condition: 'clear', period, label: daylight ? 'Helder' : 'Heldere nacht' }
  if (cloudFraction < 70) return { condition: 'partly-cloudy', period, label: daylight ? 'Half bewolkt' : 'Licht bewolkt in de nacht' }
  return { condition: 'overcast', period, label: 'Bewolkt' }
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
