import { createHash } from 'node:crypto'
import { decodePlaces, type CompactPlaces } from '../web/src/core/place-data.js'
import { expandPlaceQuery, placeQuery, searchPlaces, type SearchPlace } from '../web/src/core/place-search.js'
import { places } from '../web/src/core/places.js'
import { placesUrl } from '../web/src/core/places-asset.js'
import { resolveLocation, suggestLocations } from '../web/src/core/geocoder.js'
import { placeSlug } from '../web/src/core/slugify.js'

export class WeatherPlaces {
  private catalogue?: Promise<SearchPlace[]>
  private readonly callbacks = new Map<string, { place: SearchPlace; expires: number }>()

  constructor(private readonly origin: string) {}

  private load(): Promise<SearchPlace[]> {
    this.catalogue ??= fetch(new URL(placesUrl, this.origin), { signal: AbortSignal.timeout(5000) }).then(async (response) => {
      if (!response.ok) throw new Error('Plaatsenlijst ontbreekt')
      return decodePlaces(await response.json() as CompactPlaces)
    }).catch(() => {
      this.catalogue = undefined
      return places.map((place) => ({ ...place, slug: placeSlug(place.name) }))
    })
    return this.catalogue
  }

  async find(query: string): Promise<{ place?: SearchPlace; suggestions: SearchPlace[] }> {
    const local = searchPlaces(query, await this.load())
    if (local.place || !query.trim()) return local
    try {
      const signal = AbortSignal.timeout(5000)
      const external = await suggestLocations(expandPlaceQuery(query), { lng: 5.18, lat: 52.1 }, signal)
      const suggestions = await Promise.all(external.slice(0, 3).map(async (suggestion) => ({
        name: suggestion.label, slug: placeSlug(suggestion.label), ...await resolveLocation(suggestion, signal),
      })))
      const exact = suggestions.filter((place) => placeQuery(place.name) === placeQuery(query))
      if (exact.length === 1) return { place: exact[0], suggestions }
      if (suggestions.length) return { suggestions }
    } catch {}
    return local
  }

  button(place: SearchPlace): { text: string; callback_data: string } {
    for (const [key, entry] of this.callbacks) if (entry.expires < Date.now()) this.callbacks.delete(key)
    const key = createHash('sha256').update(JSON.stringify([place.slug, place.lng, place.lat])).digest('hex').slice(0, 20)
    this.callbacks.set(key, { place, expires: Date.now() + 2 * 3_600_000 })
    if (this.callbacks.size > 1000) this.callbacks.delete(this.callbacks.keys().next().value!)
    return { text: place.name, callback_data: `weer:${key}` }
  }

  fromCallback(data: string): SearchPlace | undefined {
    const entry = this.callbacks.get(data.slice('weer:'.length))
    return entry && entry.expires > Date.now() ? entry.place : undefined
  }
}
