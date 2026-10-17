import { solarElevationSin } from './solar'

// Lucht-rail (U91b, PO 2026-10-17 "nacht op een andere manier dan donkerte"): een smalle strook links in de tabel
// die de luchtkleur van het moment draagt, zodat de rijen zelf neutraal kunnen blijven. Ankers op zonshoogte in
// graden: astronomische nacht, nautische en burgerlijke schemering, horizon, laag en hoog daglicht.
const SKY_STOPS: ReadonlyArray<readonly [number, readonly [number, number, number]]> = [
  [-18, [27, 36, 64]],
  [-10, [44, 51, 102]],
  [-5, [122, 74, 126]],
  [-1, [224, 120, 106]],
  [2, [242, 179, 107]],
  [8, [159, 208, 239]],
  [30, [95, 179, 234]],
]

export function skyColorAt(elevationDegrees: number): string {
  const first = SKY_STOPS[0]!
  const last = SKY_STOPS.at(-1)!
  if (elevationDegrees <= first[0]) return rgb(first[1])
  if (elevationDegrees >= last[0]) return rgb(last[1])
  const upper = SKY_STOPS.findIndex(([degrees]) => degrees >= elevationDegrees)
  const [low, from] = SKY_STOPS[upper - 1]!
  const [high, to] = SKY_STOPS[upper]!
  const mix = (elevationDegrees - low) / (high - low)
  return rgb([0, 1, 2].map((channel) => from[channel]! + (to[channel]! - from[channel]!) * mix) as [number, number, number])
}

function rgb(color: readonly number[]): string {
  return `rgb(${color.map((channel) => Math.round(channel)).join(' ')})`
}

/**
 * Het verloop van de lucht over een venster, van boven (begin) naar onder (einde). Een stop per `stepMs` houdt de
 * schemering op zijn echte plek, ook in een rij van twaalf uur.
 */
export function skyRailGradient(start: number, end: number, longitude: number, latitude: number, stepMs = 30 * 60_000): string {
  const count = Math.max(2, Math.ceil((end - start) / stepMs) + 1)
  const stops = Array.from({ length: count }, (_, index) => {
    const share = index / (count - 1)
    const elevation = Math.asin(Math.max(-1, Math.min(1, solarElevationSin(start + (end - start) * share, longitude, latitude)))) * 180 / Math.PI
    return `${skyColorAt(elevation)} ${(share * 100).toFixed(1)}%`
  })
  return `linear-gradient(180deg, ${stops.join(', ')})`
}
