import { describe, expect, it } from 'vitest'
import type { MrfHeader } from './contract'
import { pointValue, pointValueBilinear } from './point-value'

// 2 × 2 cellen van 10 m; quant-index = waarde, 255 = no-data.
const header = {
  version: 0,
  grid: { crs: 'EPSG:3857', x0: 0, y0: 20, dx: 10, dy: -10, width: 2, height: 2 },
  quant: [...Array.from({ length: 255 }, (_, index) => index), null],
  source: 'ecmwf',
  run: '2026-10-17T00:00:00Z',
  frames: [],
  dict: null,
} as MrfHeader

describe('bilinear point value', () => {
  const field = Uint8Array.from([0, 10, 20, 30])

  it('mixes the four surrounding cell centres and matches a centre exactly', () => {
    expect(pointValueBilinear(header, field, 5, 15)).toBe(0)
    expect(pointValueBilinear(header, field, 10, 10)).toBe(15)
    expect(pointValueBilinear(header, field, 7.5, 15)).toBe(2.5)
    expect(pointValue(header, field, 7.5, 15)).toBe(0)
  })

  it('reweighs around missing cells and stays null outside the grid', () => {
    expect(pointValueBilinear(header, Uint8Array.from([0, 255, 20, 30]), 10, 10)).toBeCloseTo(50 / 3)
    expect(pointValueBilinear(header, field, -10, 10)).toBeNull()
  })
})
