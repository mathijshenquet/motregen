import type { Grid } from './contract'
import type { PreparedField } from './isoline-field'
import { smoothstep } from './isoline-spline'
import { marchingSquares, workspace, type ScalarField } from './isolines'

/** Een isolijn van de snede op het exacte B-spline-oppervlak, in roostercoördinaten (celcentra). */
export interface Contour {
  level: number
  closed: boolean
  /** x0, y0, x1, y1, … (kolom, rij). */
  points: Float32Array
  /** |∇T| per punt in °C/km. */
  gradient: Float32Array
  lengthKm: number
}

export interface ContourOptions {
  step: number
  /** Maximale afwijking van een koorde tot de echte lijn, in cellen: bepaalt de verdichting. */
  toleranceCells: number
  /** Kolom/rij-venster (inclusief) om te traceren; standaard het hele rooster. */
  window?: { left: number; top: number; right: number; bottom: number }
}

/** Tijdsnede: de uurvelden gewogen tot één veld, zodat elke tap één lookup is i.p.v. vier. */
export function blendSlice(fields: readonly PreparedField[], weights: readonly number[]): PreparedField {
  const size = fields[0]!.values.length
  const values = new Float32Array(size), valid = new Float32Array(size)
  for (let frame = 0; frame < fields.length; frame++) {
    const weight = weights[frame]!
    if (!weight) continue
    const source = fields[frame]!
    for (let index = 0; index < size; index++) {
      values[index] += source.values[index]! * weight
      valid[index] += source.valid[index]! * weight
    }
  }
  return { values, valid }
}

/**
 * Waarde van het B-spline-oppervlak op de knopen ([1 4 1]/6 separabel, geklemd zoals de
 * sampler). No-data waar het gespline'de geldigheidsveld < ½ is, net als de shader.
 */
function splineNodes(field: PreparedField, width: number, height: number, window: NonNullable<ContourOptions['window']>): ScalarField {
  const { left, top, right, bottom } = window
  const w = right - left + 1, h = bottom - top + 1
  const at = (row: number, column: number) => Math.max(0, Math.min(height - 1, row)) * width + Math.max(0, Math.min(width - 1, column))
  const horizontal = new Float32Array((h + 2) * w), horizontalValid = new Float32Array((h + 2) * w)
  for (let y = 0; y < h + 2; y++) {
    const row = top - 1 + y
    for (let x = 0; x < w; x++) {
      const column = left + x
      const a = at(row, column - 1), b = at(row, column), c = at(row, column + 1)
      horizontal[y * w + x] = (field.values[a]! + 4 * field.values[b]! + field.values[c]!) / 6
      horizontalValid[y * w + x] = (field.valid[a]! + 4 * field.valid[b]! + field.valid[c]!) / 6
    }
  }
  const values = new Float32Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const up = y * w + x, mid = up + w, down = mid + w
      const valid = (horizontalValid[up]! + 4 * horizontalValid[mid]! + horizontalValid[down]!) / 6
      values[y * w + x] = valid < 0.5 ? Number.NaN : (horizontal[up]! + 4 * horizontal[mid]! + horizontal[down]!) / 6
    }
  }
  return { width: w, height: h, values }
}

export function kmPerCellAt(grid: Grid, row: number): number {
  const y = grid.y0 + (row + 0.5) * grid.dy
  const lat = 2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2
  return Math.abs(grid.dx) * Math.cos(lat) / 1000
}

const MAX_DEPTH = 4
// Meer dan een cel in één Newton-stap is geen projectie meer maar een sprong naar een andere tak.
const MAX_STEP_CELLS = 1

/**
 * Kubische B-spline-sampler op één veld (celcentra op gehele coördinaten, geklemd zoals de
 * shader) zonder allocaties: de contourtracer doet er ~10k per snede.
 */
class SplineSampler {
  value = 0
  gx = 0
  gy = 0
  valid = 0

  constructor(private readonly field: PreparedField, private readonly width: number, private readonly height: number) {}

