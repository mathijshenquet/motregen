import { describe, expect, it } from 'vitest'
import type { PreparedField } from './isoline-field'
import { projectToLevel, sampleSlice, sliceWeights, type FieldSlice } from './isoline-spline'

function ramp(width: number, height: number, offset: number): PreparedField {
  const values = new Float32Array(width * height)
  for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) values[row * width + column] = column + offset
  return { values, valid: new Float32Array(width * height).fill(1) }
}

describe('isoline label anchors', () => {
  const slice = (weights: number[], fields = [ramp(20, 10, 0), ramp(20, 10, 4)]): FieldSlice => ({ width: 20, height: 10, fields, weights })

  it('samples a linear field exactly, with its gradient, like the shader B-spline', () => {
    const sample = sampleSlice(slice([1, 0]), 7.3, 4.6)
    expect(sample.value).toBeCloseTo(7.3, 6)
    expect(sample.gx).toBeCloseTo(1, 6)
    expect(sample.gy).toBeCloseTo(0, 6)
    expect(sample.valid).toBeCloseTo(1, 6)
  })

  it('slides an anchor along the gradient onto its level as the field moves in time', () => {
    // Het niveau 10 ligt eerst op kolom 10; een kwart verder in de tijd (veld +1) op kolom 9.
    const start = projectToLevel(slice([1, 0]), 10.4, 5, 10, 1)!
    expect(start.column).toBeCloseTo(10, 5)
    expect(start.row).toBeCloseTo(5, 5)
    const later = projectToLevel(slice([0.75, 0.25]), start.column, start.row, 10, 1)!
    expect(later.column).toBeCloseTo(9, 5)
    expect(later.row).toBeCloseTo(5, 5)
  })

  it('drops an anchor whose level jumped away rather than snapping to another line', () => {
    expect(projectToLevel(slice([1, 0]), 2, 5, 15, 1)).toBeUndefined()
  })

  it('weights the slice like the shader: linear pair or four B-spline frames', () => {
    expect(sliceWeights(2.25, 10, 0)).toEqual([{ index: 2, weight: 0.75 }, { index: 3, weight: 0.25 }])
    const spline = sliceWeights(2, 10, 1)
    expect(spline.map(({ index }) => index)).toEqual([1, 2, 3, 4])
    expect(spline.map(({ weight }) => weight)).toEqual([1 / 6, 4 / 6, 1 / 6, 0].map((weight) => expect.closeTo(weight, 10)))
  })
})
