import { describe, expect, it } from 'vitest'
import { deriveWeatherIcon, summarizeWind } from './weather'

describe('hourly weather derivation', () => {
  it('derives day/night icon variants from rain and cloud cover', () => {
    expect(deriveWeatherIcon(0, 10, true)).toMatchObject({ condition: 'clear', period: 'day' })
    expect(deriveWeatherIcon(0, 45, false)).toMatchObject({ condition: 'partly-cloudy', period: 'night' })
    expect(deriveWeatherIcon(1.2, 90, false)).toMatchObject({ condition: 'rain', period: 'night' })
    expect(deriveWeatherIcon(8, 40, true)).toMatchObject({ condition: 'heavy-rain', period: 'day' })
    expect(deriveWeatherIcon(0, null, true)).toBeNull()
  })

  it('reports meteorological origin and Beaufort from vector components', () => {
    expect(summarizeWind(5, 0)).toMatchObject({ direction: 'W', beaufort: 3 })
    expect(summarizeWind(0, -1)).toMatchObject({ direction: 'N', beaufort: 1 })
    expect(summarizeWind(null, 1)).toBeNull()
  })

  it('rounds the mean wind in the chosen unit', () => {
    expect(summarizeWind(5, 0, null, 'bft')).toMatchObject({ value: 3, unit: 'bft' })
    expect(summarizeWind(5, 0, null, 'kn')).toMatchObject({ value: 10, unit: 'kn' })
    expect(summarizeWind(5, 0, null, 'kmh')).toMatchObject({ value: 18, unit: 'kmh' })
    expect(summarizeWind(5, 0, null, 'ms')).toMatchObject({ value: 5, unit: 'ms' })
  })

  it('shows a gust one unit step above the mean, in km/u next to Bft', () => {
    expect(summarizeWind(5, 0, 12.5, 'bft')).toMatchObject({ value: 3, gust: 45, gustUnit: 'kmh' })
    expect(summarizeWind(5, 0, 12.5, 'kn')).toMatchObject({ value: 10, gust: 24, gustUnit: 'kn' })
    expect(summarizeWind(5, 0, 12.5, 'kmh')).toMatchObject({ value: 18, gust: 45, gustUnit: 'kmh' })
    expect(summarizeWind(5, 0, 12.5, 'ms')).toMatchObject({ value: 5, gust: 13, gustUnit: 'ms' })
  })

  it('hides a gust that is within one unit step of the mean', () => {
    expect(summarizeWind(5, 0, 5.4, 'bft')?.gust).toBeNull()
    expect(summarizeWind(5, 0, 5.4, 'ms')?.gust).toBeNull()
    expect(summarizeWind(5, 0, 5.2, 'kn')?.gust).toBeNull()
    expect(summarizeWind(5, 0, 5.3, 'kmh')?.gust).toBe(19)
    expect(summarizeWind(5, 0, null, 'kmh')?.gust).toBeNull()
  })
})
