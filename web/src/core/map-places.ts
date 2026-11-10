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

/** Hooguit zoveel getallen tegelijk op de kaart. */
export const MAX_PLACE_NUMBERS = 60

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

/**
 * Plekkenorde (MIP-43, U114 `?dev&plekken=orde`, eigenaar Claude, vervalt 2026-11-24): één handgekozen lijst die
 * bepaalt welke plekken (namen, getallen, windzakken) er op de kaart staan. Rang 1 dekt NL plus een zeepunt; rang 2
 * provinciehoofdsteden, kust en IJsselmeer; rang 3–4 verfijning voor ingezoomd. Binnen een rang telt de volgorde: de
 * dichtheid neemt uitgezoomd de eerste N. Buurland en zeepunten tellen niet mee voor N; zeepunten krijgen geen naam.
 */
export interface OrderedPlace extends TemperaturePlace {
  rank: 1 | 2 | 3 | 4
  sea?: true
  abroad?: true
}

const sea = (name: string, rank: OrderedPlace['rank']): OrderedPlace => ({ ...MAP_PLACES.find((place) => place.name === name)!, rank, sea: true })
const land = (rank: OrderedPlace['rank'], names: string): OrderedPlace[] => names.split(', ').map((name) => {
  const place = temperaturePlaces.find((candidate) => candidate.name === name)
  if (!place) throw new Error(`Plekkenorde: onbekende plaats ${name}`)
  return { ...place, rank }
})
const abroad = (rank: OrderedPlace['rank'], name: string, lng: number, lat: number): OrderedPlace => ({ name, lng, lat, rank, abroad: true })

export const PLACE_ORDER: readonly OrderedPlace[] = [
  ...land(1, 'Amsterdam, Groningen, Eindhoven, Zwolle, Vlissingen, Maastricht'),
  sea('Noordzee west', 1),
  // Leeuwarden pas in rang 2: uitgezoomd op de telefoon botst zijn naam met Groningen (60 px).
  ...land(1, 'Rotterdam, Den Helder'),
  ...land(2, 'Leeuwarden, Utrecht, Enschede'),
  sea('IJsselmeer', 2),
  ...land(2, 'Arnhem, Den Haag, Breda, Assen'),
  sea('Waddenzee noord', 2),
  ...land(2, 'Den Bosch, Lelystad'),
  sea('Noordzee zuid', 2),
  ...land(3, 'Nijmegen, Apeldoorn, Tilburg, Venlo, Alkmaar, Haarlem, Amersfoort, Emmen, Harlingen, Den Burg, Roermond, Heerlen, Deventer, Hoorn, Leiden, Dordrecht, Goes, Drachten, Delfzijl, West-Terschelling, Middelburg'),
  sea('Noordzee noord', 3),
  sea('Noordzee kust', 3),
  sea('Markermeer', 3),
  sea('Eems', 3),
  ...land(4, 'Hilversum, Almere, Gouda, Hoek van Holland, IJmuiden, Enkhuizen, Sneek, Heerenveen, Dokkum, Winschoten, Stadskanaal, Meppel, Kampen, Emmeloord, Harderwijk, Hardenberg, Hoogeveen, Almelo, Doetinchem, Winterswijk, Ede, Tiel, Oss, Helmond, Weert, Bergen op Zoom, Zierikzee, Terneuzen'),
  abroad(2, 'Antwerpen', 4.4, 51.22),
  abroad(2, 'Düsseldorf', 6.78, 51.23),
  abroad(2, 'Brussel', 4.35, 50.85),
  abroad(3, 'Gent', 3.72, 51.05),
  abroad(3, 'Keulen', 6.96, 50.94),
  abroad(3, 'Aken', 6.08, 50.78),
  abroad(3, 'Münster', 7.63, 51.96),
  abroad(3, 'Brugge', 3.22, 51.21),
  abroad(3, 'Essen', 7.01, 51.46),
  abroad(3, 'Luik', 5.57, 50.63),
  abroad(3, 'Emden', 7.21, 53.37),
  abroad(4, 'Oostende', 2.92, 51.23),
  abroad(4, 'Hasselt', 5.34, 50.93),
  abroad(4, 'Leuven', 4.7, 50.88),
  abroad(4, 'Mechelen', 4.48, 51.03),
  abroad(4, 'Turnhout', 4.95, 51.32),
  abroad(4, 'Kleef', 6.14, 51.79),
  abroad(4, 'Nordhorn', 7.07, 52.43),
]

