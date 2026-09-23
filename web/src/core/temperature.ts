import type { SymbolLayerSpecification } from 'maplibre-gl'
import type { MapTheme } from './basemap'
import type { Grid, MrfHeader } from './contract'

export const TEMPERATURE_VARIABLE_ANCHORS = [
  'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right',
] as const

export function temperatureLayer(theme: MapTheme): SymbolLayerSpecification {
  const dark = theme === 'dark'
  return {
    id: 'motregen-temperature',
    type: 'symbol',
    source: 'motregen-temperature',
    layout: {
      'text-field': ['get', 'label'],
      'text-size': ['interpolate', ['linear'], ['zoom'], 5, 11, 8, 14],
      'text-font': ['Noto Sans Regular'],
      'text-variable-anchor': [...TEMPERATURE_VARIABLE_ANCHORS],
      'text-radial-offset': 1.15,
      'text-justify': 'auto',
      'text-allow-overlap': false,
      'text-ignore-placement': false,
      'text-optional': true,
      'text-padding': 3,
      'symbol-sort-key': ['get', 'rank'],
    },
    paint: {
      'text-color': dark ? '#f3fbfd' : '#102630',
      'text-halo-color': dark ? '#102027' : '#ffffff',
      'text-halo-width': 2,
      'text-halo-blur': 0.6,
    },
  }
}

// Priority order: the greedy selection below keeps an earlier place over any
// later one within the spacing, so the head of the list decides the overview.
// The head covers every province (Zeeland via Middelburg); the tail fills gaps
// when zoomed in, coast and islands included.
export const temperaturePlaces: readonly TemperaturePlace[] = [
  { name: 'Amsterdam', lng: 4.9, lat: 52.37 },
  { name: 'Rotterdam', lng: 4.48, lat: 51.92 },
  { name: 'Utrecht', lng: 5.12, lat: 52.09 },
  { name: 'Groningen', lng: 6.57, lat: 53.22 },
  { name: 'Leeuwarden', lng: 5.8, lat: 53.2 },
  { name: 'Middelburg', lng: 3.61, lat: 51.5 },
  { name: 'Maastricht', lng: 5.69, lat: 50.85 },
  { name: 'Eindhoven', lng: 5.48, lat: 51.44 },
  { name: 'Zwolle', lng: 6.09, lat: 52.52 },
  { name: 'Arnhem', lng: 5.91, lat: 51.98 },
  { name: 'Lelystad', lng: 5.47, lat: 52.52 },
  { name: 'Assen', lng: 6.56, lat: 52.99 },
  { name: 'Den Helder', lng: 4.76, lat: 52.96 },
  { name: 'Enschede', lng: 6.9, lat: 52.22 },
  { name: 'Breda', lng: 4.78, lat: 51.59 },
  { name: 'Venlo', lng: 6.17, lat: 51.37 },
  { name: 'Den Haag', lng: 4.3, lat: 52.08 },
  { name: 'Alkmaar', lng: 4.75, lat: 52.63 },
  { name: 'Harlingen', lng: 5.42, lat: 53.17 },
  { name: 'Nijmegen', lng: 5.86, lat: 51.84 },
  { name: 'Apeldoorn', lng: 5.97, lat: 52.21 },
  { name: 'Emmen', lng: 6.9, lat: 52.79 },
  { name: 'Vlissingen', lng: 3.57, lat: 51.45 },
  { name: 'Den Bosch', lng: 5.3, lat: 51.69 },
  { name: 'Tilburg', lng: 5.09, lat: 51.56 },
  { name: 'Amersfoort', lng: 5.39, lat: 52.16 },
  { name: 'Haarlem', lng: 4.64, lat: 52.38 },
  { name: 'Leiden', lng: 4.49, lat: 52.16 },
  { name: 'Dordrecht', lng: 4.67, lat: 51.81 },
  { name: 'Goes', lng: 3.89, lat: 51.5 },
  { name: 'Zierikzee', lng: 3.92, lat: 51.65 },
  { name: 'Terneuzen', lng: 3.83, lat: 51.34 },
  { name: 'Bergen op Zoom', lng: 4.29, lat: 51.5 },
  { name: 'Roermond', lng: 5.99, lat: 51.19 },
  { name: 'Heerlen', lng: 5.98, lat: 50.89 },
  { name: 'Weert', lng: 5.71, lat: 51.25 },
  { name: 'Helmond', lng: 5.66, lat: 51.48 },
  { name: 'Oss', lng: 5.52, lat: 51.77 },
  { name: 'Tiel', lng: 5.43, lat: 51.89 },
  { name: 'Ede', lng: 5.66, lat: 52.04 },
  { name: 'Doetinchem', lng: 6.29, lat: 51.97 },
  { name: 'Winterswijk', lng: 6.72, lat: 51.97 },
  { name: 'Deventer', lng: 6.16, lat: 52.25 },
  { name: 'Almelo', lng: 6.66, lat: 52.36 },
  { name: 'Hardenberg', lng: 6.62, lat: 52.58 },
  { name: 'Hoogeveen', lng: 6.48, lat: 52.72 },
  { name: 'Meppel', lng: 6.2, lat: 52.7 },
  { name: 'Kampen', lng: 5.91, lat: 52.55 },
  { name: 'Emmeloord', lng: 5.75, lat: 52.71 },
  { name: 'Harderwijk', lng: 5.62, lat: 52.35 },
  { name: 'Almere', lng: 5.22, lat: 52.37 },
  { name: 'Hilversum', lng: 5.18, lat: 52.23 },
  { name: 'Gouda', lng: 4.71, lat: 52.01 },
  { name: 'Hoek van Holland', lng: 4.13, lat: 51.98 },
  { name: 'IJmuiden', lng: 4.62, lat: 52.46 },
  { name: 'Hoorn', lng: 5.06, lat: 52.64 },
  { name: 'Enkhuizen', lng: 5.29, lat: 52.7 },
  { name: 'Den Burg', lng: 4.8, lat: 53.05 },
  { name: 'West-Terschelling', lng: 5.22, lat: 53.36 },
  { name: 'Sneek', lng: 5.66, lat: 53.03 },
  { name: 'Heerenveen', lng: 5.92, lat: 52.96 },
  { name: 'Drachten', lng: 6.1, lat: 53.11 },
  { name: 'Dokkum', lng: 6.0, lat: 53.33 },
  { name: 'Delfzijl', lng: 6.93, lat: 53.33 },
  { name: 'Winschoten', lng: 7.03, lat: 53.14 },
  { name: 'Stadskanaal', lng: 6.95, lat: 52.99 },
]

