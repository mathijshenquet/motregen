import type { Grid } from '../web/src/core/contract.js'
import { FRAME_PIXELS } from './config.js'
import { NATIVE_VIEW } from './native-view.js'

export function nativeProjection(grid: Grid, size = FRAME_PIXELS) {
  const radius = 6378137
  const metersPerPixel = 2 * Math.PI * radius / (512 * 2 ** NATIVE_VIEW.zoom * size.width / 640)
  const centerX = NATIVE_VIEW.lng * Math.PI / 180 * radius
  const centerY = Math.log(Math.tan(Math.PI / 4 + NATIVE_VIEW.lat * Math.PI / 360)) * radius
  const columns = Float64Array.from({ length: size.width }, (_, column) => (centerX + (column + 0.5 - size.width / 2) * metersPerPixel - grid.x0) / grid.dx - 0.5)
  const rows = Float64Array.from({ length: size.height }, (_, row) => (centerY - (row + 0.5 - size.height / 2) * metersPerPixel - grid.y0) / grid.dy - 0.5)
  return {
    columns, rows,
    bounds: { west: (centerX - size.width / 2 * metersPerPixel) / radius * 180 / Math.PI, east: (centerX + size.width / 2 * metersPerPixel) / radius * 180 / Math.PI, south: (2 * Math.atan(Math.exp((centerY - size.height / 2 * metersPerPixel) / radius)) - Math.PI / 2) * 180 / Math.PI, north: (2 * Math.atan(Math.exp((centerY + size.height / 2 * metersPerPixel) / radius)) - Math.PI / 2) * 180 / Math.PI },
    point: (column: number, row: number): [number, number] => [(column - columns[0]!) * grid.dx / metersPerPixel + 0.5, -(row - rows[0]!) * grid.dy / metersPerPixel + 0.5],
    cellsPerPixel: metersPerPixel / Math.abs(grid.dx),
  }
}