export type PlaceOrderScreen = 'phone' | 'desktop'
export type PlaceDensity = 'weinig' | 'midden' | 'veel'

/** Zoveel NL-plekken (inclusief zeepunten) uitgezoomd op NL. */
export const PLACE_ORDER_DENSITY: Record<PlaceOrderScreen, Record<PlaceDensity, number>> = {
  phone: { weinig: 6, midden: 9, veel: 12 },
  desktop: { weinig: 10, midden: 14, veel: 18 },
}

/** Vanaf zoveel zoomstappen boven de overzichtszoom staat een hele rang erbij (index = rang − 1). */
export const PLACE_RANK_ZOOM: Record<PlaceOrderScreen, readonly [number, number, number, number]> = {
  phone: [0.5, 1, 2, 3],
  desktop: [0.5, 1, 2, 3],
}

export interface PlaceOrderView {
  zoom: number
  /** Overzichtszoom: de minzoom waarop het hele kaartkader past. */
  overviewZoom: number
  screen: PlaceOrderScreen
  density: PlaceDensity
  neighbours: 'later' | 'meteen'
}

/**
 * Plekken bij deze zoom, in ordevolgorde: de eerste N NL-plekken (dichtheid) en elke rang vanaf zijn drempel. Buurland
 * `meteen` haalt rang-2-buurland naar het overzicht. Inzoomen voegt alleen toe.
 */
export function orderedPlaces(view: PlaceOrderView, order: readonly OrderedPlace[] = PLACE_ORDER): OrderedPlace[] {
  const steps = view.zoom - view.overviewZoom + ZOOM_EPSILON
  const first = PLACE_ORDER_DENSITY[view.screen][view.density]
  let home = 0
  return order.filter((place) => {
    const prefix = !place.abroad && home++ < first
    const rankReached = steps >= PLACE_RANK_ZOOM[view.screen][place.rank - 1]!
    const early = place.abroad && view.neighbours === 'meteen' && place.rank <= 2
    return prefix || rankReached || early
  })
}

/** Zoom vanaf waar `namen=later` namen toont: de drempel van rang 2. */
export function placeNamesFromZoom(view: Pick<PlaceOrderView, 'overviewZoom' | 'screen'>): number {
  return view.overviewZoom + PLACE_RANK_ZOOM[view.screen][1]
}
/** Een kaart op exact de overzichtszoom mag door afronding niet net onder een drempel vallen. */
const ZOOM_EPSILON = 0.02

/** De dev-knoppen van U114 (MIP-12; `docs/dev-opties.md`). Zonder `?dev` het huidige gedrag. */
export interface PlaceOrderOptions {
  places: 'nu' | 'orde'
  density: PlaceDensity
  names: 'samen' | 'naast' | 'later'
  weatherNumbers: 'plekken' | 'isolijn'
  neighbours: 'later' | 'meteen'
}

export function placeOrderOptions(search: string): PlaceOrderOptions {
  const params = new URLSearchParams(search)
  const dev = params.has('dev')
  const pick = <T extends string>(key: string, values: readonly T[]): T => {
    const value = params.get(key)
    return dev && values.includes(value as T) ? value as T : values[0]!
  }
  return {
    places: pick('plekken', ['nu', 'orde'] as const),
    density: pick('dichtheid', ['midden', 'weinig', 'veel'] as const),
    names: pick('namen', ['naast', 'samen', 'later'] as const),
    weatherNumbers: pick('weergetal', ['plekken', 'isolijn'] as const),
    neighbours: pick('buurland', ['later', 'meteen'] as const),
  }
}
