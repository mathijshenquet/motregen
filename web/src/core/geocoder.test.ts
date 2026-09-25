import { afterEach, describe, expect, it, vi } from 'vitest'
import { mergeSuggestions, suggestFlemishLocations, suggestLocations, suggestionContext, viewportCountry, type LocationSuggestion } from './geocoder'

afterEach(() => { vi.unstubAllGlobals() })

const nl = (label: string, detail?: string): LocationSuggestion => ({ id: `nl-${label}`, label, detail, type: 'woonplaats', country: 'NL' })
const be = (label: string): LocationSuggestion => ({ id: `be-${label}`, label, type: 'gemeente', country: 'BE', location: { lng: 4, lat: 51 } })

const pdokHasselt = { response: { docs: [
  { id: 'wpl-hasselt', weergavenaam: 'Hasselt, Zwartewaterland, Overijssel', type: 'woonplaats' },
  { id: 'wijk-de-hasselt', weergavenaam: 'De Hasselt Tilburg', type: 'wijk' },
] } }
const flemishHasselt = { LocationResult: [
  { ID: 71022, FormattedAddress: 'Hasselt', LocationType: 'basisregisters_gemeente', Location: { Lat_WGS84: 50.915, Lon_WGS84: 5.333 } },
  { ID: 1, FormattedAddress: 'Hassaluthdreef, Hasselt', LocationType: 'basisregisters_straat', Location: { Lat_WGS84: 50.909, Lon_WGS84: 5.354 } },
  { ID: 44021, FormattedAddress: 'Geraardsbergen', LocationType: 'basisregisters_gemeente', Location: { Lat_WGS84: 50.78, Lon_WGS84: 3.904 } },
] }

function stubSources(pdok: unknown, flemish: unknown): ReturnType<typeof vi.fn> {
  const fetch = vi.fn(async (input: URL | string) => {
    const url = String(input)
    const body = url.includes('geo.api.vlaanderen.be') ? flemish : pdok
    return body instanceof Error ? new Response('fout', { status: 503 }) : Response.json(body)
  })
  vi.stubGlobal('fetch', fetch)
  return fetch
}

describe('geocoder merge', () => {
  it('decides the viewport country from the place nearest the map centre', () => {
    expect(viewportCountry({ lng: 5.1, lat: 52.1 })).toBe('NL')
    expect(viewportCountry({ lng: 3.7, lat: 51.05 })).toBe('BE')
    expect(viewportCountry({ lng: 3.83, lat: 51.33 })).toBe('NL')
    // Wallonië en Duitsland vallen op de dichtstbijzijnde stad terug.
    expect(viewportCountry({ lng: 4.87, lat: 50.47 })).toBe('BE')
    expect(viewportCountry({ lng: 6.96, lat: 50.94 })).toBe('NL')
  })

  it('puts the viewport country first but keeps room for the other source', () => {
    const dutch = ['A', 'B', 'C', 'D', 'E'].map((label) => nl(`Nl${label}`))
    const flemish = ['A', 'B', 'C'].map((label) => be(`Be${label}`))
    expect(mergeSuggestions(dutch, flemish, { belgianFirst: false, query: 'x' }).map((s) => s.label)).toEqual(['NlA', 'NlB', 'NlC', 'NlD', 'BeA', 'BeB'])
    expect(mergeSuggestions(dutch, flemish, { belgianFirst: true, query: 'x' }).map((s) => s.label)).toEqual(['BeA', 'BeB', 'BeC', 'NlA', 'NlB', 'NlC'])
    expect(mergeSuggestions([], flemish, { belgianFirst: false, query: 'x' }).map((s) => s.label)).toEqual(['BeA', 'BeB', 'BeC'])
    expect(mergeSuggestions(dutch, [], { belgianFirst: true, query: 'x' })).toHaveLength(5)
  })

  it('promotes an exact name match from either country to the top', () => {
    const merged = mergeSuggestions([nl('Sas van Gent'), nl('Kern Sas van Gent')], [be('Gent')], { belgianFirst: false, query: ' gent ' })
    expect(merged.map((s) => s.label)).toEqual(['Gent', 'Sas van Gent', 'Kern Sas van Gent'])
  })

  it('keeps only Flemish municipalities with a usable centre, deduplicated', async () => {
    stubSources({}, { LocationResult: [
      ...flemishHasselt.LocationResult,
      { ID: 71022, FormattedAddress: 'Hasselt', LocationType: 'basisregisters_gemeente', Location: { Lat_WGS84: 50.915, Lon_WGS84: 5.333 } },
      { ID: 9, FormattedAddress: 'Nergens', LocationType: 'basisregisters_gemeente', Location: {} },
      { ID: 21004, FormattedAddress: 'Brussel', LocationType: 'urbis_gemeente', Location: { Lat_WGS84: 50.855, Lon_WGS84: 4.375 } },
    ] })
    const results = await suggestFlemishLocations('hass')
    expect(results.map((s) => s.label)).toEqual(['Hasselt', 'Geraardsbergen', 'Brussel'])
    expect(results[0]).toMatchObject({ country: 'BE', location: { lng: 5.333, lat: 50.915 } })
  })

  it('merges both live sources by map centre and labels Belgian rows "BE"', async () => {
    const fetch = stubSources(pdokHasselt, flemishHasselt)
    const fromUtrecht = await suggestLocations('Hasselt', { lng: 5.12, lat: 52.09 })
    expect(fromUtrecht.map((s) => `${s.label} (${suggestionContext(s)})`)).toEqual([
      'Hasselt (Zwartewaterland · Overijssel)', 'Hasselt (BE)', 'De Hasselt Tilburg (wijk)', 'Geraardsbergen (BE)',
    ])
    const fromGhent = await suggestLocations('Hasselt', { lng: 3.72, lat: 51.05 })
    expect(fromGhent.map((s) => s.country)).toEqual(['BE', 'NL', 'BE', 'NL'])
    expect(String(fetch.mock.calls.find(([url]) => String(url).includes('vlaanderen'))![0])).toContain('/geolocation/v4/Location?q=Hasselt')
  })

  it('survives one source failing and only gives up when both fail', async () => {
    stubSources(new Error('pdok'), flemishHasselt)
    expect((await suggestLocations('Hasselt', { lng: 5.12, lat: 52.09 })).map((s) => s.label)).toEqual(['Hasselt', 'Geraardsbergen'])
    stubSources(pdokHasselt, new Error('vlaanderen'))
    expect((await suggestLocations('Hasselt', { lng: 3.72, lat: 51.05 })).map((s) => s.country)).toEqual(['NL', 'NL'])
    stubSources(new Error('pdok'), new Error('vlaanderen'))
    await expect(suggestLocations('Hasselt', { lng: 5.12, lat: 52.09 })).rejects.toThrow()
  })
})
