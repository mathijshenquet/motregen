import { MAP_CONTAIN_BOUNDS } from './map-constraint.js'
import { MAP_LABEL_SIZES } from './map-labels.js'
import { capitalsFirst, PLACE_DENSITIES, PLACE_ORDER, PLACE_ORDER_GAP_PX, PLACE_ORDER_SCREENS, PLACE_ORDER_ZOOMS, PLACE_SIDES, placeOrderKey, PROVINCES, placeSide, type CompactPlaceOrder, type OrderedPlace } from './map-places.js'
import type { CataloguePlace } from './place-index.js'
import { FOOTPRINT_KINDS, placeFootprint, type LabelSide } from './place-footprint.js'
import { placesUrl } from './places-asset.js'
import { mercatorFraction, minimumZooms, THINNING_VERSION } from './place-thinning.js'

/**
 * Grove omtrek van NL over land (lengte, breedte; zeezijde ruim), om plaatsen uit de lijst als buurland te merken
 * (`buurland=later`). Langs de grens kan hij een paar km missen; dat telt alleen tot een zoomstap boven het overzicht.
 */
export const NL_OUTLINE: ReadonlyArray<readonly [number, number]> = [
  [3.0, 51.6], [3.36, 51.37], [3.38, 51.27], [3.8, 51.21], [3.97, 51.22], [4.24, 51.36], [4.4, 51.36], [4.47, 51.47],
  [4.6, 51.43], [4.77, 51.5], [4.93, 51.4], [5.04, 51.48], [5.1, 51.43], [5.24, 51.31], [5.48, 51.29], [5.56, 51.22],
  [5.85, 51.15], [5.8, 51.06], [5.76, 50.95], [5.64, 50.85], [5.7, 50.75], [6.02, 50.75], [6.08, 50.85], [6.03, 50.93],
  [6.09, 51.06], [6.17, 51.12], [6.22, 51.36], [6.12, 51.55], [5.95, 51.75], [6.17, 51.84], [6.41, 51.83], [6.72, 51.9],
  [6.83, 52.0], [6.69, 52.05], [6.86, 52.12], [7.07, 52.24], [6.99, 52.45], [6.7, 52.49], [6.74, 52.64], [7.06, 52.65],
  [7.22, 53.0], [7.2, 53.25], [6.95, 53.44], [6.9, 53.8], [3.0, 53.8],
]

export function inNetherlands(lng: number, lat: number): boolean {
  let inside = false
  for (let index = 0, previous = NL_OUTLINE.length - 1; index < NL_OUTLINE.length; previous = index++) {
    const [x1, y1] = NL_OUTLINE[index]!, [x2, y2] = NL_OUTLINE[previous]!
    if ((y1 > lat) !== (y2 > lat) && lng < (x2 - x1) * (lat - y1) / (y2 - y1) + x1) inside = !inside
  }
  return inside
}

/** Een plaats uit de lijst die zo dicht bij een handgekozen plek ligt, is dezelfde plek (Den Bosch / 's-Hertogenbosch). */
const SAME_PLACE_KM = 2.5

/**
 * De plekkenorde in volgorde van belang: de handorde per rang, dan de plaatsenlijst binnen het kaartkader (rang 5:
 * steden en grote dorpen, rang 6: dorpen; elk op hun lijstrang en inwonertal).
 */
export function orderCandidates(gazetteer: readonly CataloguePlace[]): OrderedPlace[] {
  for (const place of PLACE_ORDER) {
    if (!place.sea && inNetherlands(place.lng, place.lat) === Boolean(place.abroad)) throw new Error(`NL_OUTLINE klopt niet bij ${place.name}`)
  }
  const hand = [...PLACE_ORDER].sort((left, right) => left.rank - right.rank)
  const { west, east, south, north } = MAP_CONTAIN_BOUNDS
  const chosen: OrderedPlace[] = [...hand]
  const extra = gazetteer
    .filter((place) => place.lng >= west && place.lng <= east && place.lat >= south && place.lat <= north)
    .sort((left, right) => (left.kind === 'village' ? 1 : 0) - (right.kind === 'village' ? 1 : 0) || left.rank - right.rank || right.population - left.population)
  for (const place of extra) {
    if (chosen.some((other) => other.name === place.name && kilometres(other, place) < 15 || kilometres(other, place) < SAME_PLACE_KM)) continue
    chosen.push({ name: place.name, lng: place.lng, lat: place.lat, rank: place.kind === 'village' ? 6 : 5, ...inNetherlands(place.lng, place.lat) ? {} : { abroad: true as const } })
  }
  // Op de opslagprecisie (0,001°), zodat de botsingen gelden voor de posities die de app leest.
  return chosen.map((place) => ({ ...place, lng: Math.round(place.lng * 1000) / 1000, lat: Math.round(place.lat * 1000) / 1000 }))
}

