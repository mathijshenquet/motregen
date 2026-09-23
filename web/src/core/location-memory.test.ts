import { describe, expect, it } from 'vitest'
import { loadLastSavedPlaceId, loadMapView, resolveStartLocation, storeLastSavedPlaceId, storeMapView } from './location-memory'
import type { SavedPlace } from './saved-places'

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial))
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value) },
  }
}

const deBilt = { lng: 5.18, lat: 52.1, label: 'De Bilt' }
const home: SavedPlace = { id: 'home', name: 'Thuis', sourceLabel: 'Utrecht', lng: 5.12142, lat: 52.09074 }

describe('location memory', () => {
  it('prefers the last clicked saved place, then the last map view, then De Bilt', () => {
    const view = { lng: 6.57, lat: 53.21, zoom: 8.5 }
    expect(resolveStartLocation([home], 'home', view, deBilt)).toEqual({ lng: home.lng, lat: home.lat, label: 'Thuis' })
    expect(resolveStartLocation([home], 'removed', view, deBilt)).toEqual({ lng: 6.57, lat: 53.21, label: 'Groningen' })
    expect(resolveStartLocation([], undefined, undefined, deBilt)).toBe(deBilt)
  })

  it('round-trips motregen-prefixed keys', () => {
    const storage = memoryStorage()
    storeLastSavedPlaceId('home', storage)
    storeMapView({ lng: 5.123456789, lat: 52.0987654, zoom: 7.4567 }, storage)
    expect([...storage.values.keys()].every((key) => key.startsWith('motregen-'))).toBe(true)
    expect(loadLastSavedPlaceId(storage)).toBe('home')
    expect(loadMapView(storage)).toEqual({ lng: 5.12346, lat: 52.09877, zoom: 7.46 })
  })

  it('falls back silently on corrupt or unavailable storage', () => {
    for (const corrupt of ['{', '[]', '"x"', '{"lng":5,"lat":52}', '{"lng":"5","lat":52,"zoom":7}', '{"lng":5,"lat":99,"zoom":7}', '{"lng":null,"lat":52,"zoom":7}']) {
      expect(loadMapView(memoryStorage({ 'motregen-map-view': corrupt }))).toBeUndefined()
    }
    const broken = { getItem: () => { throw new Error('denied') }, setItem: () => { throw new Error('denied') } }
    expect(loadMapView(broken)).toBeUndefined()
    expect(loadLastSavedPlaceId(broken)).toBeUndefined()
    expect(() => storeMapView({ lng: 5, lat: 52, zoom: 7 }, broken)).not.toThrow()
    expect(() => storeLastSavedPlaceId('home', broken)).not.toThrow()
  })
})
