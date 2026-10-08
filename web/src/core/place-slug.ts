import { places } from './places.js'

export function placeSlug(name: string): string {
  return name.trim().normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/['’]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export const slugNames: Readonly<Record<string, string>> = Object.fromEntries([
  ...places.map((place) => [placeSlug(place.name), place.name]),
  ['de-bilt', 'De Bilt'],
  ['s-hertogenbosch', "'s-Hertogenbosch"],
  ['s-gravenhage', "'s-Gravenhage"],
])

export function placeName(slug: string): string | undefined {
  if (slug.length > 120 || !/^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(slug)) return undefined
  const normalized = placeSlug(slug)
  return slugNames[normalized] ?? slug.toLowerCase().split('-').map((word) => word[0]!.toUpperCase() + word.slice(1)).join(' ')
}
