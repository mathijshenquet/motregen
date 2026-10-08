import { describe, expect, it } from 'vitest'
import { grantedStartFix, loadLastLocation, loadLastSavedPlaceId, loadMapView, resolveStartLocation, storeLastLocation, storeLastSavedPlaceId, storeMapView } from './location-memory'
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
  it('keeps a dropped pin apart from the camera and the previous favorite', () => {
    const pin = { lng: 4.923456, lat: 52.402345, label: 'Amsterdam' }
    const storage = memoryStorage()
    storeLastLocation(pin, storage)
    expect(loadLastLocation(storage)).toEqual(pin)
    expect(resolveStartLocation([home], 'home', { lng: 5.1, lat: 52.1, zoom: 7 }, deBilt, pin)).toBe(pin)
  })

  it('prefers the last clicked saved place, then the last map view, then De Bilt', () => {
    const view = { lng: 6.57, lat: 53.21, zoom: 8.5 }
    expect(resolveStartLocation([home], 'home', view, deBilt)).toEqual({ lng: home.lng, lat: home.lat, label: 'Thuis' })
    expect(resolveStartLocation([home], 'removed', view, deBilt)).toEqual({ lng: 6.57, lat: 53.21, label: 'Groningen' })
    expect(resolveStartLocation([], undefined, undefined, deBilt)).toBe(deBilt)
  })

  it('restores city membership without loading a catalogue, and ignores damaged zone metadata', () => {
    const pin = {
      lng: 4.923456, lat: 52.402345, label: 'Thuis',
      place: { name: 'Landsmeer', slug: 'landsmeer', zones: [{ name: 'Landsmeer', slug: 'landsmeer' }, { name: 'Amsterdam', slug: 'amsterdam' }] },
    }
    const storage = memoryStorage()
    storeLastLocation(pin, storage)
    expect(loadLastLocation(storage)).toEqual(pin)
    expect(loadLastLocation(storage)?.place?.zones.find((zone) => zone.slug === 'amsterdam')?.name).toBe('Amsterdam')
    storeLastLocation({ ...pin, place: { ...pin.place, zones: ['damaged' as never] } }, storage)
    expect(loadLastLocation(storage)).toEqual({ lng: pin.lng, lat: pin.lat, label: pin.label })
    expect(resolveStartLocation([{ ...home, place: pin.place }], 'home', undefined, deBilt).place).toEqual(pin.place)
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
    expect(loadLastLocation(broken)).toBeUndefined()
    expect(() => storeMapView({ lng: 5, lat: 52, zoom: 7 }, broken)).not.toThrow()
    expect(() => storeLastSavedPlaceId('home', broken)).not.toThrow()
    expect(() => storeLastLocation(deBilt, broken)).not.toThrow()
    for (const corrupt of ['{', '[]', '{"lng":4.9,"lat":52.4}', '{"lng":4.9,"lat":91,"label":"Amsterdam"}']) {
      expect(loadLastLocation(memoryStorage({ 'motregen-last-location': corrupt }))).toBeUndefined()
    }
  })
})

describe('granted start fix', () => {
  const within = { west: 2.5, south: 49.4, east: 7.3, north: 53.7 }
  const utrecht = { longitude: 5.12, latitude: 52.09 }
  const permissions = (state: PermissionState) => ({ query: async () => ({ state }) as PermissionStatus })
  const geolocation = (coords: { longitude: number; latitude: number } | undefined) => {
    const calls: Array<PositionOptions | undefined> = []
    return {
      calls,
      getCurrentPosition: (success: PositionCallback, failure?: PositionErrorCallback | null, options?: PositionOptions) => {
        calls.push(options)
        if (coords) success({ coords } as GeolocationPosition)
        else failure?.({ code: 3 } as GeolocationPositionError)
      },
    }
  }

  it('takes the current position when permission was already granted', async () => {
    const source = geolocation(utrecht)
    expect(await grantedStartFix({ permissions: permissions('granted'), geolocation: source }, within)).toEqual({ lng: 5.12, lat: 52.09, label: 'Mijn locatie' })
    expect(source.calls).toEqual([expect.objectContaining({ timeout: 10_000 })])
  })

  it('never prompts: prompt, denied and a missing Permissions API keep the remembered place', async () => {
    for (const state of ['prompt', 'denied'] as const) {
      const source = geolocation(utrecht)
      expect(await grantedStartFix({ permissions: permissions(state), geolocation: source }, within)).toBeUndefined()
      expect(source.calls).toEqual([])
    }
    const source = geolocation(utrecht)
    expect(await grantedStartFix({ geolocation: source }, within)).toBeUndefined()
    expect(source.calls).toEqual([])
    const throwing = { query: async () => { throw new TypeError('geolocation') } }
    expect(await grantedStartFix({ permissions: throwing, geolocation: source }, within)).toBeUndefined()
  })

  it('keeps the remembered place when the fix fails or lies outside the map', async () => {
    expect(await grantedStartFix({ permissions: permissions('granted'), geolocation: geolocation(undefined) }, within)).toBeUndefined()
    expect(await grantedStartFix({ permissions: permissions('granted'), geolocation: geolocation({ longitude: -3.7, latitude: 40.4 }) }, within)).toBeUndefined()
  })
})
