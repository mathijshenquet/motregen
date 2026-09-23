import { describe, expect, it } from 'vitest'
import type { MrfHeader } from './contract'
import { selectTemperaturePlaces, TEMPERATURE_LABEL_SPACING_PX, TEMPERATURE_VARIABLE_ANCHORS, temperatureLabels, temperatureLayer, temperaturePlaces } from './temperature'

describe('temperature labels', () => {
  it('interpolates values in time and omits cities outside the field grid', () => {
    const quant: Array<number | null> = Array.from({ length: 255 }, (_, index) => index - 100)
    quant.push(null)
    const header = {
      version: 0,
      field: 'feels_like_c',
      grid: { crs: 'EPSG:3857', x0: 300_000, y0: 7_200_000, dx: 20_000, dy: -20_000, width: 30, height: 40 },
      quant,
      source: 'harmonie',
      run: '2026-08-28T12:00:00Z',
      frames: [],
      dict: null,
    } satisfies MrfHeader
    const size = header.grid.width * header.grid.height
    const labels = temperatureLabels(new Uint8Array(size).fill(110), new Uint8Array(size).fill(114), header, header, 0.25)
    expect(labels.features.length).toBeGreaterThan(5)
    expect(labels.features[0]!.properties.label).toBe('11°')
  })

  it.each(['light', 'dark'] as const)('dodges basemap names at every zoom in %s mode', (theme) => {
    const layer = temperatureLayer(theme)
    expect(layer.minzoom).toBeUndefined()
    expect(layer.maxzoom).toBeUndefined()
    expect(layer.layout).toMatchObject({
      'text-size': ['interpolate', ['linear'], ['zoom'], 5, 11, 8, 14],
      'text-variable-anchor': [...TEMPERATURE_VARIABLE_ANCHORS],
      'text-radial-offset': 1.15,
      'text-allow-overlap': false,
      'text-ignore-placement': false,
      'text-optional': true,
      'symbol-sort-key': ['get', 'rank'],
    })
    expect(layer.paint?.['text-color']).toBe(theme === 'dark' ? '#f3fbfd' : '#102630')
  })
})

const provinces: Record<string, string[]> = {
  Groningen: ['Groningen', 'Delfzijl', 'Winschoten', 'Stadskanaal'],
  Friesland: ['Leeuwarden', 'Harlingen', 'Sneek', 'Heerenveen', 'Drachten', 'Dokkum', 'West-Terschelling'],
  Drenthe: ['Assen', 'Emmen', 'Hoogeveen', 'Meppel'],
  Overijssel: ['Zwolle', 'Enschede', 'Deventer', 'Almelo', 'Hardenberg', 'Kampen'],
  Flevoland: ['Lelystad', 'Almere', 'Emmeloord'],
  Gelderland: ['Arnhem', 'Nijmegen', 'Apeldoorn', 'Ede', 'Doetinchem', 'Winterswijk', 'Tiel', 'Harderwijk'],
  Utrecht: ['Utrecht', 'Amersfoort'],
  'Noord-Holland': ['Amsterdam', 'Alkmaar', 'Den Helder', 'Haarlem', 'Hoorn', 'Enkhuizen', 'IJmuiden', 'Den Burg', 'Hilversum'],
  'Zuid-Holland': ['Rotterdam', 'Den Haag', 'Leiden', 'Dordrecht', 'Gouda', 'Hoek van Holland'],
  Zeeland: ['Middelburg', 'Vlissingen', 'Goes', 'Zierikzee', 'Terneuzen'],
  'Noord-Brabant': ['Eindhoven', 'Breda', 'Den Bosch', 'Tilburg', 'Bergen op Zoom', 'Helmond', 'Oss'],
  Limburg: ['Maastricht', 'Venlo', 'Roermond', 'Heerlen', 'Weert'],
}

function metersPerPixel(zoom: number): number {
  return 2 * Math.PI * 6378137 / (512 * 2 ** (Math.floor(zoom * 2) / 2))
}

function mercator(place: { lng: number; lat: number }): [number, number] {
  return [place.lng * Math.PI / 180 * 6378137, Math.log(Math.tan(Math.PI / 4 + place.lat * Math.PI / 360)) * 6378137]
}

describe('temperature place selection', () => {
  it('assigns every candidate to exactly one province', () => {
    const assigned = Object.values(provinces).flat()
    expect(new Set(assigned).size).toBe(assigned.length)
    expect([...assigned].sort()).toEqual(temperaturePlaces.map((place) => place.name).sort())
  })

  it.each([5.5, 6, 6.5, 7, 7.5, 8, 9])('leaves no candidate further than the spacing from a label at zoom %s', (zoom) => {
    const chosen = selectTemperaturePlaces(zoom).map(mercator)
    const spacing = TEMPERATURE_LABEL_SPACING_PX * metersPerPixel(zoom)
    for (const candidate of temperaturePlaces.map(mercator)) {
      expect(Math.min(...chosen.map(([x, y]) => Math.hypot(x - candidate[0], y - candidate[1])))).toBeLessThan(spacing)
    }
    for (const [index, [x, y]] of chosen.entries()) {
      for (const [ox, oy] of chosen.slice(index + 1)) expect(Math.hypot(x - ox, y - oy)).toBeGreaterThanOrEqual(spacing)
    }
  })

  it('shows about ten labels on the overview and twenty or more zoomed in', () => {
    expect(selectTemperaturePlaces(6.5).length).toBeGreaterThanOrEqual(10)
    expect(selectTemperaturePlaces(6.5).length).toBeLessThanOrEqual(16)
    expect(selectTemperaturePlaces(7).length).toBeGreaterThanOrEqual(20)
    expect(selectTemperaturePlaces(7.5).length).toBeGreaterThan(30)
  })

  it.each([5, 5.5, 6, 6.5, 7])('always labels Zeeland at overview zoom %s', (zoom) => {
    expect(selectTemperaturePlaces(zoom).some((place) => provinces.Zeeland!.includes(place.name))).toBe(true)
  })

  it('covers every province once zoomed in to 7', () => {
    const chosen = new Set(selectTemperaturePlaces(7).map((place) => place.name))
    for (const [province, names] of Object.entries(provinces)) expect(names.some((name) => chosen.has(name)), province).toBe(true)
  })

  it('grows monotonically denser with zoom and with a smaller spacing', () => {
    expect(selectTemperaturePlaces(8).length).toBeGreaterThan(selectTemperaturePlaces(7).length)
    expect(selectTemperaturePlaces(7, 60).length).toBeGreaterThan(selectTemperaturePlaces(7, 120).length)
  })
})
