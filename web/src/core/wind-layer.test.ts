import { describe, expect, it } from 'vitest'
import { WIND_PARTICLES_PER_MEGAPIXEL, WIND_TRAIL_FADE, WIND_TRAIL_OPACITY, windColor } from './wind-layer'

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
    expect(windColor(25, 'light')).not.toEqual(light)
  })
})
