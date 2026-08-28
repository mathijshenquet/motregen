import { describe, expect, it } from 'vitest'
import { classifyRain, RAIN_BANDS, rainChartMaximum, rainChartPosition } from './rain-chart'

describe('rain classification bands', () => {
  it('uses dry, light, moderate and heavy meteorological intensity boundaries', () => {
    expect(RAIN_BANDS.map(({ label, minimum }) => [label, minimum])).toEqual([
      ['Droog', 0], ['Licht', 0.1], ['Matig', 2.5], ['Zwaar', 7.5],
    ])
    expect(classifyRain(0.09)).toBe('dry')
    expect(classifyRain(0.1)).toBe('light')
    expect(classifyRain(2.5)).toBe('moderate')
    expect(classifyRain(7.5)).toBe('heavy')
  })

  it('keeps low rain legible while scaling to the observed peak', () => {
    expect(rainChartMaximum([0, 42, null])).toBe(60)
    expect(rainChartPosition(0, 15)).toBe(0)
    expect(rainChartPosition(0.1, 15)).toBeGreaterThan(0.1)
    expect(rainChartPosition(15, 15)).toBe(1)
  })
})
