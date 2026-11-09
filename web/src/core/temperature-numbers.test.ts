import { describe, expect, it } from 'vitest'
import { placeNamePaddingPx } from './map-label-placement'
import { mapDiscFontPx, mapDiscRadius, mapLabelRegime, mapLabelSize } from './map-labels'
import { MAP_PLACES, mapPlaceSpacingPx, nestedPlaces } from './map-places'
import { islandBox } from './temperature-numbers'

describe('kaartstijl-regime (U107)', () => {
  it('uses 13 px on desktop and 12 px on a phone, one step larger in the ruim regime', () => {
    expect(mapLabelSize(1440, 900)).toBe(13)
    expect(mapLabelSize(402, 844)).toBe(12)
    expect(mapLabelSize(1440, 900, 'ruim')).toBe(14)
    expect(mapLabelSize(402, 844, 'ruim')).toBe(13)
  })

  it('reads the regime only under ?dev', () => {
    expect(mapLabelRegime(new URLSearchParams('regime=ruim'))).toBe('compact')
    expect(mapLabelRegime(new URLSearchParams('dev&regime=ruim'))).toBe('ruim')
    expect(mapLabelRegime(new URLSearchParams('dev&regime=reus'))).toBe('compact')
  })

  it('shares one disc shape: the wind badge radius 9.5 at 13 px, wider for longer labels', () => {
    expect(mapDiscRadius('3', 13)).toBeCloseTo(9.5, 6)
    expect(mapDiscRadius('10°', 13)).toBeCloseTo(15.7, 1)
    expect(mapDiscFontPx('3', 13)).toBe(13)
    expect(mapDiscFontPx('100', 13)).toBe(10)
  })

  it('spaces the places like the wind socks and sizes the collision box from the text', () => {
    expect(mapPlaceSpacingPx(1440, 900)).toBe(56)
    expect(mapPlaceSpacingPx(402, 844)).toBe(40)
    expect(islandBox('10°', 13)).toEqual({ width: 36, height: 19 })
    expect(placeNamePaddingPx(6.9)).toBe(18)
    expect(placeNamePaddingPx(10.5)).toBe(4)
  })
})

describe('stable places while zooming', () => {
  it('only adds places when zooming in and only removes them when zooming out', () => {
    let previous: string[] = []
    for (let zoom = 5; zoom <= 10; zoom += 0.25) {
      const names = nestedPlaces(zoom, 50, MAP_PLACES).map((place) => place.name)
      expect(names.slice(0, previous.length)).toEqual(previous)
      previous = names
    }
    expect(previous.length).toBeGreaterThan(nestedPlaces(5, 50, MAP_PLACES).length)
  })
})