  sample(column: number, row: number): void {
    const { width, height } = this
    const { values, valid } = this.field
    const i = Math.floor(column), j = Math.floor(row)
    const tx = column - i, ty = row - j
    const tx2 = tx * tx, tx3 = tx2 * tx, ty2 = ty * ty, ty3 = ty2 * ty
    const bx0 = (1 - 3 * tx + 3 * tx2 - tx3) / 6, bx1 = (4 - 6 * tx2 + 3 * tx3) / 6, bx2 = (1 + 3 * tx + 3 * tx2 - 3 * tx3) / 6, bx3 = tx3 / 6
    const by0 = (1 - 3 * ty + 3 * ty2 - ty3) / 6, by1 = (4 - 6 * ty2 + 3 * ty3) / 6, by2 = (1 + 3 * ty + 3 * ty2 - 3 * ty3) / 6, by3 = ty3 / 6
    const dx0 = (-3 + 6 * tx - 3 * tx2) / 6, dx1 = (-12 * tx + 9 * tx2) / 6, dx2 = (3 + 6 * tx - 9 * tx2) / 6, dx3 = 3 * tx2 / 6
    const dy0 = (-3 + 6 * ty - 3 * ty2) / 6, dy1 = (-12 * ty + 9 * ty2) / 6, dy2 = (3 + 6 * ty - 9 * ty2) / 6, dy3 = 3 * ty2 / 6
    const c0 = Math.max(0, Math.min(width - 1, i - 1)), c1 = Math.max(0, Math.min(width - 1, i)), c2 = Math.max(0, Math.min(width - 1, i + 1)), c3 = Math.max(0, Math.min(width - 1, i + 2))
    let value = 0, gx = 0, gy = 0, ok = 0
    for (let b = 0; b < 4; b++) {
      const r = Math.max(0, Math.min(height - 1, j - 1 + b)) * width
      const v0 = values[r + c0]!, v1 = values[r + c1]!, v2 = values[r + c2]!, v3 = values[r + c3]!
      const across = v0 * bx0 + v1 * bx1 + v2 * bx2 + v3 * bx3
      const slope = v0 * dx0 + v1 * dx1 + v2 * dx2 + v3 * dx3
      const by = b === 0 ? by0 : b === 1 ? by1 : b === 2 ? by2 : by3
      const dy = b === 0 ? dy0 : b === 1 ? dy1 : b === 2 ? dy2 : dy3
      value += across * by
      gx += slope * by
      gy += across * dy
      ok += (valid[r + c0]! * bx0 + valid[r + c1]! * bx1 + valid[r + c2]! * bx2 + valid[r + c3]! * bx3) * by
    }
    this.value = value
    this.gx = gx
    this.gy = gy
    this.valid = ok
  }
}

interface TracePoint {
  column: number
  row: number
  gx: number
  gy: number
}

/**
 * Isolijnen van de snede: marching squares op de knoopwaarden geeft grove punten, één
 * Newton-stap (langs ∇T; de start ligt al op een fractie van een cel) zet ze op T = niveau, en
 * koorden waarvan het geprojecteerde middenpunt meer dan `toleranceCells` afwijkt worden
 * recursief gesplitst. Dat is de kromming-adaptieve verdichting: rechte stukken blijven grof,
 * bochten worden fijn.
 */
