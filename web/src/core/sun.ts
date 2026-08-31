import type { MrfHeader } from './contract'
import { solarElevationSin } from './solar'

export const SUN_ICONS_ENABLED = true

export const sunAnchors = [
  { name: 'Den Helder', lng: 4.76, lat: 52.96 },
  { name: 'Leeuwarden', lng: 5.8, lat: 53.2 },
  { name: 'Groningen', lng: 6.57, lat: 53.22 },
  { name: 'Assen', lng: 6.56, lat: 52.99 },
  { name: 'Zwolle', lng: 6.09, lat: 52.52 },
  { name: 'Amsterdam', lng: 4.9, lat: 52.37 },
  { name: 'Den Haag', lng: 4.3, lat: 52.08 },
  { name: 'Utrecht', lng: 5.12, lat: 52.09 },
  { name: 'Enschede', lng: 6.9, lat: 52.22 },
  { name: 'Rotterdam', lng: 4.48, lat: 51.92 },
  { name: 'Arnhem', lng: 5.91, lat: 51.98 },
  { name: 'Vlissingen', lng: 3.57, lat: 51.45 },
  { name: 'Breda', lng: 4.78, lat: 51.59 },
  { name: 'Den Bosch', lng: 5.3, lat: 51.69 },
  { name: 'Eindhoven', lng: 5.48, lat: 51.44 },
  { name: 'Venlo', lng: 6.17, lat: 51.37 },
  { name: 'Maastricht', lng: 5.69, lat: 50.85 },
] as const

export interface FieldBlend {
  left: Uint8Array
  right: Uint8Array
  leftHeader: MrfHeader
  rightHeader: MrfHeader
  mix: number
}

export interface SunFeatureCollection {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    geometry: { type: 'Point'; coordinates: [number, number] }
    properties: { name: string; opacity: number }
  }>
}

export function sunnyLocations(epoch: number, radiation?: FieldBlend, uv?: FieldBlend): SunFeatureCollection {
  const features: SunFeatureCollection['features'] = []
  for (const anchor of sunAnchors) {
    const elevation = solarElevationSin(epoch, anchor.lng, anchor.lat)
    if (elevation <= Math.sin(4 * Math.PI / 180)) continue
    const radiationValue = radiation ? blendedSample(radiation, anchor.lng, anchor.lat) : null
    const uvValue = uv ? blendedSample(uv, anchor.lng, anchor.lat) : null
    if (radiationValue == null && uvValue == null) continue
    const expectedRadiation = 1_000 * elevation
    const expectedUv = 7.5 * Math.pow(elevation, 0.8)
    const radiationRatio = radiationValue == null ? null : radiationValue / expectedRadiation
    const uvRatio = uvValue == null ? null : uvValue / expectedUv
    const radiationSunny = radiationValue != null && radiationValue >= Math.max(65, expectedRadiation * 0.38)
    const uvSunny = uvValue != null && uvValue >= Math.max(0.7, expectedUv * 0.38)
    if (!radiationSunny && !(radiationValue == null && uvSunny)) continue
    const strength = Math.max(0, Math.min(1, radiationRatio ?? uvRatio ?? 0))
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [anchor.lng, anchor.lat] },
      properties: { name: anchor.name, opacity: 0.68 + strength * 0.32 },
    })
  }
  return { type: 'FeatureCollection', features }
}

function blendedSample(blend: FieldBlend, longitude: number, latitude: number): number | null {
  const left = sample(blend.left, blend.leftHeader, longitude, latitude)
  const right = sample(blend.right, blend.rightHeader, longitude, latitude)
  return left == null ? right : right == null ? left : left * (1 - blend.mix) + right * blend.mix
}

function sample(frame: Uint8Array, header: MrfHeader, longitude: number, latitude: number): number | null {
  const radius = 6_378_137
  const x = longitude * Math.PI / 180 * radius
  const y = Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360)) * radius
  const column = Math.floor((x - header.grid.x0) / header.grid.dx)
  const row = Math.floor((y - header.grid.y0) / header.grid.dy)
  if (column < 0 || row < 0 || column >= header.grid.width || row >= header.grid.height) return null
  return header.quant[frame[row * header.grid.width + column]!] ?? null
}
