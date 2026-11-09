import { describe, expect, it } from 'vitest'
import { islandBox, nestedPlaces, placeNamePaddingPx, placeNumberSpacingPx, TEMPERATURE_NUMBER_PLACES, temperatureLabelSize } from './temperature-numbers'

describe('temperature numbers (U100 ronde 3)', () => {
  it('uses 13 px on desktop and 12 px on a phone', () => {
    expect(temperatureLabelSize(1440, 900)).toBe(13)
    expect(temperatureLabelSize(402, 844)).toBe(12)
  })

  it('spaces the places like the wind socks and sizes the collision box from the text', () => {
    expect(placeNumberSpacingPx(1440, 900)).toBe(56)
    expect(placeNumberSpacingPx(402, 844)).toBe(40)
    expect(islandBox('10°', 13)).toEqual({ width: 36, height: 19 })
    expect(placeNamePaddingPx(6.9)).toBe(18)
    expect(placeNamePaddingPx(10.5)).toBe(4)
  })
})

describe('stable places while zooming', () => {
  it('only adds places when zooming in and only removes them when zooming out', () => {
    let previous: string[] = []
    for (let zoom = 5; zoom <= 10; zoom += 0.25) {
      const names = nestedPlaces(zoom, 50, TEMPERATURE_NUMBER_PLACES).map((place) => place.name)
      expect(names.slice(0, previous.length)).toEqual(previous)
      previous = names
    }
    expect(previous.length).toBeGreaterThan(nestedPlaces(5, 50, TEMPERATURE_NUMBER_PLACES).length)
  })

})
