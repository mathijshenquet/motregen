import { expect, it } from 'vitest'
import { expandPlaceQuery, searchPlaces } from './place-search'

const candidates = [
  { name: 'Amsterdam', slug: 'amsterdam', lng: 4.9, lat: 52.37, population: 900000 },
  { name: 'Amsterdam-Zuidoost', slug: 'amsterdam-zuidoost', lng: 4.97, lat: 52.31 },
  { name: 'Amstelveen', slug: 'amstelveen', lng: 4.86, lat: 52.3 },
  { name: 'Bergen', slug: 'bergen-nh', lng: 4.7, lat: 52.6 },
  { name: 'Bergen', slug: 'bergen-li', lng: 6, lat: 51.5 },
]

it('resolves aliases, accents, typos and local names but asks for an ambiguous place', () => {
  for (const query of ['ams', 'Ámsterdam', 'amstedam', 'amsterdamm']) expect(searchPlaces(query, candidates).place?.slug).toBe('amsterdam')
  expect(searchPlaces('amsterdam zuidoost', candidates).place?.slug).toBe('amsterdam-zuidoost')
  expect(searchPlaces('Bergen', candidates).place).toBeUndefined()
  expect(searchPlaces('Bergen', candidates).suggestions).toHaveLength(3)
  expect(searchPlaces('bergen-li', candidates).place?.slug).toBe('bergen-li')
  expect(searchPlaces('', candidates).place).toBeUndefined()
  expect(expandPlaceQuery('ams')).toBe('amsterdam')
  expect(expandPlaceQuery('Hasselt')).toBe('Hasselt')
})
