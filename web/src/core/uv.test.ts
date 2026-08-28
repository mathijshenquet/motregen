import { describe, expect, it } from 'vitest'
import { uvAdvice } from './uv'

describe('UV relevance gating', () => {
  it('does not create an insmeer-chip below zonkracht 3', () => {
    expect(uvAdvice(null)).toBeNull()
    expect(uvAdvice(2.9)).toBeNull()
  })

  it('retains the measured strength from moderate through extreme UV', () => {
    expect(uvAdvice(3)).toEqual({ value: 3, strength: 'matig' })
    expect(uvAdvice(6.2)).toEqual({ value: 6.2, strength: 'sterk' })
    expect(uvAdvice(8)).toEqual({ value: 8, strength: 'zeer sterk' })
    expect(uvAdvice(11)).toEqual({ value: 11, strength: 'extreem' })
  })
})
