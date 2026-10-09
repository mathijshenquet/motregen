import { lineLabelCandidates, LABEL_MIN_DISTANCE_PX, LABEL_SPACING_PX, MAX_LABEL_ANCHORS } from '../web/src/core/isoline-label-anchors.js'
import { NativeText } from './native-text.js'
import { FRAME, FRAME_PIXELS } from './config.js'
import { nativeProjection } from './native-projection.js'
import { projectToLevel, type SliceSample } from '../web/src/core/isoline-spline.js'
import { isolineColor } from '../web/src/core/isolines.js'
import { ringFadeAt, shortRings } from '../web/src/core/isoline-contours.js'
import type { TemperatureSlice } from './native-temperature.js'
import type { NativeTheme } from './native-map.js'

// A second projection during drawing changes new anchors relative to the app's single placement step.
interface Anchor { column: number; row: number; level: number; sample: SliceSample }

export class NativeIsolineLabels {
  private anchors: Anchor[] = []
  private labelKey?: string
  private step?: number
  constructor(private readonly text = new NativeText()) {}
  async draw(rgb: Buffer, slice: TemperatureSlice, theme: NativeTheme): Promise<Buffer> {
    if (slice.step !== this.step) { this.anchors = []; this.step = slice.step }
    const projection = nativeProjection(slice.grid)
    const fieldSlice = slice.labelSlice ?? { width: slice.grid.width, height: slice.grid.height, fields: [slice.field], weights: [1] }
    const live: Anchor[] = []
    const separated = (column: number, row: number) => live.every((anchor) => Math.hypot(anchor.column - column, anchor.row - row) / projection.cellsPerPixel >= LABEL_MIN_DISTANCE_PX * FRAME.scale)
    for (const anchor of this.anchors) {
      const projected = projectToLevel(fieldSlice, anchor.column, anchor.row, anchor.level, slice.step)
      if (projected && separated(projected.column, projected.row)) live.push({ ...anchor, ...projected })
    }
    const rings = shortRings(slice.contours, slice.kind === 'pressure' ? 0 : 60)
    if (slice.labelKey !== this.labelKey && slice.labelLines) {
      this.labelKey = slice.labelKey
      const spacing = LABEL_SPACING_PX * FRAME.scale * projection.cellsPerPixel
      const radius = 6378137
      for (const feature of slice.labelLines.features) {
        const points = feature.geometry.coordinates.map(([lng, lat]): [number, number] => [(lng * Math.PI / 180 * radius - slice.grid.x0) / slice.grid.dx - 0.5, (Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * radius - slice.grid.y0) / slice.grid.dy - 0.5])
        for (const [column, row] of lineLabelCandidates(points, spacing)) {
          if (live.length >= MAX_LABEL_ANCHORS) break
          const [screenX, screenY] = projection.point(column, row)
          if (screenX < 0 || screenY < 0 || screenX > FRAME_PIXELS.width || screenY > FRAME_PIXELS.height || !separated(column, row)) continue
          const projected = projectToLevel(fieldSlice, column, row, feature.properties.level, slice.step)
          if (!projected || ringFadeAt(rings, feature.properties.level, projected.column, projected.row) <= 0) continue
          live.push({ ...projected, level: feature.properties.level })
        }
      }
    }
    this.anchors = live
    for (const anchor of live) {
      const [screenX, screenY] = projection.point(anchor.column, anchor.row)
      let angle = Math.atan2(anchor.sample.gy, anchor.sample.gx) * 180 / Math.PI + 90
      if (angle > 90) angle -= 180
      if (angle <= -90) angle += 180
      const label = slice.kind === 'pressure' ? String(anchor.level) : `${anchor.level}°`
      await this.text.draw(rgb, label, Math.round(screenX / FRAME.scale) * FRAME.scale, Math.round(screenY / FRAME.scale) * FRAME.scale, angle, isolineColor(theme, slice.kind), theme, slice.opacity * ringFadeAt(rings, anchor.level, anchor.column, anchor.row))
    }
    return rgb
  }
}
