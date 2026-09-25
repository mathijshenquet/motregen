import { describe, expect, it } from 'vitest'
import type { Grid } from './contract'
import { isolineWidthCss, IsolineLayer, lineProfile, traceDue, traceTimes } from './isoline-layer'

const grid = { width: 2, height: 2, x0: 0, y0: 0, dx: 1, dy: -1 } as unknown as Grid
const style = { step: 1, fill: 0.7, color: [0, 0, 0] as [number, number, number], gradientFade: true }

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

describe('isoline width', () => {
  it('is one weight, 0.7× the old 1.3–2.0 CSS px', () => {
    expect(isolineWidthCss(4)).toBeCloseTo(0.9, 9)
    expect(isolineWidthCss(7)).toBeCloseTo(1.15, 9)
    expect(isolineWidthCss(10)).toBeCloseTo(1.4, 9)
  })

  it('never draws thinner than 1 px: the rest goes into alpha', () => {
    expect(lineProfile(0.9)).toEqual({ halfWidth: 0.5, alpha: 0.9 })
    expect(lineProfile(1)).toEqual({ halfWidth: 0.5, alpha: 1 })
    expect(lineProfile(2.8)).toEqual({ halfWidth: 1.4, alpha: 1 })
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
    const { halfWidth, alpha } = lineProfile(0.9)
    expect(spread(halfWidth, alpha)).toBeLessThan(1e-9)
    // Naïef 0,9 px breed: lichter tussen twee pixelmiddens.
    expect(spread(0.45, 1)).toBeGreaterThan(0.05)
  })
})

describe('trace times (U34: continu, begrensde cadans)', () => {
  it('traces the exact tweened slice, at rest and while playing', () => {
    expect(traceTimes(3.4, 10)).toEqual([3.4])
    expect(traceTimes(3.41, 10)).toEqual([3.41])
  })

  it('stays inside the volume at its end', () => {
    expect(traceTimes(9, 10)).toEqual([9])
    expect(traceTimes(12, 10)).toEqual([9])
  })

  it('limits new traces to a given rate while playing, and traces at once at rest', () => {
    expect(traceDue(1_000, 950, true, 15)).toBe(false)
    expect(traceDue(1_000, 930, true, 15)).toBe(true)
    expect(traceDue(1_000, 999, false, 15)).toBe(true)
    let last = -Infinity
    let traces = 0
    for (let now = 0; now < 1_000; now += 1_000 / 60) if (traceDue(now, last, true, 15)) { traces++; last = now }
    expect(traces).toBeLessThanOrEqual(15)
    expect(traces).toBeGreaterThanOrEqual(12)
  })
})
