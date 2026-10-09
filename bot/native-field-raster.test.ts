import { expect, it } from 'vitest'
import type { Grid } from '../web/src/core/contract.js'
import { sampleSlice } from '../web/src/core/isoline-spline.js'
import { NativeFieldRaster } from './native-field-raster.js'
import { nativeProjection } from './native-projection.js'
import { NATIVE_VIEW } from './native-view.js'
import type { TemperatureSlice } from './native-temperature.js'

it('matches shared cubic sampling and premultiplied band fill, including invalid coverage and edge fade', async () => {
  const meters = 2 * Math.PI * 6378137 / (512 * 2 ** NATIVE_VIEW.zoom * (18 / 640))
  const grid: Grid = { crs: 'EPSG:3857', x0: NATIVE_VIEW.lng * Math.PI / 180 * 6378137 - 9 * meters, y0: Math.log(Math.tan(Math.PI / 4 + NATIVE_VIEW.lat * Math.PI / 360)) * 6378137 + 9 * meters, dx: meters, dy: -meters, width: 18, height: 18 }
  const field = { values: Float32Array.from({ length: 324 }, (_, index) => 2 + index % 18 * 0.16), valid: new Float32Array(324).fill(1) }
  const colors = Float32Array.from({ length: 768 }, (_, index) => (Math.floor(index / 3) % 11 + index % 3) / 15)
  const slice: TemperatureSlice = { grid, field, colors, contours: [], segments: new Float32Array(), opacity: 0.75, kind: 'temperature', step: 1 }
  const size = { width: 18, height: 18 }
  const raster = new NativeFieldRaster(grid, size)
  const base = Buffer.alloc(18 * 18 * 3, 100)
  try {
    const native = await raster.compose(base, slice, false)
    const projection = nativeProjection(grid, size)
    const alpha = Math.round(255 * 0.35 * slice.opacity)
    const fill = new Uint8Array(6 * 6 * 3)
    for (let row = 0; row < 6; row++) for (let column = 0; column < 6; column++) {
      const sample = sampleSlice({ ...grid, fields: [field], weights: [1] }, projection.columns[column * 3]! + 1, projection.rows[row * 3]! + 1)
      const band = Math.floor(sample.value) + 128
      for (let channel = 0; channel < 3; channel++) fill[(row * 6 + column) * 3 + channel] = Math.round(colors[band * 3 + channel]! * 255 * 0.35 * slice.opacity)
    }
    for (let row = 0; row < 18; row++) for (let column = 0; column < 18; column++) {
      const sourceX = Math.max(0, Math.min(5, (column + 0.5) / 3 - 0.5)), sourceY = Math.max(0, Math.min(5, (row + 0.5) / 3 - 0.5))
      const west = Math.floor(sourceX), north = Math.floor(sourceY), east = Math.min(5, west + 1), south = Math.min(5, north + 1)
      const horizontal = sourceX - west, vertical = sourceY - north
      for (let channel = 0; channel < 3; channel++) {
        const at = (x: number, y: number) => fill[(y * 6 + x) * 3 + channel]!
        const northern = at(west, north) * (1 - horizontal) + at(east, north) * horizontal
        const southern = at(west, south) * (1 - horizontal) + at(east, south) * horizontal
        const expected = Math.round(100 * (1 - alpha / 255) + northern * (1 - vertical) + southern * vertical)
        expect(Math.abs(native[(row * 18 + column) * 3 + channel]! - expected)).toBeLessThanOrEqual(1)
      }
    }
    expect(await raster.compose(base, { ...slice, opacity: 0 }, true)).toEqual(base)
    expect(await raster.compose(base, { ...slice, field: { ...field, valid: new Float32Array(324) } }, false)).toEqual(base)
    await expect(raster.compose(Buffer.alloc(1), slice, false)).rejects.toThrow('framemaat')
  } finally { await raster.close() }
}, 15000)
