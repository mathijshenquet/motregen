import { describe, expect, it } from 'vitest'
import type { Grid } from './contract'
import { IsolineLayer, oddLine } from './isoline-layer'

const grid = { width: 2, height: 2, x0: 0, y0: 0, dx: 1, dy: -1 } as unknown as Grid
const style = { step: 1, odd: 'half' as const, color: [0, 0, 0] as [number, number, number], window: 1, bicubic: true, fade: 1, gradient: [0.02, 0.06] as [number, number], speed: [80, 250] as [number, number], vector: false, ringKm: 0, tolerancePx: 0.25 }

describe('IsolineLayer frame identity', () => {
  it('reports only the hour layers whose run or frame changed after a manifest refresh', () => {
    const layer = new IsolineLayer(grid, 3, style)
    expect(layer.setFrameKeys(['a#0', 'a#1', 'a#2'])).toEqual([0, 1, 2])
    expect(layer.setFrameKeys(['a#0', 'a#1', 'a#2'])).toEqual([])
    expect(layer.setFrameKeys(['a#0', 'b#0', 'b#1'])).toEqual([1, 2])
    expect(layer.frameKey(1)).toBe('b#0')
    expect(layer.hasLayer(1)).toBe(false)
  })
})

describe('odd isolines', () => {
  it('draws half width, but never thinner than 1 px: the rest goes into alpha', () => {
    // DPR 1, z5 (1,3 px) resp. z9 (2 px); DPR 2, z9 (4 px).
    expect(oddLine('half', 1.3)).toEqual({ halfWidth: 0.5, alpha: 0.65 })
    expect(oddLine('half', 2)).toEqual({ halfWidth: 0.5, alpha: 1 })
    expect(oddLine('half', 4)).toEqual({ halfWidth: 1, alpha: 1 })
    expect(oddLine('equal', 1.3)).toEqual({ halfWidth: 0.65, alpha: 1 })
    expect(oddLine('dash', 4)).toEqual({ halfWidth: 2, alpha: 1 })
  })

  it('keeps the summed coverage constant as a line slides across pixel centres (no flicker)', () => {
    // Dekking van de lijnshader per pixel: clamp(hw + 0,5 − d) · alpha, opgeteld over een kolom.
    const ink = (halfWidth: number, alpha: number, shift: number) => {
      let sum = 0
      for (let pixel = -4; pixel <= 4; pixel++) sum += Math.max(0, Math.min(1, halfWidth + 0.5 - Math.abs(pixel - shift))) * alpha
      return sum
    }
    const spread = (halfWidth: number, alpha: number) => {
      const values = Array.from({ length: 11 }, (_, index) => ink(halfWidth, alpha, index / 10))
      return (Math.max(...values) - Math.min(...values)) / Math.max(...values)
    }
    const { halfWidth, alpha } = oddLine('half', 1.3)
    expect(spread(halfWidth, alpha)).toBeLessThan(1e-9)
    // Naïef 0,65 px breed: > 20 % lichter tussen twee pixelmiddens.
    expect(spread(0.325, 1)).toBeGreaterThan(0.2)
  })
})
