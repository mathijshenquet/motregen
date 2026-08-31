import { describe, expect, it } from 'vitest'
import {
  particleCountForViewport,
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

  it('uses brighter Beaufort colors on the dark basemap and stronger colors on light', () => {
    const light = windColor(8, 'light')
    const dark = windColor(8, 'dark')
    expect(light).not.toEqual(dark)
    expect(dark[0] + dark[1] + dark[2]).toBeGreaterThan(light[0] + light[1] + light[2])
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
    expect(windLineOffsets(5)).toHaveLength(25)
  })
})