export interface TemperaturePlace {
  name: string
  lng: number
  lat: number
}

// Minimum on-screen distance between two temperature labels. Every candidate
// that is left out lies within this distance of a chosen one, so the spacing
// is also the largest label-free gap over the country. Tunable in ?dev.
export const TEMPERATURE_LABEL_SPACING_PX = 84

export function selectTemperaturePlaces(
  zoom: number,
  spacingPx = TEMPERATURE_LABEL_SPACING_PX,
  candidates: readonly TemperaturePlace[] = temperaturePlaces,
): TemperaturePlace[] {
  // Half-zoom steps keep the set stable while pinching.
  const metersPerPixel = WORLD_METERS / (512 * 2 ** (Math.floor(zoom * 2) / 2))
  const spacing = spacingPx * metersPerPixel
  const chosen: Array<{ place: TemperaturePlace; x: number; y: number }> = []
  for (const place of candidates) {
    const [x, y] = project(place.lng, place.lat)
    if (chosen.every((other) => Math.hypot(other.x - x, other.y - y) >= spacing)) chosen.push({ place, x, y })
  }
  return chosen.map(({ place }) => place)
}

const WORLD_METERS = 2 * Math.PI * 6378137

export interface TemperatureFeatureCollection {
  type: 'FeatureCollection'
  features: Array<{
    type: 'Feature'
    geometry: { type: 'Point'; coordinates: [number, number] }
    properties: { name: string; rank: number; label: string; value: number }
  }>
}

export function temperatureLabels(
  left: Uint8Array,
  right: Uint8Array,
  leftHeader: MrfHeader,
  rightHeader: MrfHeader,
  mix: number,
  places: readonly TemperaturePlace[] = temperaturePlaces,
): TemperatureFeatureCollection {
  const features: TemperatureFeatureCollection['features'] = []
  for (const city of places) {
    const rank = temperaturePlaces.indexOf(city)
    const first = sample(left, leftHeader.grid, leftHeader.quant, city.lng, city.lat)
    const second = sample(right, rightHeader.grid, rightHeader.quant, city.lng, city.lat)
    const value = first == null ? second : second == null ? first : first * (1 - mix) + second * mix
    if (value == null) continue
    features.push({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [city.lng, city.lat] },
      properties: { name: city.name, rank: rank < 0 ? temperaturePlaces.length : rank, label: `${Math.round(value)}°`, value },
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
