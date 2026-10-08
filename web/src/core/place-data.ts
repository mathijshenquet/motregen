import type { CataloguePlace } from './place-index.js'
import { placeSlug } from './slugify.js'

export interface CompactPlaces {
  names: string[]
  columns: string[]
  suffixes: Record<string, string>
  coordinateScale: number
}

function decodeIntegers(encoded: string): number[] {
  const bytes = atob(encoded)
  const values: number[] = []
  let value = 0
  let multiplier = 1
  for (const character of bytes) {
    const byte = character.charCodeAt(0)
    value += (byte & 127) * multiplier
    if (byte < 128) {
      values.push(value)
      value = 0
      multiplier = 1
    } else {
      multiplier *= 128
      if (multiplier > 2 ** 35) throw new Error('Ongeldige plaatsenlijst')
    }
  }
  if (multiplier !== 1) throw new Error('Onvolledige plaatsenlijst')
  return values
}

function signedInteger(value: number): number {
  return value % 2 ? -(value + 1) / 2 : value / 2
}

export function decodePlaces(data: CompactPlaces): CataloguePlace[] {
  if (!data.names.length || data.columns.length !== 4 || data.coordinateScale !== 1000) throw new Error('Ongeldige plaatsenlijst')
  const columns = data.columns.map(decodeIntegers)
  if (columns.some((column) => column.length !== data.names.length)) throw new Error('Onvolledige plaatsenlijst')
  let longitude = 0
  let latitude = 0
  return data.names.map((name, index) => {
    longitude += signedInteger(columns[0]![index]!)
    latitude += signedInteger(columns[1]![index]!)
    const category = columns[2]![index]!
    const kind = (['city', 'town', 'village'] as const)[category % 3]!
    const suffix = data.suffixes[index]
    const slug = suffix ? `${placeSlug(name)}-${suffix}` : placeSlug(name)
    return {
      name, slug, lng: longitude / data.coordinateScale, lat: latitude / data.coordinateScale,
      kind, rank: Math.floor(category / 3), population: columns[3]![index]!,
    }
  })
}
