import type { Grid, MrfHeader } from './contract'

export const temperatureCities = [
  { name: 'Groningen', lng: 6.57, lat: 53.22 },
  { name: 'Leeuwarden', lng: 5.8, lat: 53.2 },
  { name: 'Enschede', lng: 6.9, lat: 52.22 },
  { name: 'Amsterdam', lng: 4.9, lat: 52.37 },
  { name: 'Den Haag', lng: 4.3, lat: 52.08 },
  { name: 'Utrecht', lng: 5.12, lat: 52.09 },
  { name: 'Rotterdam', lng: 4.48, lat: 51.92 },
  { name: 'Nijmegen', lng: 5.86, lat: 51.84 },
  { name: 'Eindhoven', lng: 5.48, lat: 51.44 },
  { name: 'Maastricht', lng: 5.69, lat: 50.85 },
] as const

export interface TemperatureFeatureCollection {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    geometry: { type: 'Point'; coordinates: [number, number] }
    properties: { label: string; value: number }
  }>
}

export function temperatureLabels(
  left: Uint8Array,
  right: Uint8Array,
  leftHeader: MrfHeader,
  rightHeader: MrfHeader,
  mix: number,
): TemperatureFeatureCollection {
  const features: TemperatureFeatureCollection['features'] = []
  for (const city of temperatureCities) {
    const first = sample(left, leftHeader.grid, leftHeader.quant, city.lng, city.lat)
    const second = sample(right, rightHeader.grid, rightHeader.quant, city.lng, city.lat)
    const value = first == null ? second : second == null ? first : first * (1 - mix) + second * mix
    if (value == null) continue
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [city.lng, city.lat] },
      properties: { label: `${Math.round(value)}°`, value },
    })
  }
  return { type: 'FeatureCollection', features }
}

function sample(frame: Uint8Array, grid: Grid, quant: Array<number | null>, lng: number, lat: number): number | null {
  const [x, y] = project(lng, lat)
  const column = Math.floor((x - grid.x0) / grid.dx)
  const row = Math.floor((y - grid.y0) / grid.dy)
  if (column < 0 || row < 0 || column >= grid.width || row >= grid.height) return null
  return quant[frame[row * grid.width + column]!] ?? null
}

function project(lng: number, lat: number): [number, number] {
  const radius = 6378137
  return [lng * Math.PI / 180 * radius, Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * radius]
}
