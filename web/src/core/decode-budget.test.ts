import { describe, expect, it } from 'vitest'
import { decodeBudget } from './decode-budget'

describe('decodeBudget', () => {
  it('keeps the eager desktop behaviour on a laptop with a mouse', () => {
    expect(decodeBudget({ cores: 10, memoryGb: 8, coarsePointer: false })).toEqual({ workers: 4, pointSeries: 'eager' })
    expect(decodeBudget({ cores: 6, coarsePointer: false })).toEqual({ workers: 4, pointSeries: 'eager' })
  })

  it('treats an eight-core phone without deviceMemory (Firefox on Android) as constrained', () => {
    expect(decodeBudget({ cores: 8, coarsePointer: true })).toEqual({ workers: 2, pointSeries: 'in-view' })
  })

  it('constrains few cores or little memory regardless of the pointer', () => {
    expect(decodeBudget({ cores: 4, memoryGb: 8, coarsePointer: false })).toEqual({ workers: 2, pointSeries: 'in-view' })
    expect(decodeBudget({ cores: 8, memoryGb: 4, coarsePointer: false })).toEqual({ workers: 2, pointSeries: 'in-view' })
    expect(decodeBudget({ cores: 2, coarsePointer: false })).toEqual({ workers: 1, pointSeries: 'in-view' })
  })

  it('assumes two cores when the browser reports none', () => {
    expect(decodeBudget({ coarsePointer: false })).toEqual({ workers: 1, pointSeries: 'in-view' })
  })
})
