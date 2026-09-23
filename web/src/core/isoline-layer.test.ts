import { describe, expect, it } from 'vitest'
import { mixPreparedFields, prepareField } from './isoline-layer'

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

  it('mixes prepared fields into interleaved value/validity pairs', () => {
    const a = prepareField({ width: 2, height: 1, values: Float32Array.of(0, 10) })
    const b = prepareField({ width: 2, height: 1, values: Float32Array.of(4, Number.NaN) })
    const out = mixPreparedFields([a, b], [{ index: 0, weight: 0.75 }, { index: 1, weight: 0.25 }], new Float32Array(4))
    // Het gat in b is met de buurwaarde 4 gevuld en telt als ongeldig mee.
    expect([...out]).toEqual([1, 1, 7.5 + 1, 0.75])
  })
})
