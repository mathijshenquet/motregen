import { describe, expect, it } from 'vitest'
import { sameFields, stableByIndex } from './stable'

describe('stabiele afgeleide gegevens', () => {
  it('vergelijkt objecten op hun velden', () => {
    expect(sameFields({ value: 1, unit: 'bft' }, { value: 1, unit: 'bft' })).toBe(true)
    expect(sameFields({ value: 1, unit: 'bft' }, { value: 2, unit: 'bft' })).toBe(false)
    expect(sameFields<{ value: number; gust?: number }>({ value: 1 }, { value: 1, gust: 3 })).toBe(false)
    expect(sameFields(null, null)).toBe(true)
    expect(sameFields({ value: 1 }, null)).toBe(false)
  })

  it('houdt ongewijzigde elementen en bij geen enkel verschil de hele lijst vast', () => {
    const previous = [{ offset: 0, darkness: 0.2 }, { offset: 0.5, darkness: 0.4 }]
    const same = stableByIndex(previous, [{ offset: 0, darkness: 0.2 }, { offset: 0.5, darkness: 0.4 }])
    expect(same).toBe(previous)

    const partly = stableByIndex(previous, [{ offset: 0, darkness: 0.2 }, { offset: 0.5, darkness: 0.9 }, { offset: 1, darkness: 0 }])
    expect(partly).not.toBe(previous)
    expect(partly[0]).toBe(previous[0])
    expect(partly[1]).toEqual({ offset: 0.5, darkness: 0.9 })
    expect(partly).toHaveLength(3)
  })
})
