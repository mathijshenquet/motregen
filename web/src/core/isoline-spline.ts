import type { PreparedField } from './isoline-field'
import type { FrameWeight } from './isolines'

/** De snede op tijd t: uurvelden met hun (temporele) gewichten, zoals de shader ze mengt. */
export interface FieldSlice {
  width: number
  height: number
  fields: PreparedField[]
  weights: number[]
}

export interface SliceSample {
  value: number
  /** ∂T/∂kolom, ∂T/∂rij (°C per cel). */
  gx: number
  gy: number
  valid: number
}

function basis(t: number): [number, number, number, number] {
  const t2 = t * t, t3 = t2 * t
  return [(1 - 3 * t + 3 * t2 - t3) / 6, (4 - 6 * t2 + 3 * t3) / 6, (1 + 3 * t + 3 * t2 - 3 * t3) / 6, t3 / 6]
}

function derivative(t: number): [number, number, number, number] {
  const t2 = t * t
  return [(-3 + 6 * t - 3 * t2) / 6, (-12 * t + 9 * t2) / 6, (3 + 6 * t - 9 * t2) / 6, 3 * t2 / 6]
}

/**
 * Kubische B-spline in de ruimte (celcentra op gehele coördinaten, zoals de shader) met
 * analytische gradiënt, gemengd over de uurvelden van de snede.
 */
export function sampleSlice(slice: FieldSlice, column: number, row: number): SliceSample {
  const { width, height } = slice
  const i = Math.floor(column), j = Math.floor(row)
  const bx = basis(column - i), by = basis(row - j), dx = derivative(column - i), dy = derivative(row - j)
  let value = 0, gx = 0, gy = 0, valid = 0
  for (let b = 0; b < 4; b++) {
    const r = Math.max(0, Math.min(height - 1, j - 1 + b))
    for (let a = 0; a < 4; a++) {
      const c = Math.max(0, Math.min(width - 1, i - 1 + a))
      let v = 0, ok = 0
      for (let frame = 0; frame < slice.fields.length; frame++) {
        v += slice.fields[frame]!.values[r * width + c]! * slice.weights[frame]!
        ok += slice.fields[frame]!.valid[r * width + c]! * slice.weights[frame]!
      }
      value += v * bx[a]! * by[b]!
      gx += v * dx[a]! * by[b]!
      gy += v * bx[a]! * dy[b]!
      valid += ok * bx[a]! * by[b]!
    }
  }
  return { value, gx, gy, valid }
}

/**
 * Kraal op een draad: schuif een punt met Newton-stappen langs de gradiënt naar T = level.
 * Geeft undefined als het niveau hier niet (meer) bestaat.
 */
export function projectToLevel(slice: FieldSlice, column: number, row: number, level: number, step: number, iterations = 2): { column: number; row: number; sample: SliceSample } | undefined {
  let x = column, y = row
  for (let iteration = 0; iteration < iterations; iteration++) {
    const sample = sampleSlice(slice, x, y)
    const norm = sample.gx * sample.gx + sample.gy * sample.gy
    if (sample.valid < 0.5 || norm < 1e-8) return undefined
    const delta = (sample.value - level) / norm
    // Meer dan twee cellen in één stap is geen meeglijden meer maar een sprong naar een andere lijn.
    if (Math.abs(delta) * Math.sqrt(norm) > 2) return undefined
    x -= delta * sample.gx
    y -= delta * sample.gy
    if (x < 0 || y < 0 || x > slice.width - 1 || y > slice.height - 1) return undefined
  }
  const sample = sampleSlice(slice, x, y)
  if (sample.valid < 0.5 || Math.abs(sample.value - level) > step * 0.1) return undefined
  return { column: x, row: y, sample }
}

export function smoothstep(low: number, high: number, value: number): number {
  const t = Math.max(0, Math.min(1, (value - low) / Math.max(high - low, 1e-9)))
  return t * t * (3 - 2 * t)
}

/** Tijdgewichten van de snede in frame-index-ruimte, gelijk aan de shader (lineair of B-spline). */
export function sliceWeights(time: number, depth: number, window: number): FrameWeight[] {
  const clamp = (index: number) => Math.max(0, Math.min(depth - 1, index))
  if (window < 1) {
    const left = Math.floor(time), mix = time - left
    return [{ index: clamp(left), weight: 1 - mix }, { index: clamp(left + 1), weight: mix }]
  }
  const base = Math.floor(time)
  return basis(time - base).map((weight, offset) => ({ index: clamp(base - 1 + offset), weight }))
}
