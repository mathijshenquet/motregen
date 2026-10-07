import { describe, expect, it } from 'vitest'
import { loadTableDayNight, storeTableDayNight, TABLE_DAY_NIGHT_STORAGE_KEY } from './table-appearance'

describe('dag- en nachtcyclus in de tabel', () => {
  it('staat standaard aan en bewaart beide keuzes', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => void values.set(key, value),
    }
    expect(loadTableDayNight(storage)).toBe(true)
    storeTableDayNight(false, storage)
    expect(values.get(TABLE_DAY_NIGHT_STORAGE_KEY)).toBe('off')
    expect(loadTableDayNight(storage)).toBe(false)
    storeTableDayNight(true, storage)
    expect(values.get(TABLE_DAY_NIGHT_STORAGE_KEY)).toBe('on')
    expect(loadTableDayNight(storage)).toBe(true)
  })
})
