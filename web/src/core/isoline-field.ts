import type { ScalarField } from './isolines'

/** Eén frame, geblurd en met no-data opgevuld zodat de bicubische taps aan de rand niets vreemds zien. */
export interface PreparedField {
  values: Float32Array
  valid: Float32Array
}

const FILL_PASSES = 8

export function prepareField(field: ScalarField): PreparedField {
  const { width, height } = field
  const values = Float32Array.from(field.values)
  const valid = new Float32Array(values.length)
  for (let index = 0; index < values.length; index++) valid[index] = Number.isNaN(values[index]!) ? 0 : 1
  for (let pass = 0; pass < FILL_PASSES; pass++) {
    const holes: Array<[number, number]> = []
    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        const index = row * width + column
        if (!Number.isNaN(values[index]!)) continue
        let sum = 0, count = 0
        const add = (neighbour: number) => { const value = values[neighbour]!; if (!Number.isNaN(value)) { sum += value; count++ } }
        if (column > 0) add(index - 1)
        if (column < width - 1) add(index + 1)
        if (row > 0) add(index - width)
        if (row < height - 1) add(index + width)
        if (count) holes.push([index, sum / count])
      }
    }
    if (!holes.length) break
    for (const [index, value] of holes) values[index] = value
  }
  for (let index = 0; index < values.length; index++) if (Number.isNaN(values[index]!)) values[index] = 0
  return { values, valid }
}
