import sharp from 'sharp'
import { FRAME, FRAME_PIXELS } from './config.js'
import { nativeProjection } from './native-projection.js'
import { projectToLevel } from '../web/src/core/isoline-spline.js'
import { isolineColor } from '../web/src/core/isolines.js'
import { ringFade } from '../web/src/core/isoline-contours.js'
import type { TemperatureSlice } from './native-temperature.js'
import type { NativeTheme } from './native-map.js'

interface Anchor { column: number; row: number; level: number }

export class NativeIsolineLabels {
  private anchors: Anchor[] = []
  async draw(rgb: Buffer, slice: TemperatureSlice, theme: NativeTheme): Promise<Buffer> {
    const projection = nativeProjection(slice.grid)
    const fieldSlice = { width: slice.grid.width, height: slice.grid.height, fields: [slice.field], weights: [1] }
    const live: Anchor[] = []
    const separated = (column: number, row: number) => live.every((anchor) => Math.hypot(anchor.column - column, anchor.row - row) / projection.cellsPerPixel >= 90 * FRAME.scale)
    for (const anchor of this.anchors) {
      const projected = projectToLevel(fieldSlice, anchor.column, anchor.row, anchor.level, slice.step)
      if (projected && separated(projected.column, projected.row)) live.push({ ...anchor, column: projected.column, row: projected.row })
    }
    const spacing = 260 * FRAME.scale * projection.cellsPerPixel
    for (const contour of slice.contours) {
      if (ringFade(contour, slice.kind === 'pressure' ? 0 : 60) <= 0) continue
      let until = spacing / 2
      for (let index = 2; index < contour.points.length && live.length < 60; index += 2) {
        const ax = contour.points[index - 2]!, ay = contour.points[index - 1]!
        const bx = contour.points[index]!, by = contour.points[index + 1]!
        const length = Math.hypot(bx - ax, by - ay)
        while (until <= length) {
          const weight = until / length
          const column = ax + (bx - ax) * weight, row = ay + (by - ay) * weight
          until += spacing
          const [x, y] = projection.point(column, row)
          if (x < 0 || y < 0 || x > FRAME_PIXELS.width || y > FRAME_PIXELS.height || !separated(column, row)) continue
          live.push({ column, row, level: contour.level })
        }
        until -= length
      }
    }
    this.anchors = live
    const texts = live.map((anchor) => {
      const projected = projectToLevel(fieldSlice, anchor.column, anchor.row, anchor.level, 1)
      if (!projected) return ''
      const [x, y] = projection.point(anchor.column, anchor.row)
      let angle = Math.atan2(projected.sample.gy, projected.sample.gx) * 180 / Math.PI + 90
      if (angle > 90) angle -= 180
      if (angle <= -90) angle += 180
      return `<text x="${x}" y="${y}" transform="rotate(${angle},${x},${y})" text-anchor="middle" dominant-baseline="central">${slice.kind === 'pressure' ? anchor.level : `${anchor.level}°`}</text>`
    }).join('')
    const color = isolineColor(theme, slice.kind), halo = theme === 'dark' ? '#102027' : '#fff'
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${FRAME_PIXELS.width}" height="${FRAME_PIXELS.height}"><g font-family="sans-serif" font-size="${11 * FRAME.scale}" font-weight="600" fill="${color}" stroke="${halo}" stroke-width="2" paint-order="stroke" opacity="${slice.opacity}">${texts}</g></svg>`
    return sharp(rgb, { raw: { ...FRAME_PIXELS, channels: 3 } }).composite([{ input: Buffer.from(svg) }]).removeAlpha().raw().toBuffer()
  }
}
