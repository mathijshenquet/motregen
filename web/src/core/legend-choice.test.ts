import { describe, expect, it } from 'vitest'
import { LEGEND_STORAGE_KEY, legendIsOpen, readLegendChoice, storeLegendChoice } from './legend-choice'

describe('legenda open/dicht (U107)', () => {
  it('follows the layout until the user chooses', () => {
    expect(legendIsOpen(undefined, false)).toBe(true)
    expect(legendIsOpen(undefined, true)).toBe(false)
    expect(legendIsOpen('dicht', false)).toBe(false)
    expect(legendIsOpen('open', true)).toBe(true)
  })

  it('stores the choice and survives a storage that throws', () => {
    const values = new Map<string, string>()
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value) } }
    storeLegendChoice(storage, 'dicht')
    expect(values.get(LEGEND_STORAGE_KEY)).toBe('dicht')
    expect(readLegendChoice(storage)).toBe('dicht')
    values.set(LEGEND_STORAGE_KEY, 'raar')
    expect(readLegendChoice(storage)).toBeUndefined()
    const broken = { getItem: () => { throw new Error('geen toegang') }, setItem: () => { throw new Error('vol') } }
    expect(readLegendChoice(broken)).toBeUndefined()
    expect(() => storeLegendChoice(broken, 'open')).not.toThrow()
  })
})