/**
 * Vingerafdruk van alles waar de tabel van afhangt; place-order.test.ts vergelijkt hem met de opgeslagen tabel, zodat
 * een gewijzigde orde, kant, marge of voetafdruk niet stil met een oude tabel blijft draaien.
 */
export function placeOrderSource(): string {
  const sides: LabelSide[] = ['onder', 'boven', 'links', 'rechts']
  const footprints = FOOTPRINT_KINDS.map((kind) => PLACE_ORDER_SCREENS.map((screen) => sides.map((side) => placeFootprint('Amsterdam', side, MAP_LABEL_SIZES[screen], kind))))
  const input = JSON.stringify([PLACE_ORDER, PLACE_SIDES, PLACE_ORDER_GAP_PX, PLACE_ORDER_ZOOMS, footprints, placesUrl, THINNING_VERSION, MAP_CONTAIN_BOUNDS, SAME_PLACE_KM, NL_OUTLINE, PROVINCES])
  let hash = 0x811c9dc5
  for (let index = 0; index < input.length; index++) hash = Math.imul(hash ^ input.charCodeAt(index), 0x01000193) >>> 0
  return hash.toString(16).padStart(8, '0')
}

export function buildPlaceOrder(gazetteer: readonly CataloguePlace[]): CompactPlaceOrder {
  const places = orderCandidates(gazetteer)
  const zooms: Record<string, number[]> = {}
  // `provincies`: dezelfde plekken met de hoofdsteden voorop; de uitkomst terug op de index van `places`.
  const capitalsOrder = capitalsFirst(places).map((place) => places.indexOf(place))
  for (const tier of [undefined, 'provincies'] as const) for (const kind of FOOTPRINT_KINDS) for (const screen of PLACE_ORDER_SCREENS) {
    const size = MAP_LABEL_SIZES[screen]
    const ordered = tier ? capitalsOrder.map((index) => places[index]!) : places
    const capitals = new Set(tier ? PROVINCES.map((province) => province.capital) : [])
    const candidates = ordered.map((place) => ({
      ...mercatorFraction(place.lng, place.lat), shapes: placeFootprint(place.sea ? undefined : place.name, placeSide(place), size, kind),
      ...capitals.has(place.name) && !place.sea ? { tight: true } : {},
    }))
    for (const density of PLACE_DENSITIES) {
      const found = minimumZooms(candidates, { fromZoom: PLACE_ORDER_ZOOMS.from, toZoom: PLACE_ORDER_ZOOMS.to, gapPx: PLACE_ORDER_GAP_PX[kind][screen][density] })
      const byPlace = tier ? places.map((_, index) => found[capitalsOrder.indexOf(index)]!) : found
      zooms[placeOrderKey(kind, screen, density, tier)] = byPlace.map((zoom) => Number.isFinite(zoom) ? Math.ceil(zoom * 100) : -1)
    }
  }
  const keep = places.map((_, index) => Object.values(zooms).some((values) => values[index]! >= 0))
  const kept = <T>(values: readonly T[]) => values.filter((_, index) => keep[index])
  const shown = kept(places)
  return {
    source: placeOrderSource(),
    names: shown.map((place) => place.name),
    lng: shown.map((place) => Math.round(place.lng * 1000)),
    lat: shown.map((place) => Math.round(place.lat * 1000)),
    rank: shown.map((place) => place.rank),
    sea: shown.flatMap((place, index) => place.sea ? [index] : []),
    abroad: shown.flatMap((place, index) => place.abroad ? [index] : []),
    zooms: Object.fromEntries(Object.entries(zooms).map(([key, values]) => [key, kept(values)])),
  }
}

function kilometres(a: { lng: number; lat: number }, b: { lng: number; lat: number }): number {
  const dx = (a.lng - b.lng) * Math.cos((a.lat + b.lat) / 2 * Math.PI / 180), dy = a.lat - b.lat
  return Math.hypot(dx, dy) * 111.2
}
