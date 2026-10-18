import { describe, expect, it } from 'vitest'
import { solarElevationSin } from './solar'
import { sunshineLabel, sunshineMinutes, sunshinePossibleShare } from './sunshine'

describe('sunshineMinutes', () => {
  // Uit `uv run python s1_reference.py` in tools/zonneschijn: evaluate.py met 6 substappen en dezelfde parameters.
  const reference: Array<[string, number, number, number, number]> = [
    ['2026-06-21T12:00:00Z', 5.18, 52.10, 820, 59.1290],
    ['2026-06-21T12:00:00Z', 5.18, 52.10, 450, 20.6043],
    ['2026-06-21T12:00:00Z', 5.18, 52.10, 120, 0],
    ['2026-06-21T05:00:00Z', 5.18, 52.10, 150, 60],
    ['2026-06-21T20:00:00Z', 5.18, 52.10, 15, 7.3996],
    ['2026-12-21T09:00:00Z', 6.57, 53.22, 20, 15.0949],
    ['2026-12-21T12:00:00Z', 3.60, 51.45, 200, 56.2355],
    ['2026-10-18T07:00:00Z', 4.90, 52.37, 10, 4.0603],
    ['2026-10-18T22:00:00Z', 4.90, 52.37, 0, 0],
  ]

  it.each(reference)('matches evaluate.py for the hour ending %s at %f, %f with %f W/m²', (time, longitude, latitude, radiation, expected) => {
    const minutes = sunshineMinutes(Date.parse(time), radiation, (epoch) => solarElevationSin(epoch, longitude, latitude))
    expect(minutes).toBeCloseTo(expected, 2)
  })

  it('has no value without radiation', () => {
    expect(sunshineMinutes(Date.parse('2026-06-21T12:00:00Z'), null, (epoch) => solarElevationSin(epoch, 5.18, 52.1))).toBeNull()
  })

  it('only counts the part of the hour with the sun above 4.2°', () => {
    const deBilt = (epoch: number) => solarElevationSin(epoch, 5.18, 52.1)
    expect(sunshinePossibleShare(Date.parse('2026-06-21T12:00:00Z'), deBilt)).toBe(1)
    expect(sunshinePossibleShare(Date.parse('2026-06-21T20:00:00Z'), deBilt)).toBeCloseTo(1 / 3)
    expect(sunshinePossibleShare(Date.parse('2026-06-21T23:00:00Z'), deBilt)).toBe(0)
  })
})

describe('sunshineLabel', () => {
  it('rounds to the given step', () => {
    expect(sunshineLabel(34, 10)).toBe('30 min zon')
    expect(sunshineLabel(35, 10)).toBe('40 min zon')
    expect(sunshineLabel(59.1, 10)).toBe('60 min zon')
    expect(sunshineLabel(4, 10)).toBe('geen zon')
    expect(sunshineLabel(33, 5)).toBe('35 min zon')
  })
})
