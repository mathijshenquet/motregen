import { describe, expect, it } from 'vitest'
import { mapFrameFromGrid, NETHERLANDS_FLANDERS_BOUNDS, paddedGeographicBounds } from './map-frame'

describe('map frame', () => {
  it('derives its data edge, movement bounds and mask from arbitrary header grids', () => {
    const frame = mapFrameFromGrid({ crs: 'EPSG:3857', x0: 0, y0: 7_600_000, dx: 1_000, dy: -1_000, width: 1_250, height: 1_350 })

    expect(frame.dataBounds.west).toBeCloseTo(0)
    expect(frame.dataBounds.east).toBeCloseTo(11.23, 1)
    expect(frame.maxBounds[0][0]).toBeLessThan(frame.dataBounds.west)
    expect(frame.maxBounds[1][1]).toBeGreaterThan(frame.dataBounds.north)
    expect(frame.mask.geometry.coordinates).toHaveLength(2)
    expect(frame.mask.geometry.coordinates[1]?.[0]).toEqual(frame.mask.geometry.coordinates[1]?.at(-1))
  })

  it('pads the Netherlands and Flanders focus bounds by a tunable fraction on every side', () => {
    const bounds = paddedGeographicBounds(NETHERLANDS_FLANDERS_BOUNDS, { west: 0.05, south: 0.1, east: 0.15, north: 0.1 })

    expect(bounds[0][0]).toBeCloseTo(2.2635)
    expect(bounds[0][1]).toBeCloseTo(50.381)
    expect(bounds[1][0]).toBeCloseTo(7.9395)
    expect(bounds[1][1]).toBeCloseTo(53.849)
  })
})
