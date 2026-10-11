import { describe, expect, it } from 'vitest'
import { classifyRain, RAIN_BANDS, rainChartMaximum, rainChartPosition, rainColor, rainColormap } from './rain-chart'

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

describe('rain bar colour', () => {
  const rate = (index: number) => 0.01 * (150 / 0.01) ** ((index - 1) / 253)

  it('reads the map overlay table at the mrf byte index of the rate', () => {
    const lut = rainColormap()
    for (const index of [62, 122, 159, 173, 190, 248]) {
      expect(rainColor(rate(index))).toBe(`rgb(${lut[index * 4]}, ${lut[index * 4 + 1]}, ${lut[index * 4 + 2]})`)
    }
    // Het product (U77, PO 2026-10-11): blauw bij lichte regen, rood bij zware.
    expect(rainColor(0.1)).toBe('rgb(64, 152, 238)')
    expect(rainColor(13)).toBe('rgb(213, 36, 52)')
    expect(rainColor(500)).toBe(rainColor(150))
  })

  it('still matches the colour stops from before U77 as palette huidig', () => {
    const before = { palette: 'huidig', blend: 'huidig', theme: 'light' } as const
    expect(rainColor(rate(55), before)).toBe('rgb(54, 183, 255)')
    expect(rainColor(rate(105), before)).toBe('rgb(31, 231, 190)')
    expect(rainColor(rate(150), before)).toBe('rgb(255, 222, 44)')
    expect(rainColor(rate(235), before)).toBe('rgb(188, 45, 214)')
  })

  it('follows the chosen palette and map theme, from the same table as the map', () => {
    const look = { palette: 'blauw-grijs-rood', blend: 'drempel', theme: 'dark' } as const
    const lut = rainColormap(look)
    const index = Math.round(1 + 253 * Math.log(15 / 0.01) / Math.log(150 / 0.01))
    expect(rainColor(15, look)).toBe(`rgb(${lut[index * 4]}, ${lut[index * 4 + 1]}, ${lut[index * 4 + 2]})`)
    expect(rainColor(15, look)).not.toBe(rainColor(15))
    expect(rainColor(15, { ...look, theme: 'light' })).not.toBe(rainColor(15, look))
  })
})
