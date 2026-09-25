import { describe, expect, it } from 'vitest'
import { solarElevationSin } from './solar'
import { clearSkyRadiation, clearSkyUv, dailyClearSkyUvMax, estimateUv, uvAdvice, uvLevel, uvReading } from './uv'

describe('UV relevance gating', () => {
  it('does not create an insmeer-chip below zonkracht 3', () => {
    expect(uvAdvice(null)).toBeNull()
    expect(uvAdvice(2.9)).toBeNull()
  })

  it('names the WHO class from moderate through extreme UV', () => {
    expect(uvAdvice(3)).toEqual({ value: 3, strength: 'matig' })
    expect(uvAdvice(6.2)).toEqual({ value: 6.2, strength: 'hoog' })
    expect(uvAdvice(8)).toEqual({ value: 8, strength: 'zeer hoog' })
    expect(uvAdvice(11)).toEqual({ value: 11, strength: 'extreem' })
  })

  it('maps the WHO class boundaries', () => {
    expect([0, 2.9, 3, 5.9, 6, 7.9, 8, 10.9, 11, 14].map((value) => uvLevel(value).level))
      .toEqual(['laag', 'laag', 'matig', 'matig', 'hoog', 'hoog', 'zeer hoog', 'zeer hoog', 'extreem', 'extreem'])
  })
})

describe('clear-sky UV', () => {
  const deBilt = (epoch: number) => solarElevationSin(epoch, 5.18, 52.1)

  // KNMI uvi_clear at De Bilt, noon, June–July 2026: 5.1…7.7 depending on that day's ozone.
  it('lands inside the KNMI midsummer clear-sky noon range in De Bilt', () => {
    const noon = Date.parse('2026-06-21T11:40:00Z')
    expect(clearSkyUv(deBilt(noon), noon)).toBeGreaterThan(5.1)
    expect(clearSkyUv(deBilt(noon), noon)).toBeLessThan(7.7)
  })

  it('is lower in April than at the same sun height in August (ozone)', () => {
    expect(clearSkyUv(0.7, Date.parse('2026-04-12T12:00:00Z'))).toBeLessThan(clearSkyUv(0.7, Date.parse('2026-08-20T12:00:00Z')))
  })
})

describe('UV estimate from radiation', () => {
  const noon = Date.parse('2026-06-21T12:00:00Z')
  const deBilt = (epoch: number) => solarElevationSin(epoch, 5.18, 52.1)
  const clearRadiation = () => {
    let clear = 0
    for (let step = 0; step < 6; step++) clear += clearSkyRadiation(deBilt(noon - (step + 0.5) * 600_000)) / 6
    return clear
  }

  it('follows clear-sky UV under a clear sky and drops under cloud', () => {
    const sunny = estimateUv(noon, clearRadiation(), clearRadiation(), deBilt)!
    const overcast = estimateUv(noon, clearRadiation() * 0.1, clearRadiation() * 0.1, deBilt)!
    expect(sunny).toBeCloseTo(clearSkyUv(deBilt(noon), noon), 1)
    expect(sunny).toBeGreaterThan(6)
    expect(overcast).toBeLessThan(sunny * 0.6)
  })

  it('is zero at night and unknown without radiation', () => {
    const midnight = Date.parse('2026-06-21T23:00:00Z')
    expect(estimateUv(midnight, 0, 0, deBilt)).toBe(0)
    expect(estimateUv(noon, null, null, deBilt)).toBeNull()
  })

  it('scales the KNMI clear-sky value when one is given', () => {
    expect(estimateUv(noon, clearRadiation(), clearRadiation(), deBilt, 5)).toBeCloseTo(5, 1)
  })
})

describe('UV row reading', () => {
  const noon = Date.parse('2026-06-21T12:00:00Z')
  const deBilt = (epoch: number) => solarElevationSin(epoch, 5.18, 52.1)

  it('pairs the KNMI analysis with the KNMI clear-sky value', () => {
    expect(uvReading(noon, 4.2, 6.1, null, null, deBilt, true)).toEqual({ value: 4.2, clear: 6.1, estimated: false, clearEstimated: false })
  })

  it('never shows the clear-sky value below the cloudy one', () => {
    expect(uvReading(noon, 7.9, 7.5, null, null, deBilt, true)!.clear).toBe(7.9)
  })

  it('estimates later hours under the clear-sky value and none in the past', () => {
    const reading = uvReading(noon, null, 6.1, 300, 300, deBilt, true)!
    expect(reading.estimated).toBe(true)
    expect(reading.value).toBeLessThan(reading.clear)
    expect(uvReading(noon, null, 6.1, 300, 300, deBilt, false)).toBeNull()
  })
})

describe('daily UV ceiling', () => {
  it('is the clear-sky UV at the highest sun of that day', () => {
    const day = Date.parse('2026-08-28T00:00:00Z')
    const hours = Array.from({ length: 24 * 6 }, (_, step) => day + step * 600_000)
    const highest = Math.max(...hours.map((epoch) => clearSkyUv(solarElevationSin(epoch, 5.18, 52.1), epoch)))
    expect(dailyClearSkyUvMax(day + 12 * 3_600_000, 52.1)).toBeCloseTo(highest, 1)
    expect(dailyClearSkyUvMax(Date.parse('2026-06-21T12:00:00Z'), 52.1)).toBeGreaterThan(6)
    expect(dailyClearSkyUvMax(Date.parse('2026-12-21T12:00:00Z'), 52.1)).toBeLessThan(1)
  })
})
