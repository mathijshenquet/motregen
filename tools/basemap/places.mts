import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, readdirSync, unlinkSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { MAP_CONTAIN_BOUNDS } from '../../web/src/core/map-constraint'
import { placeSlug } from '../../web/src/core/slugify'
import type { CataloguePlace } from '../../web/src/core/place-index'
import { updateMunicipalities } from './place-municipalities.mts'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(resolve(root, 'web/package.json'))
const { PMTiles, FileSource } = require('pmtiles')
const { VectorTile } = require('@mapbox/vector-tile')
const Pbf = require('pbf').default
const manifest = JSON.parse(readFileSync(resolve(root, 'tools/basemap/tiles/manifest.json'), 'utf8'))
const inputArgument = process.argv.slice(2).find((argument) => !argument.startsWith('--'))
const input = resolve(root, inputArgument ?? `tools/basemap/tiles/${manifest.filename}`)
const bytes = readFileSync(input)
const archive = new PMTiles(new FileSource(new File([bytes], 'places.pmtiles')))
const bounds = MAP_CONTAIN_BOUNDS
const zoom = 10
const count = 2 ** zoom
const tileLongitude = (longitude: number) => Math.floor((longitude + 180) / 360 * count)
const tileLatitude = (latitude: number) => Math.floor((1 - Math.asinh(Math.tan(latitude * Math.PI / 180)) / Math.PI) / 2 * count)
const found = new Map<string, CataloguePlace>()
for (let tileX = tileLongitude(bounds.west); tileX <= tileLongitude(bounds.east); tileX++) {
  for (let tileY = tileLatitude(bounds.north); tileY <= tileLatitude(bounds.south); tileY++) {
    const tile = await archive.getZxy(zoom, tileX, tileY)
    if (!tile) continue
    const layer = new VectorTile(new Pbf(new Uint8Array(tile.data))).layers.place
    for (let index = 0; index < (layer?.length ?? 0); index++) {
      const feature = layer.feature(index).toGeoJSON(tileX, tileY, zoom)
      const properties = feature.properties
      if (!['city', 'town', 'village'].includes(properties.class)) continue
      const points = feature.geometry.type === 'Point' ? [feature.geometry.coordinates] : feature.geometry.coordinates
      for (const point of points) {
        const [lng, lat] = point.map((coordinate: number) => Math.round(coordinate * 100_000) / 100_000)
        if (!Number.isFinite(lng) || !Number.isFinite(lat)) throw new Error('Ongeldig plaatscentrum')
        if (lng < bounds.west || lng > bounds.east || lat < bounds.south || lat > bounds.north) continue
        const key = `${properties.name}:${lng}:${lat}`
        found.set(key, { name: properties.name, slug: placeSlug(properties.name), lng, lat,
          kind: properties.class, rank: properties.rank, population: properties.population })
      }
    }
  }
}
const groups = new Map<string, CataloguePlace[]>()
for (const place of found.values()) groups.set(place.slug, [...groups.get(place.slug) ?? [], place])
for (const group of groups.values()) group.sort((left, right) => left.rank - right.rank || right.population - left.population || left.lng - right.lng || left.lat - right.lat)
if (process.argv.includes('--refresh-municipalities')) await updateMunicipalities(root, [...groups.values()].flatMap((group) => group.slice(1)))
const municipalities: Record<string, string> = JSON.parse(readFileSync(resolve(root, 'tools/basemap/place-municipalities.json'), 'utf8'))
const entries: CataloguePlace[] = []
const usedSlugs = new Set(groups.keys())
for (const [slug, group] of groups) {
  for (const [index, place] of group.entries()) {
    if (index > 0) {
      const key = `${place.name}:${place.lng}:${place.lat}`
      const municipality = municipalities[key]
      if (!municipality) throw new Error(`Gemeente ontbreekt: ${key}`)
      const suffix = `${slug}-${placeSlug(municipality)}`
      place.slug = suffix
      let ordinal = 2
      while (usedSlugs.has(place.slug)) place.slug = `${suffix}-${ordinal++}`
      usedSlugs.add(place.slug)
    }
    entries.push(place)
  }
}
entries.sort((left, right) => Math.floor(left.lat * 20) - Math.floor(right.lat * 20)
  || left.lng - right.lng || left.lat - right.lat || left.slug.localeCompare(right.slug))
if (new Set(entries.map((place) => place.slug)).size !== entries.length) throw new Error('Gemeente-suffix is niet uniek')

function encodeIntegers(values: number[]): string {
  const bytes: number[] = []
  for (let value of values) {
    while (value >= 128) {
      bytes.push((value % 128) + 128)
      value = Math.floor(value / 128)
    }
    bytes.push(value)
  }
  return Buffer.from(bytes).toString('base64')
}
function encodeCoordinates(values: number[]): string {
  let previous = 0
  const differences = values.map((value) => {
    const coordinate = Math.round(value * 1000)
    const difference = coordinate - previous
    previous = coordinate
    return difference < 0 ? -difference * 2 - 1 : difference * 2
  })
  return encodeIntegers(differences)
}
const data = {
  names: entries.map((place) => place.name),
  columns: [encodeCoordinates(entries.map((place) => place.lng)), encodeCoordinates(entries.map((place) => place.lat)),
    encodeIntegers(entries.map((place) => place.rank * 3 + ['city', 'town', 'village'].indexOf(place.kind))),
    encodeIntegers(entries.map((place) => place.population))],
  suffixes: Object.fromEntries(entries.flatMap((place, index) => place.slug === placeSlug(place.name) ? [] : [[index, place.slug.slice(placeSlug(place.name).length + 1)]])),
  coordinateScale: 1000,
}
const json = `${JSON.stringify(data)}\n`
const compressed = gzipSync(json, { level: 9 })
const compressedBytes = compressed.length
if (compressedBytes > 61_440) throw new Error(`Plaatsenlijst overschrijdt 60 KiB: ${compressedBytes}`)
const filename = `plaatsen-${createHash('sha256').update(json).digest('hex').slice(0, 16)}.json`
const publicDir = resolve(root, 'web/public')
for (const previous of readdirSync(publicDir)) if (/^plaatsen-[a-f0-9]{16}\.json(?:\.gz)?$/.test(previous)) unlinkSync(resolve(publicDir, previous))
writeFileSync(resolve(publicDir, filename), json)
writeFileSync(resolve(publicDir, `${filename}.gz`), compressed)
writeFileSync(resolve(root, 'web/src/core/places-asset.ts'), `export const placesUrl = '/${filename}'\n`)
console.log(JSON.stringify({ places: entries.length, bytes: Buffer.byteLength(json), gzipBytes: compressedBytes, filename, sourceSha256: createHash('sha256').update(bytes).digest('hex') }, null, 2))
