import { describe, expect, it } from 'vitest'
import { classifyRain, RAIN_BANDS, rainChartMaximum, rainChartPosition } from './rain-chart'

describe('rain classification bands', () => {
  it('uses light, moderate and heavy meteorological intensity boundaries', () => {
    expect(RAIN_BANDS.map(({ label, minimum }) => [label, minimum])).toEqual([
      ['Licht', 0], ['Matig', 2.5], ['Zwaar', 7.5],
    ])
    expect(classifyRain(0.09)).toBe('light')
    expect(classifyRain(0.1)).toBe('light')
    expect(classifyRain(2.5)).toBe('moderate')
    expect(classifyRain(7.5)).toBe('heavy')
  })

  it('keeps low rain legible while scaling to the observed peak', () => {
    expect(rainChartMaximum([0, 42, null])).toBe(60)
    expect(rainChartPosition(0, 15)).toBe(0)
    expect(rainChartPosition(0.1, 15)).toBeGreaterThan(0.05)
    expect(rainChartPosition(15, 15)).toBe(1)
  })

  it('gives the light, moderate and heavy classes near-equal visual height', () => {
    const boundaries = [0, 2.5, 7.5, 15].map((value) => rainChartPosition(value, 15))
    expect(boundaries).toEqual([0, 1 / 3, 2 / 3, 1])
    expect(boundaries[1]! - boundaries[0]!).toBeCloseTo(boundaries[2]! - boundaries[1]!)
    expect(boundaries[2]! - boundaries[1]!).toBeCloseTo(boundaries[3]! - boundaries[2]!)
  })
})
