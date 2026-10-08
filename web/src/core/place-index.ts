import { placeSlug } from './slugify.js'

export interface CataloguePlace {
  name: string
  slug: string
  lng: number
  lat: number
  rank: number
  population: number
  kind: 'city' | 'town' | 'village'
}

interface PlaceNode {
  place: CataloguePlace
  axis: 'lng' | 'lat'
  left?: PlaceNode
  right?: PlaceNode
}

const longitudeScale = Math.cos(52 * Math.PI / 180)

function squaredDistance(point: { lng: number; lat: number }, candidate: { lng: number; lat: number }): number {
  const longitudeDifference = (candidate.lng - point.lng) * longitudeScale
  const latitudeDifference = candidate.lat - point.lat
  return longitudeDifference ** 2 + latitudeDifference ** 2
}

function buildTree(places: readonly CataloguePlace[], depth = 0): PlaceNode | undefined {
  if (!places.length) return undefined
  const axis = depth % 2 === 0 ? 'lng' : 'lat'
  const sorted = [...places].sort((left, right) => left[axis] - right[axis] || left.slug.localeCompare(right.slug))
  const middle = Math.floor(sorted.length / 2)
  return {
    place: sorted[middle]!, axis,
    left: buildTree(sorted.slice(0, middle), depth + 1),
    right: buildTree(sorted.slice(middle + 1), depth + 1),
  }
}

export class PlaceIndex {
  private readonly root: PlaceNode
  private readonly slugs = new Map<string, CataloguePlace>()
  private readonly names = new Map<string, CataloguePlace[]>()

  constructor(places: readonly CataloguePlace[]) {
    const root = buildTree(places)
    if (!root) throw new Error('Plaatsenlijst is leeg')
    this.root = root
    for (const place of places) {
      if (this.slugs.has(place.slug)) throw new Error(`Dubbele plaats-slug: ${place.slug}`)
      this.slugs.set(place.slug, place)
      const name = placeSlug(place.name)
      this.names.set(name, [...this.names.get(name) ?? [], place])
    }
  }

  find(slug: string): CataloguePlace | undefined {
    return this.slugs.get(placeSlug(slug))
  }

  named(name: string, point: { lng: number; lat: number }): CataloguePlace | undefined {
    const candidates = this.names.get(placeSlug(name))
    return candidates?.reduce((nearest, candidate) => squaredDistance(point, candidate) < squaredDistance(point, nearest) ? candidate : nearest)
  }

  nearest(lng: number, lat: number): CataloguePlace {
    const point = { lng, lat }
    let nearest = this.root.place
    let nearestDistance = squaredDistance(point, nearest)
    const visit = (node: PlaceNode | undefined): void => {
      if (!node) return
      const distance = squaredDistance(point, node.place)
      if (distance < nearestDistance || (distance === nearestDistance && node.place.slug < nearest.slug)) {
        nearest = node.place
        nearestDistance = distance
      }
      const difference = (point[node.axis] - node.place[node.axis]) * (node.axis === 'lng' ? longitudeScale : 1)
      visit(difference < 0 ? node.left : node.right)
      if (difference ** 2 <= nearestDistance) visit(difference < 0 ? node.right : node.left)
    }
    visit(this.root)
    return nearest
  }
}

export function belongsToPlace(point: { lng: number; lat: number }, place: CataloguePlace, index: Pick<PlaceIndex, 'nearest'>): boolean {
  if (index.nearest(point.lng, point.lat).slug === place.slug) return true
  const radiusKm = place.kind === 'city' ? 8 : place.kind === 'town' ? 5 : 3
  const radians = Math.PI / 180
  const latitudeDifference = (point.lat - place.lat) * radians
  const longitudeDifference = (point.lng - place.lng) * radians
  const haversine = Math.sin(latitudeDifference / 2) ** 2
    + Math.cos(point.lat * radians) * Math.cos(place.lat * radians) * Math.sin(longitudeDifference / 2) ** 2
  const distanceKm = 6371 * 2 * Math.asin(Math.sqrt(Math.min(1, haversine)))
  return distanceKm <= radiusKm
}
