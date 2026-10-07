import { describe, expect, it } from 'vitest'
import { EXPRESSIVE_STORAGE_KEY, loadExpressive, storeExpressive } from './expressive'

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
  }
}

describe('globale schakelaar Expressief', () => {
  it('staat standaard aan en bewaart beide keuzes', () => {
    const storage = memoryStorage()
    expect(loadExpressive(storage)).toBe(true)
    storeExpressive(false, storage)
    expect(storage.values.get(EXPRESSIVE_STORAGE_KEY)).toBe('off')
    expect(loadExpressive(storage)).toBe(false)
    storeExpressive(true, storage)
    expect(storage.values.get(EXPRESSIVE_STORAGE_KEY)).toBe('on')
    expect(loadExpressive(storage)).toBe(true)
  })

  it('neemt "Dag en nacht in tabel" uit over als Expressief uit en ruimt de oude sleutel op', () => {
    const off = memoryStorage({ 'motregen-table-day-night': 'off' })
    expect(loadExpressive(off)).toBe(false)
    expect([...off.values]).toEqual([[EXPRESSIVE_STORAGE_KEY, 'off']])

    const on = memoryStorage({ 'motregen-table-day-night': 'on' })
    expect(loadExpressive(on)).toBe(true)
    expect([...on.values]).toEqual([])
  })

  it('laat een al gemaakte Expressief-keuze winnen van de oude sleutel', () => {
    const storage = memoryStorage({ 'motregen-table-day-night': 'off', [EXPRESSIVE_STORAGE_KEY]: 'on' })
    expect(loadExpressive(storage)).toBe(true)
    expect([...storage.values]).toEqual([[EXPRESSIVE_STORAGE_KEY, 'on']])
  })
})
