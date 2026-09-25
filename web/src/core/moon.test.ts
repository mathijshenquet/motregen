import { describe, expect, it } from 'vitest'
import { moonLitPath, moonPhase } from './moon'

describe('moon phase', () => {
  it('finds known new and full moons within a day of accuracy', () => {
    // Nieuwe maan 2024-01-11 11:57 UTC, volle maan 2024-01-25 17:54 UTC.
    expect(moonPhase(Date.UTC(2024, 0, 11, 11, 57)).illumination).toBeLessThan(0.02)
    expect(moonPhase(Date.UTC(2024, 0, 25, 17, 54)).illumination).toBeGreaterThan(0.98)
    expect(moonPhase(Date.UTC(2024, 0, 11, 11, 57)).label).toBe('nieuwe maan')
    expect(moonPhase(Date.UTC(2024, 0, 25, 17, 54)).label).toBe('volle maan')
  })

  it('waxes between new and full moon and wanes after', () => {
    const firstQuarter = moonPhase(Date.UTC(2024, 0, 18, 3, 52))
    expect(firstQuarter.waxing).toBe(true)
    // Gemiddelde synodische maand: bij de kwartieren tot ~0,6 dag naast de echte fase.
    expect(Math.abs(firstQuarter.illumination - 0.5)).toBeLessThan(0.1)
    expect(firstQuarter.label).toBe('wassende maan')
    const lastQuarter = moonPhase(Date.UTC(2024, 1, 2, 23, 18))
    expect(lastQuarter.waxing).toBe(false)
    expect(lastQuarter.label).toBe('afnemende maan')
  })

  it('draws nothing at new moon, the right half at first quarter and the left half at last quarter', () => {
    expect(moonLitPath(0, 7, 7, 6)).toBe('')
    expect(moonLitPath(0.25, 7, 7, 6)).toMatch(/^M7 1A6 6 0 0 1 7 13A0\.000 6 0 0 [01] 7 1Z$/)
    expect(moonLitPath(0.75, 7, 7, 6)).toMatch(/^M7 1A6 6 0 0 0 7 13A0\.000 6 0 0 [01] 7 1Z$/)
    // Volle maan: twee halve cirkels, dus de hele schijf.
    expect(moonLitPath(0.5, 7, 7, 6)).toMatch(/^M7 1A6 6 0 0 [01] 7 13A6\.000 6 0 0 [01] 7 1Z$/)
  })
})
