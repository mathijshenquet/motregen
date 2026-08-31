import { describe, expect, it } from 'vitest'
import {
  particleCountForViewport,
  trailUvTransform,
  trailTargetSize,
  WIND_PARTICLES_PER_MEGAPIXEL,
  WIND_TRAIL_FADE,
  WIND_TRAIL_OPACITY,
  windColor,
  windLineOffsets,
  windZoomCompensation,
} from './wind-layer'

describe('wind trail presentation', () => {
  it('pins visible but persistent trail tunables below a dense Windy field', () => {
    expect(WIND_TRAIL_FADE).toBeGreaterThanOrEqual(0.94)
    expect(WIND_TRAIL_FADE).toBeLessThanOrEqual(0.97)
    expect(WIND_TRAIL_OPACITY).toBe(0.6)
    expect(WIND_PARTICLES_PER_MEGAPIXEL).toBeLessThan(1_000)
  })

  it('uses white particles on dark and the Beaufort contrast ramp on light', () => {
    const light = windColor(8, 'light')
    const dark = windColor(8, 'dark')
    expect(light).not.toEqual(dark)
    expect(dark).toEqual([1, 1, 1])
    expect(Math.max(...light)).toBeLessThan(0.65)
    expect(windColor(25, 'light')).not.toEqual(light)
  })

  it('matches the device-pixel canvas and keeps particle density tied to screen area', () => {
    expect(trailTargetSize(1170, 2532, 4096)).toEqual([1170, 2532])
    expect(trailTargetSize(5000, 2500, 4096)).toEqual([4096, 2048])
    expect(particleCountForViewport(1_000, 1_000)).toBe(620)
    expect(particleCountForViewport(500, 500)).toBeLessThan(620)
    expect(particleCountForViewport(1_000, 1_000, 1_200)).toBe(1_200)
  })

  it('cancels map zoom so equal wind keeps equal screen speed and trail length', () => {
    expect(windZoomCompensation(6.4)).toBe(1)
    expect(windZoomCompensation(7.4)).toBeCloseTo(0.5)
    expect(windZoomCompensation(5.4)).toBeCloseTo(2)
  })

  it('expands trail thickness in screen pixels', () => {
    expect(windLineOffsets(1)).toEqual([[0, 0]])
    expect(windLineOffsets(2)).toHaveLength(4)
    expect(windLineOffsets(2.5)).toEqual([
      [-0.75, -0.75], [0, -0.75], [0.75, -0.75],
      [-0.75, 0], [0, 0], [0.75, 0],
      [-0.75, 0.75], [0, 0.75], [0.75, 0.75],
    ])
    expect(windLineOffsets(5)).toHaveLength(25)
  })

  it('reprojects accumulated trails with pan and zoom instead of pinning them to the viewport', () => {
    const view = { centerX: 0.5, centerY: 0.5, zoom: 6, width: 512, height: 512 }
    expect(trailUvTransform(view, view)).toEqual({ scaleX: 1, scaleY: 1, offsetX: 0, offsetY: 0 })
    expect(trailUvTransform(view, { ...view, zoom: 7 })).toEqual({ scaleX: 0.5, scaleY: 0.5, offsetX: 0.25, offsetY: 0.25 })
    const panned = trailUvTransform(view, { ...view, centerX: 0.51, centerY: 0.49 })
    expect(panned.offsetX).toBeCloseTo(0.64)
    expect(panned.offsetY).toBeCloseTo(0.64)
  })
})
