import { temperaturePlaces, type TemperaturePlace } from './temperature.js'

/**
 * Eén plekkenlijst voor de getallen in Gevoel en de windzakken in Wind (U107, docs/kaartstijl.md): de
 * temperatuurplaatsen in volgorde van belang plus punten op zee en het IJsselmeer, omdat het verschil kust ↔
 * binnenland juist daar zit. De waterpunten staan achteraan: plaatsen gaan voor bij gelijke afstand.
 */
export const MAP_PLACES: readonly TemperaturePlace[] = [
  ...temperaturePlaces,
  { name: 'Noordzee west', lng: 3.3, lat: 52.3 },
  { name: 'Noordzee noord', lng: 4.3, lat: 53.5 },
  { name: 'Waddenzee noord', lng: 5.9, lat: 53.6 },
  { name: 'Noordzee zuid', lng: 2.9, lat: 51.7 },
  { name: 'IJsselmeer', lng: 5.35, lat: 52.85 },
  { name: 'Markermeer', lng: 5.25, lat: 52.55 },
  { name: 'Noordzee kust', lng: 3.9, lat: 52.7 },
  { name: 'Eems', lng: 6.75, lat: 53.6 },
]

/** Minimale schermafstand tussen twee plekken: ±30–40 over NL op telefoon en desktop (U101). */
export const MAP_PLACE_SPACING = { viewportFraction: 1 / 16, minimumPx: 40, maximumPx: 64 } as const

export function mapPlaceSpacingPx(width: number, height: number): number {
  const { viewportFraction, minimumPx, maximumPx } = MAP_PLACE_SPACING
  return Math.round(Math.max(minimumPx, Math.min(maximumPx, Math.min(width, height) * viewportFraction)))
}

/**
 * Geneste keuze van plekken: van grof naar fijn (halve zoomstappen) blijven gekozen plekken staan en komen er alleen
 * plekken bij. Inzoomen voegt dus alleen toe en uitzoomen haalt alleen weg; een gretige keuze per zoom liet plekken
 * bij inzoomen ook verdwijnen.
 */
export function nestedPlaces(zoom: number, spacingPx: number, candidates: readonly TemperaturePlace[] = MAP_PLACES): TemperaturePlace[] {
  const chosen: Array<{ place: TemperaturePlace; x: number; y: number }> = []
  const projected = candidates.map((place) => ({ place, x: place.lng * Math.PI / 180, y: Math.log(Math.tan(Math.PI / 4 + place.lat * Math.PI / 360)) }))
  for (let level = NESTED_FROM_ZOOM; level <= Math.floor(zoom * 2) / 2; level += 0.5) {
    // Radialen op de mercator-eenheidsbol: 512 · 2^z px per 2π.
    const spacing = spacingPx * 2 * Math.PI / (512 * 2 ** level)
    for (const entry of projected) {
      if (chosen.includes(entry)) continue
      if (chosen.every((other) => Math.hypot(other.x - entry.x, other.y - entry.y) >= spacing)) chosen.push(entry)
    }
  }
  return chosen.map(({ place }) => place)
}
const NESTED_FROM_ZOOM = 4
