import { describe, expect, it } from 'vitest'
import { orderedPlaces, PLACE_ORDER, PLACE_ORDER_DENSITY, placeOrderOptions, type PlaceOrderView } from './map-places'

const view = (zoom: number, overrides: Partial<PlaceOrderView> = {}): PlaceOrderView =>
  ({ zoom, overviewZoom: 6, screen: 'phone', density: 'midden', neighbours: 'later', ...overrides })

describe('plekkenorde (U114, MIP-43)', () => {
  it('heeft unieke namen en rang-1 dekt NL plus een zeepunt', () => {
    expect(new Set(PLACE_ORDER.map((place) => place.name)).size).toBe(PLACE_ORDER.length)
    const first = PLACE_ORDER.filter((place) => place.rank === 1)
    expect(first.filter((place) => place.sea)).toHaveLength(1)
    expect(first.some((place) => place.abroad)).toBe(false)
  })

  it('toont uitgezoomd precies de dichtheid, zonder buurland', () => {
    for (const screen of ['phone', 'desktop'] as const) {
      for (const density of ['weinig', 'midden', 'veel'] as const) {
        const places = orderedPlaces(view(6, { screen, density }))
        expect(places).toHaveLength(PLACE_ORDER_DENSITY[screen][density])
        expect(places.some((place) => place.abroad)).toBe(false)
      }
    }
  })

  it('voegt bij inzoomen alleen toe', () => {
    let previous = new Set<string>()
    for (let zoom = 6; zoom <= 10; zoom += 0.25) {
      const names = new Set(orderedPlaces(view(zoom, { density: 'weinig' })).map((place) => place.name))
      for (const name of previous) expect(names.has(name)).toBe(true)
      previous = names
    }
    expect(previous.size).toBe(PLACE_ORDER.length)
  })

  it('buurland meteen haalt rang-2-buurland naar het overzicht', () => {
    const names = orderedPlaces(view(6, { neighbours: 'meteen' })).filter((place) => place.abroad).map((place) => place.name)
    expect(names).toEqual(['Antwerpen', 'Düsseldorf', 'Brussel'])
  })

  it('leest de knoppen alleen onder ?dev', () => {
    expect(placeOrderOptions('?plekken=orde').places).toBe('nu')
    expect(placeOrderOptions('?dev&plekken=orde&namen=samen&dichtheid=veel')).toEqual({
      places: 'orde', density: 'veel', names: 'samen', weatherNumbers: 'plekken', neighbours: 'later',
    })
  })
})
