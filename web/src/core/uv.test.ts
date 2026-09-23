import { describe, expect, it } from 'vitest'
import { solarElevationSin } from './solar'
import { clearSkyRadiation, clearSkyUv, estimateUv, UV_ESTIMATE_SCALE, uvAdvice } from './uv'

describe('UV relevance gating', () => {
  it('does not create an insmeer-chip below zonkracht 3', () => {
    expect(uvAdvice(null)).toBeNull()
    expect(uvAdvice(2.9)).toBeNull()
  })

  it('retains the measured strength from moderate through extreme UV', () => {
    expect(uvAdvice(3)).toEqual({ value: 3, strength: 'matig' })
    expect(uvAdvice(6.2)).toEqual({ value: 6.2, strength: 'sterk' })
    expect(uvAdvice(8)).toEqual({ value: 8, strength: 'zeer sterk' })
    expect(uvAdvice(11)).toEqual({ value: 11, strength: 'extreem' })
  })
})

describe('UV estimate from radiation', () => {
  const noon = Date.parse('2026-06-21T12:00:00Z')
  const deBilt = (epoch: number) => solarElevationSin(epoch, 5.18, 52.1)

  it('follows clear-sky UV under a clear sky and drops under cloud', () => {
    let clear = 0
    for (let step = 0; step < 6; step++) clear += clearSkyRadiation(deBilt(noon - (step + 0.5) * 600_000)) / 6
    const sunny = estimateUv(noon, clear, clear, deBilt)!
    const overcast = estimateUv(noon, clear * 0.2, clear * 0.2, deBilt)!
    expect(sunny).toBeCloseTo(UV_ESTIMATE_SCALE * clearSkyUv(deBilt(noon)), 1)
    expect(sunny).toBeGreaterThan(6)
    expect(overcast).toBeLessThan(sunny * 0.6)
  })

  it('is zero at night and unknown without radiation', () => {
    const midnight = Date.parse('2026-06-21T23:00:00Z')
    expect(estimateUv(midnight, 0, 0, deBilt)).toBe(0)
    expect(estimateUv(noon, null, null, deBilt)).toBeNull()
  })
})
