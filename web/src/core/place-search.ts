import { placeSlug } from './slugify.js'

export interface SearchPlace { name: string; slug: string; lng: number; lat: number; population?: number }

const aliases: Record<string, string> = { ams: 'amsterdam', adam: 'amsterdam', rdam: 'rotterdam', rtm: 'rotterdam', dh: 'den-haag', ut: 'utrecht', utr: 'utrecht', eind: 'eindhoven', gron: 'groningen', sgravenhage: 'den-haag' }

export function placeQuery(query: string): string {
  const normalized = placeSlug(query)
  return aliases[normalized] ?? normalized
}

export function searchPlaces<T extends SearchPlace>(query: string, places: readonly T[]): { place?: T; suggestions: T[] } {
  const normalized = placeQuery(query)
  const ranked = places.map((place) => {
    const name = placeSlug(place.name)
    const distance = editDistance(normalized, name)
    const score = normalized === place.slug || normalized === name ? 0
      : name.startsWith(normalized) ? 1 : name.includes(normalized) ? 2 : 3 + distance
    return { place, distance, score }
  }).sort((left, right) => left.score - right.score || (right.place.population ?? 0) - (left.place.population ?? 0) || left.place.slug.localeCompare(right.place.slug))
  const best = ranked[0]
  const exact = ranked.filter((entry) => entry.score === 0)
  const uniqueTypo = best && normalized.length >= 5 && best.score >= 3 && best.distance <= Math.min(2, Math.floor(normalized.length / 4))
    && ranked[1]?.score !== best.score
  const place = normalized && (exact.length === 1 || uniqueTypo) ? best?.place : undefined
  return { place, suggestions: ranked.slice(0, 3).map((entry) => entry.place) }
}

function editDistance(left: string, right: string): number {
  let previous = Array.from({ length: right.length + 1 }, (_, index) => index)
  for (let row = 1; row <= left.length; row++) {
    const current = [row]
    for (let column = 1; column <= right.length; column++) {
      current[column] = Math.min(current[column - 1]! + 1, previous[column]! + 1, previous[column - 1]! + (left[row - 1] === right[column - 1] ? 0 : 1))
    }
    previous = current
  }
  return previous[right.length]!
}
