import { describe, expect, it } from 'vitest'
import { containView, containZoom, MAP_CONTAIN_BOUNDS } from './map-constraint'
import { MAP_LABEL_SIZES } from './map-labels'
import {
  decodePlaceOrder, orderedPlaces, PLACE_DENSITIES, PLACE_ORDER, PLACE_ORDER_SCREENS, PLACE_ORDER_TARGET, placeOrderOptions, placeSide,
  type CompactPlaceOrder, type OrderedPlace, type PlaceDensity, type PlaceOrderScreen,
} from './map-places'
import { FOOTPRINT_KINDS, placeFootprint, type FootprintKind } from './place-footprint'
import { placeOrderSource } from './place-order-build'
import { lastClash, mercatorFraction } from './place-thinning'
import zooms from './place-order-zooms.json'

const table = decodePlaceOrder(zooms as CompactPlaceOrder)

/** Kaartmaat per schermklasse: telefoon 402 × 844 zonder balken, desktop 1440 × 900 naast het zijpaneel. */
const MAPS: Record<PlaceOrderScreen, { width: number; height: number }> = { phone: { width: 402, height: 740 }, desktop: { width: 970, height: 900 } }

/** Middelpunten boven land; alleen schermen die voor ≥ 80 % land zijn tellen mee (landFraction). */
const LAND: Record<string, [number, number]> = {
  'Utrecht–Den Bosch': [5.25, 51.9], Betuwe: [5.45, 51.9], Veluwe: [5.85, 52.2], Brabant: [5.2, 51.55], Twente: [6.7, 52.3],
  Drenthe: [6.6, 52.85], Friesland: [5.85, 53.05], Groningen: [6.6, 53.2], Limburg: [5.9, 51.0], Achterhoek: [6.5, 51.95],
  Randstad: [4.6, 52.0], 'Gelderse Vallei': [5.55, 52.1],
}

interface Seen { place: OrderedPlace; x: number; y: number }

/** Zichtbare plekken met hun schermpositie (anker) bij dit middelpunt en deze zoom. */
function visible(kind: FootprintKind, screen: PlaceOrderScreen, density: PlaceDensity, [lng, lat]: [number, number], zoom: number, neighbours: 'later' | 'meteen' = 'later'): Seen[] {
  const map = MAPS[screen]
  const overviewZoom = containZoom(MAP_CONTAIN_BOUNDS, map)
  const centre = mercatorFraction(lng, lat), scale = 512 * 2 ** zoom
  return orderedPlaces({ kind, zoom, overviewZoom, screen, density, neighbours }, table).flatMap((place) => {
    const at = mercatorFraction(place.lng, place.lat)
    const x = (at.x - centre.x) * scale + map.width / 2, y = (at.y - centre.y) * scale + map.height / 2
    return x >= 0 && y >= 0 && x <= map.width && y <= map.height ? [{ place, x, y }] : []
  })
}

const overview = (screen: PlaceOrderScreen) => containZoom(MAP_CONTAIN_BOUNDS, MAPS[screen])

/** Landcellen van ≈ 5 km (0,08° × 0,05°) met minstens één plaats uit de lijst: een grove landkaart. */
const LAND_CELLS = new Set(table.places.filter((place) => !place.sea).map((place) => `${Math.floor(place.lng / 0.08)},${Math.floor(place.lat / 0.05)}`))

/** Landdeel van het scherm, op een raster van 40 × 40 punten. */
function landFraction(screen: PlaceOrderScreen, [lng, lat]: [number, number], zoom: number): number {
  const map = MAPS[screen], centre = mercatorFraction(lng, lat), scale = 512 * 2 ** zoom
  let land = 0
  for (let column = 0; column < 40; column++) for (let row = 0; row < 40; row++) {
    const x = centre.x + ((column + 0.5) / 40 - 0.5) * map.width / scale, y = centre.y + ((row + 0.5) / 40 - 0.5) * map.height / scale
    const pointLng = x * 360 - 180, pointLat = Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI
    if (LAND_CELLS.has(`${Math.floor(pointLng / 0.08)},${Math.floor(pointLat / 0.05)}`)) land++
  }
  return land / 1600
}

