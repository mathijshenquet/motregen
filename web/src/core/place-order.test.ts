import { describe, expect, it } from 'vitest'
import { containView, containZoom, MAP_CONTAIN_BOUNDS } from './map-constraint'
import { MAP_LABEL_SIZES } from './map-labels'
import {
  decodePlaceOrder, orderedPlaces, PLACE_DENSITIES, PLACE_ORDER, PLACE_ORDER_SCREENS, PLACE_ORDER_TARGET, placeOrderOptions, placeSide,
  placesInView, PROVINCE_STEPS, PROVINCES, provincePlaces, provinceTier,
  type CompactPlaceOrder, type OrderedPlace, type PlaceDensity, type PlaceOrderScreen,
} from './map-places'
import { FOOTPRINT_KINDS, footprintsTouch, placeFootprint, type FootprintKind } from './place-footprint'
import { placeOrderSource } from './place-order-build'
import { lastClash, mercatorFraction } from './place-thinning'
import zooms from './place-order-zooms.json'

const table = decodePlaceOrder(zooms as CompactPlaceOrder)

/** Kaartmaat per schermklasse: telefoon 402 × 844 met het paneel eronder (kaart 402 × 462), desktop 1440 × 900 naast het zijpaneel. */
const MAPS: Record<PlaceOrderScreen, { width: number; height: number }> = { phone: { width: 402, height: 462 }, desktop: { width: 970, height: 900 } }

/** Middelpunten boven land; alleen schermen die voor ≥ 80 % land zijn tellen mee (landFraction). */
const LAND: Record<string, [number, number]> = {
  'Utrecht–Den Bosch': [5.25, 51.9], Betuwe: [5.45, 51.9], Veluwe: [5.85, 52.2], Brabant: [5.2, 51.55], Twente: [6.7, 52.3],
  Drenthe: [6.6, 52.85], Friesland: [5.85, 53.05], Groningen: [6.6, 53.2], Limburg: [5.9, 51.0], Achterhoek: [6.5, 51.95],
  Randstad: [4.6, 52.0], 'Gelderse Vallei': [5.55, 52.1],
}

interface Seen { place: OrderedPlace; x: number; y: number }

