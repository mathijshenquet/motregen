import { describe, expect, it } from 'vitest'
import { windowReady } from './window-ready'

const HOUR = 3_600_000
const now = 100 * HOUR

describe('windowReady', () => {
  it('is ready once every moment within an hour of now has its value', () => {
    const entries = [-2, -1, 0, 1, 2].map((offset) => ({ epoch: now + offset * HOUR, present: Math.abs(offset) <= 1 }))
    expect(windowReady(entries, now)).toBe(true)
  })

  it('is not ready while one moment inside the window is still missing', () => {
    const entries = [-1, 0, 1].map((offset) => ({ epoch: now + offset * HOUR, present: offset !== 1 }))
    expect(windowReady(entries, now)).toBe(false)
  })

  it('does not call an empty window ready', () => {
    expect(windowReady([], now)).toBe(false)
    expect(windowReady([{ epoch: now + 3 * HOUR, present: true }], now)).toBe(false)
  })
})
