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

export interface WindSummary {
  speed: number
  beaufort: number
  direction: typeof directions[number]
}

export function summarizeWind(u: number | null, v: number | null): WindSummary | null {
  if (u == null || v == null) return null
  const speed = Math.hypot(u, v)
  const beaufort = beaufortLimits.findIndex((limit) => speed < limit)
  const fromDegrees = (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360
  return {
    speed,
    beaufort: beaufort < 0 ? 12 : beaufort,
    direction: directions[Math.round(fromDegrees / 45) % directions.length]!,
  }
}
