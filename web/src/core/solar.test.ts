import { describe, expect, it } from 'vitest'
import { solarElevationSin, solarPosition, sunEvents } from './solar'

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

describe('sun events', () => {
  it('finds sunrise and sunset at De Bilt within a minute of the NOAA algorithm', () => {
    const events = sunEvents(Date.parse('2026-09-23T00:00:00Z'), Date.parse('2026-09-24T00:00:00Z'), 5.18, 52.1)
    expect(events.map((event) => event.kind)).toEqual(['rise', 'set'])
    // Python astral 3 (NOAA algorithm), De Bilt 2026-09-23: 05:27:04Z and 17:35:16Z.
    expect(Math.abs(events[0]!.epoch - Date.parse('2026-09-23T05:27:04Z'))).toBeLessThan(60_000)
    expect(Math.abs(events[1]!.epoch - Date.parse('2026-09-23T17:35:16Z'))).toBeLessThan(60_000)
  })

  it('reports no events inside a window that stays dark', () => {
    expect(sunEvents(Date.parse('2026-09-23T20:00:00Z'), Date.parse('2026-09-24T03:00:00Z'), 5.18, 52.1)).toEqual([])
  })
})
