import { findCataloguePlace, places } from './places.js'
import { placeSlug } from './slugify.js'
export { placeSlug } from './slugify.js'

export const slugNames: Readonly<Record<string, string>> = Object.fromEntries([
  ...places.map((place) => [placeSlug(place.name), place.name]),
  ['de-bilt', 'De Bilt'],
  ['s-hertogenbosch', "'s-Hertogenbosch"],
  ['s-gravenhage', "'s-Gravenhage"],
])

export function placeName(slug: string): string | undefined {
  if (slug.length > 120 || !/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(slug)) return undefined
  const normalized = placeSlug(slug)
  return findCataloguePlace(normalized)?.name ?? slugNames[normalized] ?? slug.toLowerCase().split('-').map((word) => word[0]!.toUpperCase() + word.slice(1)).join(' ')
}
