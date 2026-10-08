import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

interface Point { name: string; lng: number; lat: number }
interface Boundary {
  properties: { naam: string }
  geometry: { type: 'MultiPolygon'; coordinates: number[][][][] }
}

function containsRing(ring: number[][], point: Point): boolean {
  let inside = false
  for (let current = 0, previous = ring.length - 1; current < ring.length; previous = current++) {
    const [longitude, latitude] = ring[current]!
    const [previousLongitude, previousLatitude] = ring[previous]!
    if ((latitude! > point.lat) !== (previousLatitude! > point.lat)
      && point.lng < (previousLongitude! - longitude!) * (point.lat - latitude!) / (previousLatitude! - latitude!) + longitude!) inside = !inside
  }
  return inside
}

export async function updateMunicipalities(root: string, points: readonly Point[]): Promise<void> {
  const path = resolve(root, 'tools/basemap/place-municipalities.json')
  const municipalities: Record<string, string> = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : {}
  const keyFor = (point: Point) => `${point.name}:${point.lng}:${point.lat}`
  const missing = points.filter((point) => !municipalities[keyFor(point)])
  if (!missing.length) return
  const response = await fetch('https://api.pdok.nl/kadaster/bestuurlijkegebieden/ogc/v1/collections/gemeentegebied/items?f=json&limit=1000')
  if (!response.ok) throw new Error(`PDOK gemeentegrenzen: ${response.status}`)
  const boundaries = (await response.json() as { features: Boundary[] }).features
  for (const point of missing) {
    const boundary = boundaries.find((boundary) => boundary.geometry.coordinates.some((polygon) =>
      containsRing(polygon[0]!, point) && !polygon.slice(1).some((ring) => containsRing(ring, point))))
    if (boundary) municipalities[keyFor(point)] = boundary.properties.naam
  }
  const foreign = missing.filter((point) => !municipalities[keyFor(point)])
  writeFileSync(path, JSON.stringify(municipalities, null, 2) + '\n')
  for (let start = 0; start < foreign.length; start += 10) {
    const batch = foreign.slice(start, start + 10)
    const queries = batch.map((point) => `is_in(${point.lat},${point.lng})->.containing;area.containing[boundary=administrative][admin_level=8]->.municipality;area.containing[boundary=administrative][admin_level=6]["de:place"=city]->.city;area.containing[boundary=administrative][admin_level=9]->.local;make place key=${JSON.stringify(keyFor(point))},municipality=municipality.set(t["name"]) != "" ? municipality.set(t["name"]) : (city.set(t["name"]) != "" ? city.set(t["name"]) : local.set(t["name"]));out tags;`)
    const query = '[out:json][timeout:10][maxsize:16777216];' + queries.join('')
    const response = await fetch('https://overpass-api.de/api/interpreter', {
      method: 'POST',
      headers: { 'User-Agent': 'motregen-places-generator/1.0 (github.com/mathijshenquet/motregen)', Accept: 'application/json' },
      body: new URLSearchParams({ data: query }),
    })
    if (!response.ok) throw new Error(`Overpass gemeenten: ${response.status}; hervat dezelfde opdracht later`)
    const result = await response.json() as { remark?: string; elements: Array<{ tags: { key: string; municipality: string } }> }
    if (result.remark) throw new Error(result.remark)
    for (const element of result.elements) municipalities[element.tags.key] = element.tags.municipality
    writeFileSync(path, JSON.stringify(municipalities, null, 2) + '\n')
    console.log(`Gemeenten bijgewerkt: ${start + batch.length}/${foreign.length}`)
  }
  writeFileSync(path, JSON.stringify(municipalities, null, 2) + '\n')
}
