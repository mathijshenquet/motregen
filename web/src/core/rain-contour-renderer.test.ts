import { describe, expect, it } from 'vitest'
import type { Grid } from './contract'
import { rainContourWindow, visibleRainSegments } from './rain-contour-renderer'

describe('rain contour visibility', () => {
  it('keeps crossing segments and endpoint opacity while dropping segments wholly outside the padded view', () => {
    const data = Float32Array.of(
      -20, 5, -15, 5, 1, 1,
      -10, 5, 5, 5, 0.3, 0.8,
      3, 3, 7, 7, 1, 1,
      1, 11, 9, 12, 1, 1,
      5, -5, 5, 15, 0.2, 0.6,
    )
    const visible = visibleRainSegments(data, { left: 0, right: 10, top: 0, bottom: 10 })
    expect(visible).toEqual(Float32Array.of(...data.subarray(6, 18), ...data.subarray(24)))
    expect(visibleRainSegments(new Float32Array(), { left: 0, right: 10, top: 0, bottom: 10 })).toHaveLength(0)
  })

  it('expands the geographic view by the motion cap before rejecting geometry', () => {
    const grid: Grid = { crs: 'EPSG:3857', x0: 0, y0: 100_000, dx: 1000, dy: -1000, width: 100, height: 100 }
    const latitude = (row: number) => (2 * Math.atan(Math.exp((grid.y0 + (row + 0.5) * grid.dy) / 6378137)) - Math.PI / 2) * 180 / Math.PI
    const longitude = (column: number) => (column + 0.5) * grid.dx / 6378137 * 180 / Math.PI
    const view = { west: longitude(30), east: longitude(50), north: latitude(20), south: latitude(40) }
    const window = rainContourWindow(grid, view, 15)
    expect(window.left).toBeLessThanOrEqual(15)
    expect(window.right).toBeGreaterThanOrEqual(65)
    expect(window.top).toBeLessThanOrEqual(5)
    expect(window.bottom).toBeGreaterThanOrEqual(55)
    const approaching = Float32Array.of(18, 10, 19, 10, 1, 1)
    expect(visibleRainSegments(approaching, window)).toEqual(approaching)
    expect(visibleRainSegments(approaching, rainContourWindow(grid, view, 0))).toHaveLength(0)
  })
})
