import { describe, expect, it } from 'vitest'
import { prepareField } from './isoline-field'
import { isolineLayerIndices } from './isoline-layer'

describe('isoline GPU field', () => {
  it('fills no-data from valid neighbours but marks it invalid', () => {
    const prepared = prepareField({ width: 3, height: 1, values: Float32Array.of(4, Number.NaN, 8) })
    expect([...prepared.values]).toEqual([4, 6, 8])
    expect([...prepared.valid]).toEqual([1, 0, 1])
  })

  it('leaves a field without any valid cell at zero instead of NaN', () => {
    const prepared = prepareField({ width: 2, height: 1, values: Float32Array.of(Number.NaN, Number.NaN) })
    expect([...prepared.values]).toEqual([0, 0])
  })

  it('names the hourly layers a time slice touches, clamped to the volume', () => {
    expect(isolineLayerIndices(3.4, 10, 0)).toEqual([3, 4])
    expect(isolineLayerIndices(3.4, 10, 1)).toEqual([2, 3, 4, 5])
    expect(isolineLayerIndices(0.2, 10, 1)).toEqual([0, 1, 2])
    expect(isolineLayerIndices(9, 10, 1)).toEqual([8, 9])
  })
})
