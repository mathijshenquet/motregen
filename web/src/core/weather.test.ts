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
})
