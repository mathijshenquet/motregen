import { describe, expect, it } from 'vitest'
import { cursorForPresetEpoch, modeForActiveFocus, modeForFocus, parsePresets, shareUrl } from './presets'

describe('URL presets', () => {
  const now = Date.parse('2026-10-07T10:00:00Z')

  it('reads every supported preset without touching unrelated query flags', () => {
    expect(parsePresets('?modus=wind&t=2026-10-07T12:30:00Z&plaats=Groningen&dev&perf', now)).toEqual({
      mode: 'wind', epoch: Date.parse('2026-10-07T12:30:00Z'), place: 'Groningen',
    })
    expect(parsePresets('?modus=gevoel&t=+2u', now)).toEqual({ mode: 'feels', epoch: now + 2 * 3_600_000 })
    expect(parsePresets('?modus=lucht&t=-90m', now)).toEqual({ mode: 'air', epoch: now - 90 * 60_000 })
  })

  it('uses direct coordinates ahead of a place query', () => {
    expect(parsePresets('?plaats=Utrecht&lat=52.091&lon=5.122', now)).toEqual({ point: { lat: 52.091, lng: 5.122 } })
  })

  it('ignores malformed values independently', () => {
    expect(parsePresets('?modus=regen&t=tomorrow&lat=91&lon=5&plaats=', now)).toEqual({})
    expect(parsePresets('?t=2026-10-07T12:00:00&plaats=  De Bilt  ', now)).toEqual({ place: 'De Bilt' })
    expect(parsePresets('?t=+3x&lat=51.2&lon=', now)).toEqual({})
  })

  it('maps stable URL modes to the current focus implementation', () => {
    expect(modeForFocus('weather')).toBeUndefined()
    expect(modeForFocus('air')).toBe('clouds')
    expect(modeForFocus('feels')).toBe('temperature')
    expect(modeForActiveFocus('wind')).toBe('wind')
    expect(modeForActiveFocus(undefined)).toBe('weather')
  })

  it('keeps an out-of-range time on the nearest timeline edge', () => {
    const timeline = [{ epoch: 10 }, { epoch: 20 }, { epoch: 40 }]
    expect(cursorForPresetEpoch(timeline, 0)).toBe(0)
    expect(cursorForPresetEpoch(timeline, 100)).toBe(2)
    expect(cursorForPresetEpoch(timeline, 30)).toBe(1.5)
  })

  it('builds the canonical, rounded production share link', () => {
    expect(shareUrl({ mode: 'feels', epoch: now, point: { lng: 5.1236, lat: 52.0874 } })).toBe(
      'https://motregen.nl/?modus=gevoel&t=2026-10-07T10%3A00%3A00.000Z&lat=52.087&lon=5.124',
    )
  })
})
