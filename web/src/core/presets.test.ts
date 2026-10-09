import { describe, expect, it } from 'vitest'
import { applyPresetUrl, cursorForPresetEpoch, formatLocalTime, modeForActiveFocus, modeForFocus, parsePresetPath, parsePresets, shareablePlace, shareUrl } from './presets'
import { placeName, placeSlug } from './place-slug'

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
    expect(modeForFocus('weather')).toBe('weather')
    expect(modeForFocus('air')).toBe('air')
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

  it('builds the production path with the nearest place and time fragment', () => {
    expect(shareUrl({ mode: 'feels', epoch: now, point: { lng: 5.1236, lat: 52.0874 } }, 'https://motregen.nl')).toBe(
      'https://motregen.nl/gevoel/utrecht#t=2026-10-07T1200',
    )
  })

  it('prefers the place name over coordinates in a share link (reads better, leaks less)', () => {
    expect(shareUrl({ mode: 'weather', epoch: now, point: { lng: 5.1236, lat: 52.0874 }, place: 'Utrecht' }, 'https://motregen.nl')).toBe(
      'https://motregen.nl/weer/utrecht#t=2026-10-07T1200',
    )
    for (const place of ['Mijn locatie', 'Thuis', 'Werk']) {
      expect(shareablePlace(place)).toBeUndefined()
      expect(shareUrl({ mode: 'weather', epoch: now, point: { lng: 5.1236, lat: 52.0874 }, place }, 'https://motregen.nl')).toBe('https://motregen.nl/weer/utrecht#t=2026-10-07T1200')
    }
    expect(shareUrl({ mode: 'weather', epoch: now, point: { lng: 5.1236, lat: 52.0874 }, place: 'Bij oma', savedPlace: true }, 'https://motregen.nl')).toBe('https://motregen.nl/weer/utrecht#t=2026-10-07T1200')
  })

  it('normalizes names and restores names a geocoder understands', () => {
    expect(placeSlug("'s-Hertogenbosch")).toBe('s-hertogenbosch')
    expect(placeSlug('  Bergen op Zoom ')).toBe('bergen-op-zoom')
    expect(placeSlug('Één plaats')).toBe('een-plaats')
    expect(placeName('s-hertogenbosch')).toBe("'s-Hertogenbosch")
    expect(placeName('bergen-op-zoom')).toBe('Bergen op Zoom')
    expect(placeName('de-bilt')).toBe('De Bilt')
    expect(placeName('nieuw-vennep')).toBe('Nieuw Vennep')
    for (const slug of ['../utrecht', '<script>', '-utrecht', 'utrecht/', '']) expect(placeName(slug)).toBeUndefined()
  })

  it('reads mode/place paths and ignores malformed paths', () => {
    expect(parsePresetPath('/')).toEqual({})
    expect(parsePresetPath('/lucht')).toEqual({ mode: 'air' })
    expect(parsePresetPath('/wind/Utrecht/')).toEqual({ mode: 'wind', place: 'Utrecht' })
    expect(parsePresetPath('/gevoel/s-hertogenbosch')).toEqual({ mode: 'feels', place: "'s-Hertogenbosch" })
    for (const path of ['/regen/utrecht', '/wind/%', '/wind/a%2Fb', '/wind/utrecht/extra', '/wind//']) expect(parsePresetPath(path)).toEqual({})
  })

  it('gives valid query presets precedence over the path and a fragment time precedence over query time', () => {
    expect(parsePresets('?modus=gevoel&plaats=Groningen&t=-1u', now, '/wind/utrecht', '#t=2026-10-07T1200')).toEqual({ mode: 'feels', place: 'Groningen', epoch: now })
    expect(parsePresets('?plaats=Groningen&lat=52.091&lon=5.122', now, '/wind/utrecht')).toEqual({ mode: 'wind', point: { lat: 52.091, lng: 5.122 } })
    expect(parsePresets('?modus=invalid&lat=oops', now, '/wind/utrecht')).toEqual({ mode: 'wind', place: 'Utrecht' })
  })

  it('keeps operational flags while moving presets out of the query', () => {
    const url = new URL('https://example.test/?modus=lucht&plaats=Thuis&lat=52&lon=5&t=-1u&dev&perf=start&tg=1')
    const state = { mode: 'wind' as const, epoch: now, point: { lng: 5.12, lat: 52.09 }, place: 'Utrecht' }
    applyPresetUrl(url, state, true)
    expect(url.href).toBe('https://example.test/wind/utrecht?dev=&perf=start&tg=1#t=2026-10-07T1200')
    applyPresetUrl(url, state, false)
    expect(url.hash).toBe('')
    expect(url.searchParams.has('t')).toBe(false)
  })

  it('reads and writes the compact Amsterdam local time (CET/CEST) without colons', () => {
    expect(parsePresets('?t=2026-10-07T1200', now)).toEqual({ epoch: now })
    expect(formatLocalTime(now)).toBe('2026-10-07T1200')
    // Winter: CET = UTC+1.
    expect(parsePresets('?t=2026-01-15T0930', now)).toEqual({ epoch: Date.parse('2026-01-15T08:30:00Z') })
    expect(formatLocalTime(Date.parse('2026-01-15T08:30:00Z'))).toBe('2026-01-15T0930')
  })
})
