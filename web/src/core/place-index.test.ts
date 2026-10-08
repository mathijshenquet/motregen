import { describe, expect, it } from 'vitest'
import { belongsToPlace, PlaceIndex, type CataloguePlace } from './place-index'

const amsterdam: CataloguePlace = { name: 'Amsterdam', slug: 'amsterdam', lng: 4.9, lat: 52.37, kind: 'city', rank: 2, population: 900000 }
const landsmeer: CataloguePlace = { name: 'Landsmeer', slug: 'landsmeer', lng: 4.91, lat: 52.43, kind: 'village', rank: 9, population: 10000 }
const haarlem: CataloguePlace = { name: 'Haarlem', slug: 'haarlem', lng: 4.64, lat: 52.38, kind: 'city', rank: 5, population: 160000 }

describe('place zones', () => {
  const index = new PlaceIndex([amsterdam, landsmeer, haarlem])

  it('keeps Amsterdam-Noord even when a nearby village is nearer, but excludes Haarlem', () => {
    const noord = { lng: 4.92, lat: 52.409 }
    expect(index.nearest(noord.lng, noord.lat).slug).toBe('landsmeer')
    expect(belongsToPlace(noord, amsterdam, index)).toBe(true)
    expect(belongsToPlace(noord, haarlem, index)).toBe(false)
  })

  it.each([['city', 8], ['town', 5], ['village', 3]] as const)('uses the %s radius of %i km', (kind, radius) => {
    const place = { ...amsterdam, kind }
    const otherNearest = { nearest: () => landsmeer }
    const latitudePerKm = 180 / (Math.PI * 6371)
    expect(belongsToPlace({ lng: place.lng, lat: place.lat + (radius - 0.01) * latitudePerKm }, place, otherNearest)).toBe(true)
    expect(belongsToPlace({ lng: place.lng, lat: place.lat + (radius + 0.01) * latitudePerKm }, place, otherNearest)).toBe(false)
  })

  it('also accepts the same nearest slug beyond the radius', () => {
    expect(belongsToPlace({ lng: 5.2, lat: 52.37 }, amsterdam, { nearest: () => amsterdam })).toBe(true)
  })

  it('remembers every matching zone, including a larger city around a nearer village', () => {
    const noord = { lng: 4.92, lat: 52.409 }
    expect(index.zones(noord).map((place) => place.slug).sort()).toEqual(['amsterdam', 'landsmeer'])
  })
})

describe('place index', () => {
  it('matches a brute-force reference across thousands of candidates and boundary queries', () => {
    const places = Array.from({ length: 5000 }, (_, index): CataloguePlace => ({
      name: `Plaats ${index}`, slug: `plaats-${index}`, lng: 2.5 + (index % 100) * 0.047,
      lat: 50.45 + Math.floor(index / 100) * 0.061, kind: 'village', rank: 10, population: 0,
    }))
    const index = new PlaceIndex(places)
    const scale = Math.cos(52 * Math.PI / 180)
    for (let query = 0; query < 100; query++) {
      const point = { lng: 2 + query * 0.0631, lat: 50 + (query % 29) * 0.1517 }
      const distance = (place: CataloguePlace) => ((place.lng - point.lng) * scale) ** 2 + (place.lat - point.lat) ** 2
      const nearest = places.reduce((nearest, place) => distance(place) < distance(nearest) ? place : nearest)
      expect(index.nearest(point.lng, point.lat).slug).toBe(nearest.slug)
      if (point.lat >= 50 && point.lat <= 54) {
        const zones = places.filter((place) => belongsToPlace(point, place, { nearest: () => nearest }))
        expect(index.zones(point).map((place) => place.slug).sort()).toEqual(zones.map((place) => place.slug).sort())
      }
    }
  })

  it('resolves repeated names by location and rejects repeated slugs', () => {
    const west = { ...landsmeer, name: 'Bergen', slug: 'bergen' }
    const east = { ...landsmeer, name: 'Bergen', slug: 'bergen-limburg', lng: 6.1, lat: 51.6 }
    const index = new PlaceIndex([west, east])
    expect(index.find('bergen-limburg')).toBe(east)
    expect(index.named('Bergen', east)).toBe(east)
    expect(() => new PlaceIndex([west, west])).toThrow('Dubbele plaats-slug')
    expect(() => new PlaceIndex([])).toThrow('Plaatsenlijst is leeg')
  })
})
