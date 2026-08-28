import { describe, expect, it } from 'vitest'
import { nightAmount, terminatorOpacity } from './day-night-layer'

describe('day/night layer', () => {
  it('keeps the night shading subtler in dark mode', () => {
    expect(terminatorOpacity('dark')).toBeLessThan(terminatorOpacity('light'))
    expect(terminatorOpacity('light')).toBeLessThan(0.25)
  })

  it('moves continuously from day through the soft terminator into night', () => {
    const noon = nightAmount(Date.parse('2026-03-20T12:00:00Z'), 0, 0)
    const sunrise = nightAmount(Date.parse('2026-03-20T06:00:00Z'), 0, 0)
    const midnight = nightAmount(Date.parse('2026-03-20T00:00:00Z'), 0, 0)
    expect(noon).toBe(0)
    expect(sunrise).toBeGreaterThan(0.1)
    expect(sunrise).toBeLessThan(0.9)
    expect(midnight).toBe(1)
  })
})
