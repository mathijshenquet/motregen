import { describe, expect, it } from 'vitest'
import { solarElevationSin, solarPosition } from './solar'

describe('solar position', () => {
  it('places the equinox sun near the equator and Greenwich around noon UTC', () => {
    const position = solarPosition(Date.parse('2026-03-20T12:00:00Z'))
    expect(position.declination * 180 / Math.PI).toBeCloseTo(0, 0)
    expect(Math.abs(position.subsolarLongitude * 180 / Math.PI)).toBeLessThan(5)
  })

  it('distinguishes day and night at De Bilt from the cursor epoch', () => {
    const noon = solarElevationSin(Date.parse('2026-06-21T12:00:00Z'), 5.18, 52.1)
    const midnight = solarElevationSin(Date.parse('2026-06-21T00:00:00Z'), 5.18, 52.1)
    expect(noon).toBeGreaterThan(0.8)
    expect(midnight).toBeLessThan(0)
  })
})