export function traceContours(field: PreparedField, grid: Grid, options: ContourOptions): Contour[] {
  const { width, height } = grid
  const window = options.window ?? { left: 0, top: 0, right: width - 1, bottom: height - 1 }
  const nodes = splineNodes(field, width, height, window)
  const sampler = new SplineSampler(field, width, height)
  const { step } = options
  // Eén pass: per niveau de cellen die het kruisen (CSR), zodat marching squares niet per
  // niveau het hele rooster afloopt.
  const w = nodes.width, h = nodes.height, v = nodes.values
  const cellLow = new Int32Array((w - 1) * (h - 1)), cellHigh = new Int32Array((w - 1) * (h - 1))
  let lowest = Infinity, highest = -Infinity
  for (let row = 0; row < h - 1; row++) {
    for (let column = 0; column < w - 1; column++) {
      const cell = row * (w - 1) + column
      const a = v[row * w + column]!, b = v[row * w + column + 1]!, c = v[(row + 1) * w + column]!, d = v[(row + 1) * w + column + 1]!
      // NaN faalt elke vergelijking: zo'n cel krijgt een leeg bereik.
      const min = Math.min(a, b, c, d), max = Math.max(a, b, c, d)
      if (!(min <= max)) { cellLow[cell] = 1; cellHigh[cell] = 0; continue }
      cellLow[cell] = Math.floor(min / step) + 1
      cellHigh[cell] = Math.floor(max / step)
      if (cellLow[cell]! <= cellHigh[cell]!) {
        lowest = Math.min(lowest, cellLow[cell]!)
        highest = Math.max(highest, cellHigh[cell]!)
      }
    }
  }
  const contours: Contour[] = []
  if (lowest > highest) return contours
  const levels = highest - lowest + 1
  const offsets = new Int32Array(levels + 1)
  for (let cell = 0; cell < cellLow.length; cell++) for (let k = cellLow[cell]!; k <= cellHigh[cell]!; k++) offsets[k - lowest + 1]!++
  for (let k = 0; k < levels; k++) offsets[k + 1]! += offsets[k]!
  const fill = offsets.slice(0, levels)
  const cells = new Int32Array(offsets[levels]!)
  for (let cell = 0; cell < cellLow.length; cell++) {
    const index = Math.floor(cell / (w - 1)) * w + cell % (w - 1)
    for (let k = cellLow[cell]!; k <= cellHigh[cell]!; k++) cells[fill[k - lowest]!++] = index
  }

  const buffers = workspace(nodes)
  const tolerance = options.toleranceCells
  // km per cel varieert < 0,1 % per rij op een 6-km-grid: per rij tabelleren.
  const kmPerRow = Float64Array.from({ length: height }, (_, row) => kmPerCellAt(grid, row))
  const kmAt = (row: number) => kmPerRow[Math.max(0, Math.min(height - 1, Math.round(row)))]!
  for (let k = 0; k < levels; k++) {
    const level = (k + lowest) * step
    const project = (column: number, row: number): TracePoint | undefined => {
      sampler.sample(column, row)
      const norm = sampler.gx * sampler.gx + sampler.gy * sampler.gy
      if (sampler.valid < 0.5 || norm < 1e-10) return undefined
      const delta = (sampler.value - level) / norm
      if (Math.abs(delta) * Math.sqrt(norm) > MAX_STEP_CELLS) return undefined
      return { column: column - delta * sampler.gx, row: row - delta * sampler.gy, gx: sampler.gx, gy: sampler.gy }
    }
    for (const line of marchingSquares(nodes, level, 0, 0, buffers, cells.subarray(offsets[k]!, offsets[k + 1]!))) {
      const xs: number[] = [], ys: number[] = [], gradient: number[] = []
      const push = (point: TracePoint) => {
        xs.push(point.column); ys.push(point.row)
        gradient.push(Math.hypot(point.gx, point.gy) / kmAt(point.row))
      }
      const coarse = line.points.map(([x, y]): TracePoint => {
        const column = x + window.left, row = y + window.top
        const projected = project(column, row)
        if (projected) return projected
        sampler.sample(column, row)
        return { column, row, gx: sampler.gx, gy: sampler.gy }
      })
      const refine = (a: TracePoint, b: TracePoint, depth: number) => {
        if (depth >= MAX_DEPTH) return
        const mx = (a.column + b.column) / 2, my = (a.row + b.row) / 2
        const mid = project(mx, my)
        if (!mid || Math.hypot(mid.column - mx, mid.row - my) <= tolerance) return
        refine(a, mid, depth + 1)
        push(mid)
        refine(mid, b, depth + 1)
      }
      const segments = line.closed ? coarse.length : coarse.length - 1
      for (let index = 0; index < coarse.length; index++) {
        push(coarse[index]!)
        if (index < segments) refine(coarse[index]!, coarse[(index + 1) % coarse.length]!, 0)
      }
      let lengthKm = 0
      const count = xs.length
      for (let index = 1; index <= (line.closed ? count : count - 1); index++) {
        const a = index - 1, b = index % count
        lengthKm += Math.hypot(xs[b]! - xs[a]!, ys[b]! - ys[a]!) * kmAt((ys[a]! + ys[b]!) / 2)
      }
      const points = new Float32Array(count * 2)
      for (let index = 0; index < count; index++) { points[index * 2] = xs[index]!; points[index * 2 + 1] = ys[index]! }
      contours.push({ level, closed: line.closed, points, gradient: Float32Array.from(gradient), lengthKm })
    }
  }
  return contours
}

/**
 * Lusjes-criterium (PO 2026-09-24): een gesloten lijn korter dan `minKm` is ruis die zo
 * wegpincht. De fade hangt continu af van de lengte, dus een krimpende ring vervaagt vóór hij
 * verdwijnt en een nieuwe groeit erin. Open lijnen (rand, kust) vervagen nooit.
 */
export function ringFade(contour: Pick<Contour, 'closed' | 'lengthKm'>, minKm: number): number {
  if (!contour.closed || minKm <= 0) return 1
  return smoothstep(minKm * 0.5, minKm, contour.lengthKm)
}
