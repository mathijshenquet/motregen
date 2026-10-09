import { readFileSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import { describe, expect, it, vi } from 'vitest'
import { decodePlaces, type CompactPlaces } from './place-data'
import { PlaceIndex } from './place-index'
import { placesUrl } from './places-asset'

const json = readFileSync(new URL(`../../public${placesUrl}`, import.meta.url), 'utf8')
const catalogue = decodePlaces(JSON.parse(json) as CompactPlaces)

describe('generated place catalogue', () => {
  it('contains the complete map catalogue, unique slugs and finite centres within 60 KiB gzip', () => {
    expect(catalogue.length).toBeGreaterThan(6900)
    expect(gzipSync(json, { level: 9 }).length).toBeLessThanOrEqual(61_440)
    expect(new Set(catalogue.map((place) => place.slug)).size).toBe(catalogue.length)
    expect(catalogue.every((place) => Number.isFinite(place.lng) && Number.isFinite(place.lat))).toBe(true)
    const index = new PlaceIndex(catalogue)
    for (const name of ['Amstelveen', 'Hoofddorp', 'Woerden']) {
      const place = catalogue.find((place) => place.name === name)!
      expect(place).toBeDefined()
      expect(index.nearest(place.lng, place.lat).name).toBe(name)
    }
    expect(catalogue.some((place) => place.name === 'Gent')).toBe(true)
    expect(catalogue.some((place) => place.name === 'Kleef')).toBe(true)
  })

  it('loads once, restores distinct names and shares duplicate names without private labels', async () => {
    const fetch = vi.fn(async () => new Response(json))
    vi.stubGlobal('fetch', fetch)
    try {
      const { loadPlaces, nearestPlace, places, rememberSearchedPlace } = await import('./places')
      const { parsePresetPath, shareUrl } = await import('./presets')
      const { viewportCountry } = await import('./geocoder')
      const request = loadPlaces()
      expect(loadPlaces()).toBe(request)
      expect(await request).toBe(true)
      expect(fetch).toHaveBeenCalledTimes(1)
      expect(fetch).toHaveBeenCalledWith(placesUrl, expect.anything())
      expect(places).toHaveLength(67)
      expect(nearestPlace(4.86, 52.303).name).toBe('Amstelveen')
      expect(viewportCountry({ lng: 3.73, lat: 51.06 })).toBe('BE')
      expect(viewportCountry({ lng: 5.12, lat: 52.09 })).toBe('NL')
      const repeated = catalogue.find((place) => place.name === 'Bergen' && place.slug !== 'bergen')!
      const remembered = rememberSearchedPlace(repeated, repeated.name)
      expect(remembered.zones.some((zone) => zone.slug === repeated.slug)).toBe(true)
      expect(remembered.zones.some((zone) => zone.slug === 'bergen')).toBe(false)
      expect(parsePresetPath(`/weer/${repeated.slug}`)).toEqual({ mode: 'weather', place: repeated.name, placeSlug: repeated.slug })
      const url = new URL(shareUrl({ mode: 'weather', epoch: 0, point: repeated, place: 'Bij oma', savedPlace: true }, 'https://motregen.nl'))
      expect(url.pathname).toBe(`/weer/${repeated.slug}`)
      expect(url.href).not.toMatch(/lat=|lon=|oma/)
      expect(new URL(shareUrl({ mode: 'weather', epoch: 0, point: repeated, place: repeated.name }, 'https://motregen.nl')).pathname).toBe(`/weer/${repeated.slug}`)
    } finally { vi.unstubAllGlobals() }
  })
})
