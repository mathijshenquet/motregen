import { describe, expect, it } from 'vitest'
import { loadSavedPlaces, samePlace, savedPlaceId, storeSavedPlaces } from './saved-places'

describe('saved places', () => {
  it('round-trips valid custom-named places and ignores corrupt entries', () => {
    let stored = ''
    const storage = {
      getItem: () => stored,
      setItem: (_key: string, value: string) => { stored = value },
    }
    const place = { id: savedPlaceId(5.12142, 52.09074), name: 'Thuis', sourceLabel: 'Utrecht', lng: 5.12142, lat: 52.09074 }

    storeSavedPlaces([place], storage)
    expect(loadSavedPlaces(storage)).toEqual([place])
    stored = JSON.stringify([place, { id: 'broken', name: '', lng: 'nope', lat: 0 }])
    expect(loadSavedPlaces(storage)).toEqual([place])
    expect(samePlace(place, { lng: 5.121421, lat: 52.090741 })).toBe(true)
  })
})
