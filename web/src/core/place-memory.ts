export interface PlaceIdentity {
  name: string
  slug: string
}

export interface PlaceMemory extends PlaceIdentity {
  zones: PlaceIdentity[]
}

export function readPlaceMemory(value: unknown): PlaceMemory | undefined {
  if (!isPlaceIdentity(value)) return undefined
  const zones = (value as Partial<PlaceMemory>).zones
  if (!Array.isArray(zones) || zones.length > 100 || !zones.every(isPlaceIdentity)) return undefined
  return { name: value.name, slug: value.slug, zones: zones.map(({ name, slug }) => ({ name, slug })) }
}

function isPlaceIdentity(value: unknown): value is PlaceIdentity {
  if (!value || typeof value !== 'object') return false
  const { name, slug } = value as Partial<PlaceIdentity>
  return typeof name === 'string' && name.trim().length > 0 && name.length <= 120
    && typeof slug === 'string' && slug.length <= 120 && /^[\p{L}\p{N}]+(?:-[\p{L}\p{N}]+)*$/u.test(slug)
}
