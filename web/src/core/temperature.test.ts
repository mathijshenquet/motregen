import { describe, expect, it } from 'vitest'
import type { MrfHeader } from './contract'
import { selectTemperaturePlaces, temperatureLabelSpacingPx, TEMPERATURE_VARIABLE_ANCHORS, temperatureLabels, temperatureLayer, temperaturePlaces } from './temperature'

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
  'Antwerpen (BE)': ['Antwerpen', 'Mechelen', 'Turnhout'],
  'Oost-Vlaanderen': ['Gent', 'Aalst', 'Sint-Niklaas'],
  'West-Vlaanderen': ['Brugge', 'Kortrijk', 'Oostende', 'Roeselare'],
  // Brussel ligt als enclave in Vlaams-Brabant; samen één gebied.
  'Vlaams-Brabant en Brussel': ['Brussel', 'Leuven'],
  'Limburg (BE)': ['Hasselt', 'Genk'],
}

const flemishProvinces = ['Antwerpen (BE)', 'Oost-Vlaanderen', 'West-Vlaanderen', 'Vlaams-Brabant en Brussel', 'Limburg (BE)']

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

  it.each([[5.5, 56], [6, 56], [6.5, 96], [7, 96], [7.5, 96], [8, 72], [9, 96]])('leaves no candidate further than the spacing from a label at zoom %s, %s px', (zoom, spacingPx) => {
    const chosen = selectTemperaturePlaces(zoom, spacingPx).map(mercator)
    const spacing = spacingPx * metersPerPixel(zoom)
    for (const candidate of temperaturePlaces.map(mercator)) {
      expect(Math.min(...chosen.map(([x, y]) => Math.hypot(x - candidate[0], y - candidate[1])))).toBeLessThan(spacing)
    }
    for (const [index, [x, y]] of chosen.entries()) {
      for (const [ox, oy] of chosen.slice(index + 1)) expect(Math.hypot(x - ox, y - oy)).toBeGreaterThanOrEqual(spacing)
    }
  })

  it('scales the spacing with the map and clamps it', () => {
    expect(temperatureLabelSpacingPx(393, 408)).toBe(56)
    expect(temperatureLabelSpacingPx(970, 900)).toBe(96)
    expect(temperatureLabelSpacingPx(200, 200)).toBe(56)
    expect(temperatureLabelSpacingPx(560, 700)).toBe(80)
  })

  // Overview zooms after U6 (contain): Pixel 5 ≈ 5.6, desktop 1440×900 ≈ 7.0.
  it('shows about ten labels on the overview and twenty or more zoomed in', () => {
    const phone = temperatureLabelSpacingPx(393, 408), desktop = temperatureLabelSpacingPx(970, 900)
    expect(selectTemperaturePlaces(5.6, phone).length).toBeGreaterThanOrEqual(9)
    expect(selectTemperaturePlaces(5.6, phone).length).toBeLessThanOrEqual(16)
    expect(selectTemperaturePlaces(7, desktop).length).toBeGreaterThanOrEqual(10)
    // Vlaanderen (U27) voegt op zoom 7 vier tot vijf labels toe.
    expect(selectTemperaturePlaces(7, desktop).length).toBeLessThanOrEqual(24)
    expect(selectTemperaturePlaces(7, phone).length).toBeGreaterThanOrEqual(20)
    expect(selectTemperaturePlaces(7.5, desktop).length).toBeGreaterThanOrEqual(20)
  })

  it.each([[5, 56], [5.5, 56], [6, 56], [6.5, 96], [7, 96], [6.5, 72]])('always labels Zeeland at overview zoom %s, %s px', (zoom, spacingPx) => {
    expect(selectTemperaturePlaces(zoom, spacingPx).some((place) => provinces.Zeeland!.includes(place.name))).toBe(true)
  })

  it('covers every province once zoomed in', () => {
    const chosen = new Set(selectTemperaturePlaces(7, 72).map((place) => place.name))
    for (const [province, names] of Object.entries(provinces)) {
      if (!flemishProvinces.includes(province)) expect(names.some((name) => chosen.has(name)), province).toBe(true)
    }
    // Belgisch Limburg ligt binnen 30 km van Maastricht: de dichtheidsregel laat het pas een zoomstap later toe.
    const closer = new Set(selectTemperaturePlaces(8, 72).map((place) => place.name))
    for (const province of flemishProvinces) expect(provinces[province]!.some((name) => closer.has(name)), province).toBe(true)
  })

  it('keeps Flanders as sparse as the Netherlands around Antwerpen–Mechelen–Brussel', () => {
    const phone = temperatureLabelSpacingPx(393, 408)
    const overview = new Set(selectTemperaturePlaces(5.6, phone).map((place) => place.name))
    expect(['Antwerpen', 'Mechelen', 'Brussel'].filter((name) => overview.has(name))).toEqual(['Antwerpen'])
    const desktop = new Set(selectTemperaturePlaces(7, temperatureLabelSpacingPx(970, 900)).map((place) => place.name))
    expect(desktop.has('Mechelen')).toBe(false)
    expect(['Antwerpen', 'Gent', 'Brussel', 'Brugge'].every((name) => desktop.has(name))).toBe(true)
  })

  it('grows monotonically denser with zoom and with a smaller spacing', () => {
    expect(selectTemperaturePlaces(8, 96).length).toBeGreaterThan(selectTemperaturePlaces(7, 96).length)
    expect(selectTemperaturePlaces(7, 60).length).toBeGreaterThan(selectTemperaturePlaces(7, 120).length)
  })
})
