import { expect, it } from 'vitest'
import type { Grid } from '../web/src/core/contract.js'
import { sampleSlice } from '../web/src/core/isoline-spline.js'
import { NativeFieldRaster } from './native-field-raster.js'
import { nativeProjection } from './native-projection.js'
import { NATIVE_VIEW } from './native-view.js'
import type { TemperatureSlice } from './native-temperature.js'

it('matches shared cubic sampling and premultiplied band fill, including invalid coverage and edge fade', async () => {
  const meters = 2 * Math.PI * 6378137 / (512 * 2 ** NATIVE_VIEW.zoom * (16 / 640))
  const grid: Grid = { crs: 'EPSG:3857', x0: NATIVE_VIEW.lng * Math.PI / 180 * 6378137 - 8 * meters, y0: Math.log(Math.tan(Math.PI / 4 + NATIVE_VIEW.lat * Math.PI / 360)) * 6378137 + 8 * meters, dx: meters, dy: -meters, width: 16, height: 16 }
  const field = { values: Float32Array.from({ length: 256 }, (_, index) => 2 + index % 16 * 0.16), valid: new Float32Array(256).fill(1) }
  const colors = Float32Array.from({ length: 768 }, (_, index) => (Math.floor(index / 3) % 11 + index % 3) / 15)
  const slice: TemperatureSlice = { grid, field, colors, contours: [], segments: new Float32Array(), opacity: 0.75, kind: 'temperature', step: 1 }
  const size = { width: 16, height: 16 }
  const raster = new NativeFieldRaster(grid, size)
  const base = Buffer.alloc(16 * 16 * 3, 100)
  try {
    const native = await raster.compose(base, slice, false)
    const projection = nativeProjection(grid, size)
    for (let row = 0; row < 16; row++) for (let column = 0; column < 16; column++) {
      const sample = sampleSlice({ ...grid, fields: [field], weights: [1] }, projection.columns[column]!, projection.rows[row]!)
      const band = Math.floor(sample.value) + 128
      for (let channel = 0; channel < 3; channel++) {
        const expected = Math.round(100 * (1 - 0.35 * slice.opacity) + colors[band * 3 + channel]! * 255 * 0.35 * slice.opacity)
        expect(Math.abs(native[(row * 16 + column) * 3 + channel]! - expected)).toBeLessThanOrEqual(1)
      }
    }
    expect(await raster.compose(base, { ...slice, opacity: 0 }, true)).toEqual(base)
    expect(await raster.compose(base, { ...slice, field: { ...field, valid: new Float32Array(256) } }, false)).toEqual(base)
    await expect(raster.compose(Buffer.alloc(1), slice, false)).rejects.toThrow('framemaat')
  } finally { await raster.close() }
}, 15000)
