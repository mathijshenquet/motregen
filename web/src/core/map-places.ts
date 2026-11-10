import type { FootprintKind, LabelSide } from './place-footprint.js'
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
 * provinciehoofdsteden, kust en IJsselmeer; rang 3–4 verfijning voor ingezoomd; rang 5–6 vult uit de plaatsenlijst
 * (scripts/plekkenorde-zooms.ts). De volgorde is de voorrang bij een botsing; zeepunten krijgen geen naam.
 */
export interface OrderedPlace extends TemperaturePlace {
  /** 1–4 handgekozen, 5 steden en grote dorpen, 6 overige dorpen (plaatsenlijst). */
  rank: 1 | 2 | 3 | 4 | 5 | 6
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
export const PLACE_ORDER_SCREENS: readonly PlaceOrderScreen[] = ['phone', 'desktop']
export const PLACE_DENSITIES: readonly PlaceDensity[] = ['weinig', 'midden', 'veel']

/**
 * Lucht tussen twee voetafdrukken (place-footprint) in px per dichtheid: de dichtheid is zo een doel per
 * schermoppervlak, op elke zoom (PO 2026-11-10). Afgesteld met de dichtheidstest in place-order.test.ts.
 */
export const PLACE_ORDER_GAP_PX: Record<FootprintKind, Record<PlaceOrderScreen, Record<PlaceDensity, number>>> = {
  samen: { phone: { weinig: 70, midden: 45, veel: 22 }, desktop: { weinig: 95, midden: 58, veel: 32 } },
  naast: { phone: { weinig: 70, midden: 45, veel: 22 }, desktop: { weinig: 95, midden: 58, veel: 32 } },
  zak: { phone: { weinig: 70, midden: 38, veel: 14 }, desktop: { weinig: 100, midden: 60, veel: 30 } },
}

/**
 * Doel: zoveel plekken op een scherm vol land (kaart 402 × 740 telefoon, 970 × 900 desktop), op elke zoom, per
 * voetafdruk (place-footprint).
 */
export const PLACE_ORDER_TARGET: Record<FootprintKind, Record<PlaceOrderScreen, Record<PlaceDensity, number>>> = {
  samen: { phone: { weinig: 8, midden: 12, veel: 23 }, desktop: { weinig: 15, midden: 25, veel: 42 } },
  naast: { phone: { weinig: 8, midden: 13, veel: 22 }, desktop: { weinig: 15, midden: 27, veel: 43 } },
  zak: { phone: { weinig: 5, midden: 7, veel: 10 }, desktop: { weinig: 9, midden: 14, veel: 22 } },
}

export function placeOrderKey(kind: FootprintKind, screen: PlaceOrderScreen, density: PlaceDensity, tier?: 'provincies'): string {
  return `${tier ? `${tier}-` : ''}${kind}-${screen}-${density}`
}

/** Zoombereik van de vooraf berekende plekkenorde (scripts/plekkenorde-zooms.ts). */
export const PLACE_ORDER_ZOOMS = { from: 4, to: 14 } as const

/**
 * Kant van de naam t.o.v. de plek (PO 2026-11-10: "een naam staat aan dezelfde kant van het water als zijn plek").
 * Standaard onder; kustplaatsen met de hand, gecontroleerd op screenshots van Zeeland, de Kop van Noord-Holland en de
 * Wadden.
 */
export const PLACE_SIDES: Readonly<Record<string, LabelSide>> = {
  Vlissingen: 'boven',
  'Hoek van Holland': 'rechts',
  IJmuiden: 'rechts',
  Harlingen: 'rechts',
  Delfzijl: 'links',
  'West-Terschelling': 'boven',
  'Den Burg': 'rechts',
  Zandvoort: 'rechts',
  Katwijk: 'rechts',
  Noordwijk: 'rechts',
  Scheveningen: 'rechts',
  'Egmond aan Zee': 'rechts',
  'Bergen aan Zee': 'rechts',
  Petten: 'rechts',
  Callantsoog: 'rechts',
  'Julianadorp': 'rechts',
  Domburg: 'onder',
  Westkapelle: 'rechts',
  Zoutelande: 'boven',
  Breskens: 'onder',
  Cadzand: 'onder',
  'Oost-Vlieland': 'boven',
  Nes: 'boven',
  Schiermonnikoog: 'boven',
  Hollum: 'rechts',
  'De Koog': 'rechts',
  Oudeschild: 'links',
  'Den Oever': 'rechts',
  Stavoren: 'rechts',
  Urk: 'rechts',
  Enkhuizen: 'links',
  Hoorn: 'boven',
  Lemmer: 'rechts',
  Lelystad: 'rechts',
  Lauwersoog: 'onder',
  Holwerd: 'onder',
  Eemshaven: 'onder',
  Termunten: 'links',
  Hansweert: 'boven',
  Kruiningen: 'boven',
  Hellevoetsluis: 'boven',
  Brouwershaven: 'onder',
  Zierikzee: 'boven',
  Oostende: 'rechts',
  'Knokke-Heist': 'onder',
  Blankenberge: 'rechts',
  'De Panne': 'rechts',
  Emden: 'rechts',
}

export function placeSide(place: { name: string }): LabelSide {
  return PLACE_SIDES[place.name] ?? 'onder'
}

/** Vooraf berekende orde (scripts/plekkenorde-zooms.ts): plekken in volgorde van belang met hun minimale zoom. */
export interface PlaceOrderTable {
  places: OrderedPlace[]
  /** Per placeOrderKey: minimale zoom per plek, Infinity = niet binnen PLACE_ORDER_ZOOMS. */
  zooms: Record<string, number[]>
}

export interface CompactPlaceOrder {
  /** Vingerafdruk van de bron (place-order-build). */
  source: string
  names: string[]
  /** Graden × 1000. */
  lng: number[]
  lat: number[]
  rank: number[]
  sea: number[]
  abroad: number[]
  /** Zoom × 100, −1 = nooit. */
  zooms: Record<string, number[]>
}

export function decodePlaceOrder(data: CompactPlaceOrder): PlaceOrderTable {
  const sea = new Set(data.sea), abroad = new Set(data.abroad)
  const places = data.names.map((name, index): OrderedPlace => ({
    name, lng: data.lng[index]! / 1000, lat: data.lat[index]! / 1000, rank: data.rank[index] as OrderedPlace['rank'],
    ...sea.has(index) ? { sea: true as const } : {}, ...abroad.has(index) ? { abroad: true as const } : {},
  }))
  const zooms = Object.fromEntries(Object.entries(data.zooms).map(([key, values]) => [key, values.map((value) => value < 0 ? Infinity : value / 100)]))
  return { places, zooms }
}

let loadedOrder: PlaceOrderTable | undefined
/** De orde laden (eigen chunk, alleen onder `?dev&plekken=orde`). */
export async function loadPlaceOrder(): Promise<PlaceOrderTable> {
  loadedOrder ??= decodePlaceOrder((await import('./place-order-zooms.json')).default as CompactPlaceOrder)
  return loadedOrder
}

export interface PlaceOrderView {
  /** `provincies`: de tabellen met hoofdsteden voorop, en de stedentrede pas vanaf PROVINCE_STEPS.cities. */
  tier?: 'provincies'
  /** Welke voetafdruk (place-footprint): Weer/Gevoel `samen` of `naast`, Wind `zak`. */
  kind: FootprintKind
  zoom: number
  /** Overzichtszoom: de minzoom waarop het hele kaartkader past. */
  overviewZoom: number
  screen: PlaceOrderScreen
  density: PlaceDensity
  neighbours: 'later' | 'meteen'
}

/** Buurland `later`: pas vanaf zoveel zoomstappen boven het overzicht. */
export const NEIGHBOURS_LATER_STEPS = 1

/**
 * Plekken bij deze zoom, in ordevolgorde: elke plek vanaf zijn minimale zoom. Inzoomen voegt alleen toe; pan en pin
 * tellen niet mee.
 */
export function orderedPlaces(view: PlaceOrderView, table: PlaceOrderTable | undefined = loadedOrder): OrderedPlace[] {
  if (!table) return []
  const zooms = table.zooms[placeOrderKey(view.kind, view.screen, view.density, view.tier)]!
  if (view.tier) {
    // Stedentrede: de hoofdsteden staan er vanaf de landing (C); de rest komt gespreid binnen over PROVINCE_STEPS.arrival
    // erna door [laagste tabelzoom, C + arrival] lineair op [C, C + arrival] te leggen. Die drempel is nooit lager dan
    // de eigen minimale zoom, dus monotonie en "geen overlap" blijven gelden. (Over een hele stap liet dat de
    // telefoon een stap lang op 4–7 plekken staan, orkestrator 2026-11-10.)
    const landing = view.overviewZoom + PROVINCE_STEPS.cities
    if (view.zoom < landing) return []
    const lowest = PLACE_ORDER_ZOOMS.from, arrival = PROVINCE_STEPS.arrival
    return table.places.filter((place, index) => {
      const own = zooms[index]!
      const spread = CAPITALS.has(place.name) ? Math.max(own, landing) : own < landing + arrival ? landing + arrival * (own - lowest) / (landing + arrival - lowest) : own
      return view.zoom >= spread && (!place.abroad || view.zoom >= abroadFrom(view))
    })
  }
  // Geen afrondingsmarge op de tabelzoom: een plek die er net eerder staat, kan een belangrijkere raken.
  return table.places.filter((place, index) => view.zoom >= zooms[index]! && (!place.abroad || view.zoom >= abroadFrom(view)))
}

function abroadFrom(view: PlaceOrderView): number {
  return view.neighbours === 'later' ? view.overviewZoom + NEIGHBOURS_LATER_STEPS - ZOOM_EPSILON : -Infinity
}

/** Zoom vanaf waar `namen=later` namen toont. */
export function placeNamesFromZoom(view: Pick<PlaceOrderView, 'overviewZoom' | 'screen'>): number {
  return view.overviewZoom + 1
}
/** Een kaart op exact de overzichtszoom mag door afronding niet net onder een drempel vallen. */
const ZOOM_EPSILON = 0.02

/**
 * Provincietrede (`?dev&plekken=provincies`, PO 2026-11-10): verst uitgezoomd één plek per provincie op het
 * (land)zwaartepunt; daarna schuift elke provincieplek naar zijn hoofdstad en wordt hij die stad. Zwaartepunten
 * afgerond op 0,05°; Noord-Holland, Flevoland, Overijssel en Gelderland iets verschoven binnen hun provincie, zodat de labels op
 * het telefoonoverzicht (NL ± 280 px breed) elkaar niet raken.
 */
export interface Province { name: string; lng: number; lat: number; capital: string }

export const PROVINCES: readonly Province[] = [
  { name: 'Groningen', lng: 6.75, lat: 53.25, capital: 'Groningen' },
  { name: 'Friesland', lng: 5.8, lat: 53.1, capital: 'Leeuwarden' },
  { name: 'Drenthe', lng: 6.6, lat: 52.85, capital: 'Assen' },
  { name: 'Overijssel', lng: 6.5, lat: 52.3, capital: 'Zwolle' },
  { name: 'Flevoland', lng: 5.65, lat: 52.45, capital: 'Lelystad' },
  { name: 'Gelderland', lng: 6.4, lat: 52.0, capital: 'Arnhem' },
  { name: 'Utrecht', lng: 5.2, lat: 52.1, capital: 'Utrecht' },
  { name: 'Noord-Holland', lng: 4.8, lat: 52.75, capital: 'Haarlem' },
  { name: 'Zuid-Holland', lng: 4.5, lat: 51.95, capital: 'Den Haag' },
  { name: 'Zeeland', lng: 3.85, lat: 51.5, capital: 'Middelburg' },
  { name: 'Noord-Brabant', lng: 5.2, lat: 51.55, capital: 'Den Bosch' },
  { name: 'Limburg', lng: 5.95, lat: 51.2, capital: 'Maastricht' },
]

/**
 * Zoomstappen boven het overzicht: tot `provinces` staan de zwaartepunten, tot `cities` schuiven ze naar hun
 * hoofdstad (één zoomstap), vanaf `cities` de stedentrede; de overige steden komen binnen `arrival` daarna binnen.
 */
export const PROVINCE_STEPS = { provinces: 0.5, cities: 1.5, arrival: 0.5 } as const

export interface ProvincePlace extends OrderedPlace {
  /** De provincie waar deze plek bij hoort (ook als hij halverwege al de hoofdstad heet). */
  province: string
}

/**
 * De provincieplekken bij deze zoom, of undefined in de stedentrede. Positie lineair in Web-Mercator van zwaartepunt
 * naar hoofdstad (met zachte in- en uitloop); de naam wisselt halverwege. Alleen een functie van de zoom, dus
 * uitzoomen loopt precies terug.
 */
export function provincePlaces(view: Pick<PlaceOrderView, 'zoom' | 'overviewZoom'>): ProvincePlace[] | undefined {
  const steps = view.zoom - view.overviewZoom
  if (steps >= PROVINCE_STEPS.cities) return undefined
  const progress = Math.min(1, Math.max(0, (steps - PROVINCE_STEPS.provinces) / (PROVINCE_STEPS.cities - PROVINCE_STEPS.provinces)))
  const eased = progress * progress * (3 - 2 * progress)
  return PROVINCES.map((province) => {
    const capital = PLACE_ORDER.find((place) => place.name === province.capital)!
    const from = mercator(province), to = mercator(capital)
    const x = from.x + (to.x - from.x) * eased, y = from.y + (to.y - from.y) * eased
    return {
      name: eased < 0.5 ? province.name : capital.name, rank: 1, province: province.name,
      lng: x * 360 - 180, lat: Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI,
    }
  })
}

function mercator({ lng, lat }: { lng: number; lat: number }): { x: number; y: number } {
  return { x: (lng + 180) / 360, y: (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2 }
}

const CAPITALS = new Set(PROVINCES.map((province) => province.capital))

/** De hoofdsteden eerst: in de stedentrede verliezen ze nooit een botsing. */
export function capitalsFirst(order: readonly OrderedPlace[]): OrderedPlace[] {
  const capitals = PROVINCES.map((province) => order.find((place) => place.name === province.capital)!)
  return [...capitals, ...order.filter((place) => !capitals.includes(place))]
}

/** De dev-knoppen van U114 (MIP-12; `docs/dev-opties.md`). Zonder `?dev` het huidige gedrag. */
export interface PlaceOrderOptions {
  places: 'nu' | 'orde' | 'provincies'
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
    places: pick('plekken', ['nu', 'orde', 'provincies'] as const),
    density: pick('dichtheid', ['midden', 'weinig', 'veel'] as const),
    names: pick('namen', ['naast', 'samen', 'later'] as const),
    weatherNumbers: pick('weergetal', ['plekken', 'isolijn'] as const),
    neighbours: pick('buurland', ['later', 'meteen'] as const),
  }
}