/** Zichtbare plekken met hun schermpositie (anker) bij dit middelpunt en deze zoom. */
function visible(kind: FootprintKind, screen: PlaceOrderScreen, density: PlaceDensity, [lng, lat]: [number, number], zoom: number, neighbours: 'later' | 'meteen' = 'later', tier?: 'provincies'): Seen[] {
  const map = MAPS[screen]
  const overviewZoom = containZoom(MAP_CONTAIN_BOUNDS, map)
  const centre = mercatorFraction(lng, lat), scale = 512 * 2 ** zoom
  return orderedPlaces({ kind, zoom, overviewZoom, screen, density, neighbours, tier }, table).flatMap((place) => {
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

  describe('provincietrede (`plekken=provincies`)', () => {
    /** Provincie- en hoofdstadplek zijn dezelfde plek (bij de landing heet de provincieplek naar zijn hoofdstad). */
    const identity = (name: string) => PROVINCES.find((province) => province.capital === name)?.name ?? name
    const tier = (kind: FootprintKind, screen: PlaceOrderScreen, density: PlaceDensity, centre: readonly [number, number], steps: number) => {
      const home = containView(MAP_CONTAIN_BOUNDS, MAPS[screen])
      const zoom = home.zoom + steps
      return placesInView(provinceTier({ kind, zoom, overviewZoom: home.zoom, screen, density, neighbours: 'later' }, table), centre, zoom, MAPS[screen])
    }

    it('verst uitgezoomd de 12 zwaartepunten met de provincienaam; de naam blijft tot de plek op de hoofdstad staat', () => {
      const at = (steps: number) => provincePlaces({ zoom: 6 + steps, overviewZoom: 6 })
      expect(at(0)!.map(({ lng, lat }) => [lng, lat])).toEqual(PROVINCES.map(({ lng, lat }) => [expect.closeTo(lng, 9), expect.closeTo(lat, 9)]))
      for (let steps = 0; steps < PROVINCE_STEPS.cities; steps += 0.05) expect(at(steps)!.map((place) => place.name)).toEqual(PROVINCES.map((province) => province.name))
      const end = at(PROVINCE_STEPS.cities - 1e-9)!
      for (const [index, province] of PROVINCES.entries()) {
        const capital = PLACE_ORDER.find((place) => place.name === province.capital)!
        expect(end[index]!.lng).toBeCloseTo(capital.lng, 6)
        expect(end[index]!.lat).toBeCloseTo(capital.lat, 6)
      }
      expect(at(PROVINCE_STEPS.cities)).toBeUndefined()
    })

    it('de tween is continu (en loopt bij uitzoomen precies terug: alleen een functie van de zoom)', () => {
      let previous = provincePlaces({ zoom: 6, overviewZoom: 6 })!
      for (let steps = 0.01; steps < PROVINCE_STEPS.cities; steps += 0.01) {
        const next = provincePlaces({ zoom: 6 + steps, overviewZoom: 6 })!
        for (const [index, place] of next.entries()) expect(Math.hypot(place.lng - previous[index]!.lng, place.lat - previous[index]!.lat)).toBeLessThan(0.02)
        previous = next
      }
    })

    it('provincielabels ("Noord-Holland −10°") raken elkaar nergens in de trede, op telefoon en desktop', () => {
      for (const screen of PLACE_ORDER_SCREENS) {
        const home = containView(MAP_CONTAIN_BOUNDS, MAPS[screen]), size = MAP_LABEL_SIZES[screen]
        for (let steps = 0; steps < PROVINCE_STEPS.cities; steps += 0.05) {
          const zoom = home.zoom + steps
          const labels = provincePlaces({ zoom, overviewZoom: home.zoom })!.map((place) => ({ ...mercatorFraction(place.lng, place.lat), shapes: placeFootprint(place.name, 'onder', size, 'samen'), name: place.name }))
          for (const [index, a] of labels.entries()) for (const b of labels.slice(0, index)) {
            expect(lastClash(a, b, 0, zoom, zoom), `${screen} +${steps.toFixed(2)}: ${a.name} / ${b.name}`).toBe(-Infinity)
          }
        }
      }
    })

    it('monotoon door de hele trede in stappen van 0,05 (ook Wind met de zakvoetafdruk); niets raakt elkaar; hoofdsteden staan er vanaf de landing', { timeout: 120_000 }, () => {
      for (const kind of FOOTPRINT_KINDS) for (const screen of PLACE_ORDER_SCREENS) for (const density of PLACE_DENSITIES) {
        const map = MAPS[screen], size = MAP_LABEL_SIZES[screen]
        for (const centre of [[5.3, 52.2], [4.75, 51.95], LAND.Brabant!, LAND.Groningen!] as Array<[number, number]>) {
          for (let steps = 0; steps <= PROVINCE_STEPS.cities + 1.5; steps += 0.05) {
            const before = tier(kind, screen, density, centre, steps)
            const after = new Set(tier(kind, screen, density, centre, steps + 0.05).map((seen) => identity(seen.place.name)))
            const grow = 2 ** 0.05
            for (const seen of before) {
              const x = (seen.x - map.width / 2) * grow + map.width / 2, y = (seen.y - map.height / 2) * grow + map.height / 2
              // Provincieplekken schuiven: bij hen telt alleen dat ze er blijven zolang hun anker ruim in beeld ligt.
              const margin = 'province' in seen.place ? 40 : 0
              if (x < margin || y < margin || x > map.width - margin || y > map.height - margin) continue
              expect(after.has(identity(seen.place.name)), `${kind} ${screen} ${density} ${centre} +${steps.toFixed(2)}: ${seen.place.name}`).toBe(true)
            }
            const shapes = before.map(({ place }) => ({ ...mercatorFraction(place.lng, place.lat), name: place.name,
              shapes: placeFootprint(place.sea ? undefined : place.name, 'province' in place ? 'onder' : placeSide(place), size, kind) }))
            const zoom = overview(screen) + steps
            for (const [index, a] of shapes.entries()) for (const b of shapes.slice(0, index)) {
              // Hoofdsteden onderling en provincieplekken onderling liggen vast (12 per trede); die toetst de labeltest.
              const fixed = (name: string) => PROVINCES.some((province) => province.capital === name || province.name === name)
              if (fixed(a.name) && fixed(b.name)) continue
              expect(footprintsTouch(a, a.shapes, b, b.shapes, 512 * 2 ** zoom, 0), `${kind} ${screen} ${density} +${steps.toFixed(2)}: ${a.name} / ${b.name}`).toBe(false)
            }
          }
        }
        const home = containView(MAP_CONTAIN_BOUNDS, map)
        const landing = new Set(provinceTier({ kind, zoom: home.zoom + PROVINCE_STEPS.cities + 1e-9, overviewZoom: home.zoom, screen, density, neighbours: 'later' }, table).map((place) => place.name))
        for (const province of PROVINCES) expect(landing.has(province.capital), `${kind} ${screen} ${density}: ${province.capital}`).toBe(true)
      }
    })

    it('vloeiend over de overgang (overzicht tot landing): ≥ 95 % van de stappen van 0,25 zoom groeit hooguit 1,5 × (of + 2), nergens meer dan 2,2 ×; vanaf de landing ≥ 80 % van de gewone orde', { timeout: 60_000 }, () => {
      const jumps: string[] = []
      let total = 0
      for (const kind of FOOTPRINT_KINDS) for (const screen of PLACE_ORDER_SCREENS) for (const density of PLACE_DENSITIES) {
        for (const centre of [[5.3, 52.2], [4.75, 51.95], LAND.Brabant!, LAND.Groningen!] as Array<[number, number]>) {
          for (let steps = 0; steps <= PROVINCE_STEPS.cities + 1.5; steps += 0.1) {
            const now = tier(kind, screen, density, centre, steps).length
            if (steps + 0.25 <= PROVINCE_STEPS.cities + 1e-9) {
              const next = tier(kind, screen, density, centre, steps + 0.25).length
              total++
              if (next > Math.max(1.5 * now, now + 2)) jumps.push(`${kind} ${screen} ${density} ${centre} +${steps.toFixed(1)}: ${now} → ${next}`)
              expect(next, `${kind} ${screen} ${density} ${centre} +${steps.toFixed(1)}: ${now} → ${next}`).toBeLessThanOrEqual(Math.max(2.2 * now, now + 2))
            }
            if (steps >= PROVINCE_STEPS.cities) {
              const plain = visible(kind, screen, density, centre, overview(screen) + steps).length
              expect(now, `${kind} ${screen} ${density} ${centre} +${steps.toFixed(1)}: ${now} tegen ${plain}`).toBeGreaterThanOrEqual(Math.floor(0.8 * plain))
            }
          }
        }
      }
      expect(jumps.length / total, jumps.join('; ')).toBeLessThanOrEqual(0.05)
    })
  })

  it('windtrede=steden: Wind begint bij het overzicht meteen met de hoofdsteden, zonder provincieplekken, en is monotoon', () => {
    for (const screen of PLACE_ORDER_SCREENS) for (const density of PLACE_DENSITIES) {
      const home = containView(MAP_CONTAIN_BOUNDS, MAPS[screen])
      const at = (zoom: number) => orderedPlaces({ kind: 'zak', zoom, overviewZoom: home.zoom, screen, density, neighbours: 'later', tier: 'provincies', citiesFrom: home.zoom }, table)
      const first = at(home.zoom)
      expect(first.some((place) => PROVINCES.some((province) => province.name === place.name && province.capital !== place.name))).toBe(false)
      expect(first.filter((place) => PROVINCES.some((province) => province.capital === place.name)).length, `${screen} ${density}`).toBeGreaterThanOrEqual(6)
      let previous = new Set(first.map((place) => place.name))
      for (let zoom = home.zoom; zoom <= home.zoom + 4; zoom += 0.05) {
        const names = new Set(at(zoom).map((place) => place.name))
        for (const name of previous) expect(names.has(name), `${screen} ${density} z${zoom.toFixed(2)}: ${name}`).toBe(true)
        previous = names
      }
    }
  })

  it('labelkant: Vlissingen boven (Walcheren), standaard onder', () => {
    expect(placeSide({ name: 'Vlissingen' })).toBe('boven')
    expect(placeSide({ name: 'Utrecht' })).toBe('onder')
  })

  it('buurland later: niet vóór een zoomstap boven het overzicht (verspreid over de halve stap erna); meteen: al in het overzicht', () => {
    const view = { kind: 'samen' as const, overviewZoom: overview('desktop'), screen: 'desktop' as const, density: 'midden' as const }
    const abroad = (zoom: number, neighbours: 'later' | 'meteen') => orderedPlaces({ ...view, zoom, neighbours }, table).filter((place) => place.abroad).length
    expect(abroad(view.overviewZoom, 'later')).toBe(0)
    expect(abroad(view.overviewZoom, 'meteen')).toBeGreaterThan(0)
    expect(abroad(view.overviewZoom + 0.99, 'later')).toBe(0)
    expect(abroad(view.overviewZoom + 1.5, 'later')).toBeGreaterThan(0)
  })

  it('leest de knoppen alleen onder ?dev', () => {
    expect(placeOrderOptions('?plekken=orde').places).toBe('nu')
    expect(placeOrderOptions('?dev&plekken=provincies').places).toBe('orde')
    expect(placeOrderOptions('?dev&plekken=d').places).toBe('d')
    expect(placeOrderOptions('?dev&plekken=orde').windTier).toBe('steden')
    expect(placeOrderOptions('?dev&plekken=orde&windtrede=provincies').windTier).toBe('provincies')
    expect(placeOrderOptions('?dev&plekken=orde&namen=samen&dichtheid=veel')).toEqual({
      places: 'orde', windTier: 'steden', density: 'veel', names: 'samen', weatherNumbers: 'plekken', neighbours: 'later',
    })
  })
})
