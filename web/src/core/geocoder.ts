import { lookupLocation, suggestLocations as suggestDutchLocations } from './pdok'
import { nearestPlace } from './places'

// Vlaamse geolocatiedienst (Digitaal Vlaanderen): gratis, zonder sleutel, CORS open.
// Zie docs/geocoding.md voor URL en gebruiksbeleid.
const flemishBaseUrl = 'https://geo.api.vlaanderen.be/geolocation/v4/'
const flemishMunicipalityTypes = new Set(['basisregisters_gemeente', 'urbis_gemeente'])

export type Country = 'NL' | 'BE'

export interface LocationSuggestion {
  id: string
  label: string
  detail?: string
  type: string
  country: Country
  // Bronnen die meteen een middelpunt geven hoeven geen tweede lookup.
  location?: { lng: number; lat: number }
}

interface FlemishResponse {
  LocationResult?: Array<{
    ID?: number
    FormattedAddress?: string
    LocationType?: string
    Location?: { Lat_WGS84?: number; Lon_WGS84?: number }
  }>
}

const maxResults = 6
const reservedForSecondary = 2

export async function suggestLocations(query: string, center: { lng: number; lat: number }, signal?: AbortSignal): Promise<LocationSuggestion[]> {
  const [dutch, flemish] = await Promise.allSettled([
    suggestDutchLocations(query, signal).then((results) => results.map((result): LocationSuggestion => ({ ...result, country: 'NL' }))),
    suggestFlemishLocations(query, signal),
  ])
  // Eén bron die faalt verbergt de andere niet; alleen als beide falen is zoeken onbeschikbaar.
  if (dutch.status === 'rejected' && flemish.status === 'rejected') throw dutch.reason
  return mergeSuggestions(
    dutch.status === 'fulfilled' ? dutch.value : [],
    flemish.status === 'fulfilled' ? flemish.value : [],
    { belgianFirst: viewportCountry(center) === 'BE', query },
  )
}

export async function resolveLocation(suggestion: LocationSuggestion, signal?: AbortSignal): Promise<{ lng: number; lat: number }> {
  return suggestion.location ?? lookupLocation(suggestion.id, signal)
}

export function viewportCountry(center: { lng: number; lat: number }): Country {
  return nearestPlace(center.lng, center.lat).country ?? 'NL'
}

// Bron van het kaartcentrum eerst, de andere houdt een paar plaatsen; een exacte naamtreffer
// ("Gent", "Hasselt") gaat altijd voor, zodat een Belgische stad niet onder Nederlandse wijken verdwijnt.
export function mergeSuggestions(
  dutch: readonly LocationSuggestion[],
  flemish: readonly LocationSuggestion[],
  options: { belgianFirst: boolean; query: string },
): LocationSuggestion[] {
  const [primary, secondary] = options.belgianFirst ? [flemish, dutch] : [dutch, flemish]
  const secondaryCount = Math.min(secondary.length, Math.max(reservedForSecondary, maxResults - primary.length))
  const merged = [...primary.slice(0, maxResults - secondaryCount), ...secondary.slice(0, secondaryCount)]
  const query = normalized(options.query)
  const exact = merged.filter((suggestion) => normalized(suggestion.label) === query)
  return [...exact, ...merged.filter((suggestion) => !exact.includes(suggestion))]
}

export async function suggestFlemishLocations(query: string, signal?: AbortSignal): Promise<LocationSuggestion[]> {
  const url = new URL('Location', flemishBaseUrl)
  url.searchParams.set('q', query)
  url.searchParams.set('c', '10')
  const response = await fetch(url, { signal })
  if (!response.ok) throw new Error(`Zoeken in Vlaanderen mislukt (${response.status})`)
  const data = await response.json() as FlemishResponse
  const seen = new Set<string>()
  return (data.LocationResult ?? []).flatMap((result): LocationSuggestion[] => {
    const lng = result.Location?.Lon_WGS84, lat = result.Location?.Lat_WGS84
    if (!result.FormattedAddress || !result.LocationType || !flemishMunicipalityTypes.has(result.LocationType)) return []
    if (typeof lng !== 'number' || typeof lat !== 'number' || !Number.isFinite(lng) || !Number.isFinite(lat)) return []
    if (seen.has(result.FormattedAddress)) return []
    seen.add(result.FormattedAddress)
    return [{ id: `vl:${result.LocationType}:${result.ID ?? result.FormattedAddress}`, label: result.FormattedAddress, type: 'gemeente', country: 'BE', location: { lng, lat } }]
  }).slice(0, 5)
}

export function suggestionContext(suggestion: LocationSuggestion): string {
  if (suggestion.country === 'BE') return [suggestion.detail, 'BE'].filter(Boolean).join(' · ')
  return suggestion.detail ?? suggestion.type
}

function normalized(value: string): string {
  return value.trim().toLocaleLowerCase('nl-NL')
}