describe('plekkenorde (U114, MIP-43)', () => {
  it('heeft unieke namen en rang-1 dekt NL plus een zeepunt', () => {
    expect(new Set(PLACE_ORDER.map((place) => place.name)).size).toBe(PLACE_ORDER.length)
    const first = PLACE_ORDER.filter((place) => place.rank === 1)
    expect(first.filter((place) => place.sea)).toHaveLength(1)
    expect(first.some((place) => place.abroad)).toBe(false)
  })

  it('de opgeslagen tabel past bij de bron (anders: pnpm exec tsx scripts/plekkenorde-zooms.ts)', () => {
    expect(zooms.source).toBe(placeOrderSource())
    expect(new Set(table.places.map((place) => `${place.name}|${place.lng}|${place.lat}`)).size).toBe(table.places.length)
  })

  it('monotoon: wat bij zoom z in beeld staat, staat bij z + ¼ er nog, zolang het in beeld ligt; pan en pin tellen niet mee', () => {
    for (const kind of FOOTPRINT_KINDS) for (const screen of PLACE_ORDER_SCREENS) for (const density of PLACE_DENSITIES) {
      for (const [name, centre] of Object.entries({ Randstad: LAND.Randstad!, Brabant: LAND.Brabant!, Groningen: LAND.Groningen! })) {
        for (let zoom = overview(screen); zoom <= overview(screen) + 6; zoom += 0.25) {
          const before = visible(kind, screen, density, centre, zoom)
          const after = new Set(visible(kind, screen, density, centre, zoom + 0.25).map((seen) => seen.place.name))
          const map = MAPS[screen], grow = 2 ** 0.25
          for (const seen of before) {
            // Zoomen om het midden: dezelfde plek staat daarna op (positie − midden) · 2^¼ + midden.
            const x = (seen.x - map.width / 2) * grow + map.width / 2, y = (seen.y - map.height / 2) * grow + map.height / 2
            if (x < 0 || y < 0 || x > map.width || y > map.height) continue
            expect(after.has(seen.place.name), `${kind} ${screen} ${density} ${name} z${zoom.toFixed(2)}: ${seen.place.name}`).toBe(true)
          }
        }
      }
    }
  })

  it('geen twee zichtbare plekken raken elkaar: een minder belangrijke plek verdringt nooit een belangrijkere', () => {
    for (const kind of FOOTPRINT_KINDS) for (const screen of PLACE_ORDER_SCREENS) {
      const size = MAP_LABEL_SIZES[screen]
      for (const centre of [LAND.Randstad!, LAND.Brabant!, LAND.Groningen!]) {
        for (let zoom = overview(screen); zoom <= overview(screen) + 5; zoom += 0.5) {
          const seen = visible(kind, screen, 'veel', centre, zoom).map(({ place }) => ({
            ...mercatorFraction(place.lng, place.lat), shapes: placeFootprint(place.sea ? undefined : place.name, placeSide(place), size, kind), name: place.name,
          }))
          for (const [index, a] of seen.entries()) for (const b of seen.slice(0, index)) {
            expect(lastClash(a, b, 0, zoom, zoom), `${kind} ${screen} z${zoom}: ${a.name} / ${b.name}`).toBe(-Infinity)
          }
        }
      }
    }
  })

  it('dichtheid per landscherm, van overzicht tot overzicht + 4: ≥ 90 % binnen 0,6–1,4 × het doel (± 3 bij kleine aantallen), alles binnen 0,45–1,6 ×; de drie knoppen verschillen', () => {
    for (const kind of FOOTPRINT_KINDS) for (const screen of PLACE_ORDER_SCREENS) {
      const map = MAPS[screen]
      const home = containView(MAP_CONTAIN_BOUNDS, map)
      const overviewCounts = PLACE_DENSITIES.map((density) => visible(kind, screen, density, [home.lng, home.lat], home.zoom).length)
      expect(overviewCounts[0], `${kind} ${screen} overzicht weinig < midden`).toBeLessThan(overviewCounts[1]!)
      expect(overviewCounts[1], `${kind} ${screen} overzicht midden < veel`).toBeLessThan(overviewCounts[2]!)
      for (const density of PLACE_DENSITIES) {
        const target = PLACE_ORDER_TARGET[kind][screen][density]
        const ratios: Array<{ ratio: number; label: string; inBand: boolean }> = []
        for (let step = 0; step <= 4; step += 0.5) {
          for (const [name, centre] of Object.entries(LAND)) {
            const zoom = overview(screen) + step
            if (landFraction(screen, centre, zoom) < 0.8) continue
            const count = visible(kind, screen, density, centre, zoom, 'meteen').length
            ratios.push({ ratio: count / target, label: `${name} +${step}: ${count}`, inBand: Math.abs(count - target) <= Math.max(0.4 * target, 3) })
          }
        }
        const label = `${kind} ${screen} ${density} (doel ${target})`
        expect(ratios.length, label).toBeGreaterThan(30)
        const outside = ratios.filter((sample) => !sample.inBand)
        expect(outside.length / ratios.length, `${label}: buiten de band ${outside.map((sample) => sample.label).join(', ')}`).toBeLessThanOrEqual(0.1)
        for (const sample of ratios) expect(sample.ratio, `${label}: ${sample.label}`).toBeGreaterThanOrEqual(0.45)
        for (const sample of ratios) expect(sample.ratio, `${label}: ${sample.label}`).toBeLessThanOrEqual(1.6)
      }
      const targets = PLACE_DENSITIES.map((density) => PLACE_ORDER_TARGET[kind][screen][density])
      expect(targets[0]! * 1.2, `${kind} ${screen}: doel weinig < midden`).toBeLessThan(targets[1]!)
      expect(targets[1]! * 1.2, `${kind} ${screen}: doel midden < veel`).toBeLessThan(targets[2]!)
    }
  })

  it('labelkant: Vlissingen boven (Walcheren), standaard onder', () => {
    expect(placeSide({ name: 'Vlissingen' })).toBe('boven')
    expect(placeSide({ name: 'Utrecht' })).toBe('onder')
  })

  it('buurland later: pas een zoomstap boven het overzicht; meteen: al in het overzicht', () => {
    const view = { kind: 'samen' as const, overviewZoom: overview('desktop'), screen: 'desktop' as const, density: 'midden' as const }
    const abroad = (zoom: number, neighbours: 'later' | 'meteen') => orderedPlaces({ ...view, zoom, neighbours }, table).filter((place) => place.abroad).length
    expect(abroad(view.overviewZoom, 'later')).toBe(0)
    expect(abroad(view.overviewZoom, 'meteen')).toBeGreaterThan(0)
    expect(abroad(view.overviewZoom + 1, 'later')).toBeGreaterThan(0)
  })

  it('leest de knoppen alleen onder ?dev', () => {
    expect(placeOrderOptions('?plekken=orde').places).toBe('nu')
    expect(placeOrderOptions('?dev&plekken=orde&namen=samen&dichtheid=veel')).toEqual({
      places: 'orde', density: 'veel', names: 'samen', weatherNumbers: 'plekken', neighbours: 'later',
    })
  })
})
