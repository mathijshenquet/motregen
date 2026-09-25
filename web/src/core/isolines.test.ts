import { describe, expect, it } from 'vitest'
import type { MrfHeader } from './contract'
import { blendFrames, blurField, chaikin, ISOBAR_STEP_HPA, isolineColor, isolineFeatures, isolineLabelText, isolineLevels, marchingSquares, temporalWeights, type ScalarField, adaptiveIsobarStep, fieldRangeInView, isobarLineCount, pressureExtrema } from './isolines'

function field(rows: number[][]): ScalarField {
  return { width: rows[0]!.length, height: rows.length, values: Float32Array.from(rows.flat()) }
}

function generated(width: number, height: number, value: (column: number, row: number) => number): ScalarField {
  const values = new Float32Array(width * height)
  for (let row = 0; row < height; row++) for (let column = 0; column < width; column++) values[row * width + column] = value(column, row)
  return { width, height, values }
}

const sorted = (points: Array<[number, number]>) => [...points].sort((a, b) => a[0] - b[0] || a[1] - b[1])

describe('marching squares', () => {
  it('rings a single peak with a closed contour through the edge midpoints', () => {
    const lines = marchingSquares(field([[0, 0, 0], [0, 10, 0], [0, 0, 0]]), 5)
    expect(lines).toHaveLength(1)
    expect(lines[0]!.closed).toBe(true)
    expect(sorted(lines[0]!.points)).toEqual([[0.5, 1], [1, 0.5], [1, 1.5], [1.5, 1]])
  })

  it('traces a linear ramp as one open line at the interpolated position', () => {
    const ramp = generated(6, 5, (column) => column * 2)
    const [line, ...rest] = marchingSquares(ramp, 5)
    expect(rest).toHaveLength(0)
    expect(line!.closed).toBe(false)
    expect(line!.points).toHaveLength(5)
    for (const [x] of line!.points) expect(x).toBeCloseTo(2.5)
    expect(line!.points.map(([, y]) => y).sort()).toEqual([0, 1, 2, 3, 4])
  })

  it('resolves a saddle by the cell average', () => {
    const saddle = field([[10, 0], [0, 10]])
    // Gemiddelde 5 ≥ 5: de hoge diagonaal hangt samen, de lage hoeken (rechtsboven, linksonder) worden afgesneden.
    const connected = marchingSquares(saddle, 5).map((line) => sorted(line.points))
    expect(connected).toContainEqual([[0, 0.5], [0.5, 1]])
    expect(connected).toContainEqual([[0.5, 0], [1, 0.5]])
    // Gemiddelde 5 < 6: nu worden de hoge hoeken (linksboven, rechtsonder) afgesneden.
    const split = marchingSquares(saddle, 6).map((line) => sorted(line.points).flat().map((value) => Math.round(value * 1e6) / 1e6))
    expect(split).toHaveLength(2)
    expect(split).toContainEqual([0, 0.4, 0.4, 0])
    expect(split).toContainEqual([0.6, 1, 1, 0.6])
  })

  it('stitches cells into one closed ring per level and skips no-data cells', () => {
    const bowl = generated(40, 30, (column, row) => Math.hypot(column - 20, row - 15))
    for (const level of [3, 7, 11]) {
      const lines = marchingSquares(bowl, level)
      expect(lines).toHaveLength(1)
      expect(lines[0]!.closed).toBe(true)
      for (const [x, y] of lines[0]!.points) expect(Math.hypot(x - 20, y - 15)).toBeCloseTo(level, 0)
    }
    const holed = generated(40, 30, (column, row) => column < 20 && row < 15 ? Number.NaN : Math.hypot(column - 20, row - 15))
    const opened = marchingSquares(holed, 7)
    expect(opened).toHaveLength(1)
    expect(opened[0]!.closed).toBe(false)
  })

  it('drops open specks and small rings below their own length thresholds', () => {
    const peak = field([[0, 0, 0], [0, 10, 0], [0, 0, 0]])
    expect(marchingSquares(peak, 5, 0, 3)).toHaveLength(0)
    expect(marchingSquares(peak, 5, 3, 2)).toHaveLength(1)
  })
})

describe('isoline levels and smoothing', () => {
  it('blurs around no-data without moving the data edge', () => {
    const blurred = blurField(field([[0, 9, 0], [Number.NaN, 0, 0]]), 1)
    expect(Number.isNaN(blurred.values[3]!)).toBe(true)
    // (0,0): horizontaal (0+9)/2 = 4,5; verticaal alleen zichzelf want eronder is no-data.
    expect(blurred.values[0]).toBeCloseTo(4.5)
    // (1,1): horizontaal (0+0)/2 = 0; verticaal gemiddeld met (1,0) = 3 → 1,5.
    expect(blurred.values[4]).toBeCloseTo(1.5)
    expect(blurField(field([[1, 2]]), 0).values).toEqual(Float32Array.from([1, 2]))
  })

  it('lists every multiple of the step inside the field range', () => {
    expect(isolineLevels(field([[-3.2, 7], [Number.NaN, 0]]), 2)).toEqual([-2, 0, 2, 4, 6])
    expect(isolineLevels(field([[Number.NaN]]), 2)).toEqual([])
  })

  it('keeps open endpoints and doubles closed rings per Chaikin pass', () => {
    const open = chaikin([[0, 0], [1, 1], [2, 0]], false, 1)
    expect(open[0]).toEqual([0, 0])
    expect(open.at(-1)).toEqual([2, 0])
    expect(open).toHaveLength(6)
    const square: Array<[number, number]> = [[0, 0], [1, 0], [1, 1], [0, 1]]
    const ring = chaikin(square, true, 2)
    expect(ring).toHaveLength(16)
    for (const [x, y] of ring) {
      expect(x).toBeGreaterThanOrEqual(0); expect(x).toBeLessThanOrEqual(1)
      expect(y).toBeGreaterThanOrEqual(0); expect(y).toBeLessThanOrEqual(1)
    }
  })
})

describe('isoline features', () => {
  const quant: Array<number | null> = Array.from({ length: 255 }, (_, index) => index * 0.3 - 31.2)
  quant.push(null)
  const header = {
    version: 0,
    field: 'feels_like_c',
    grid: { crs: 'EPSG:3857', x0: 300_000, y0: 7_200_000, dx: 6_000, dy: -6_000, width: 209, height: 225 },
    quant,
    source: 'harmonie',
    run: '2026-09-23T12:00:00Z',
    frames: [],
    dict: null,
  } satisfies MrfHeader
  const size = 209 * 225
  const frame = (offset: number) => {
    const data = new Uint8Array(size)
    for (let index = 0; index < size; index++) {
      const column = index % 209, row = Math.floor(index / 209)
      data[index] = Math.round(120 + offset + 30 * Math.sin(column / 23) * Math.cos(row / 31) + row * 0.2)
    }
    data[0] = 255
    return data
  }

  it('blends weighted frames and treats no-data as a hole', () => {
    const blended = blendFrames([{ data: frame(0), quant, weight: 0.5 }, { data: frame(10), quant, weight: 0.5 }], 209, 225)
    expect(Number.isNaN(blended.values[0]!)).toBe(true)
    expect(blended.values[1]).toBeCloseTo((quant[frame(0)[1]!]! + quant[frame(10)[1]!]!) / 2, 4)
    const three = blendFrames([{ data: frame(0), quant, weight: 1 }, { data: frame(6), quant, weight: 4 }, { data: frame(12), quant, weight: 1 }], 209, 225)
    expect(three.values[1]).toBeCloseTo((quant[frame(0)[1]!]! + 4 * quant[frame(6)[1]!]! + quant[frame(12)[1]!]!) / 6, 4)
  })

  it('emits labelled lng/lat lines for the 6 km grid within a main-thread budget', () => {
    const blended = blendFrames([{ data: frame(0), quant, weight: 0.6 }, { data: frame(6), quant, weight: 0.4 }], 209, 225)
    const started = performance.now()
    const data = isolineFeatures(blended, header.grid, 1)
    const elapsed = performance.now() - started
    expect(data.features.length).toBeGreaterThan(10)
    const first = data.features[0]!
    expect(first.properties.label).toBe(`${first.properties.level}°`)
    const [lng, lat] = first.geometry.coordinates[0]!
    expect(lng).toBeGreaterThan(2); expect(lng).toBeLessThan(15)
    expect(lat).toBeGreaterThan(50); expect(lat).toBeLessThan(56)
    // Ruim budget voor CI; gemeten waarden staan in de track-LOG.
    expect(elapsed).toBeLessThan(250)
  })
})

describe('temporal weights', () => {
  const hour = 3_600_000
  const epochs = Array.from({ length: 20 }, (_, index) => index * hour)
  const value = (weights: ReturnType<typeof temporalWeights>, series: (index: number) => number) => weights.reduce((sum, { index, weight }) => sum + weight * series(index), 0)

  it('window 0 is the plain two-frame linear blend', () => {
    expect(temporalWeights(epochs, 2.25 * hour, 0)).toEqual([{ index: 2, weight: 0.75 }, { index: 3, weight: 0.25 }])
    expect(temporalWeights(epochs, 3 * hour, 0)).toEqual([{ index: 3, weight: 1 }])
    expect(temporalWeights(epochs, -hour, 0)).toEqual([{ index: 0, weight: 1 }])
    expect(temporalWeights(epochs, 30 * hour, 0)).toEqual([{ index: 19, weight: 1 }])
  })

  it('the B-spline kernel sums to one and reproduces linear trends in the interior', () => {
    for (const window of [1, 2, 3]) {
      for (const t of [8, 8.3, 9.5, 10.99]) {
        const weights = temporalWeights(epochs, t * hour, window)
        expect(weights.reduce((sum, { weight }) => sum + weight, 0)).toBeCloseTo(1, 10)
        expect(value(weights, (index) => 2 * index + 1)).toBeCloseTo(2 * t + 1, 4)
      }
    }
    expect(temporalWeights(epochs, 4 * hour, 1).map(({ weight }) => weight)).toEqual([1 / 6, 4 / 6, 1 / 6].map((weight) => expect.closeTo(weight, 10)))
    expect(temporalWeights(epochs, 4.5 * hour, 2)).toHaveLength(8)
  })

  it('removes the velocity kink at frame boundaries that the linear blend has', () => {
    // Zigzag-reeks: lineair wisselt de helling op elk uur van teken; de B-spline niet.
    const zigzag = (index: number) => index % 2 ? 1 : 0
    const slope = (window: number, t: number, side: number) => {
      const h = 1e-4
      const at = (time: number) => value(temporalWeights(epochs, time * hour, window), zigzag)
      return side < 0 ? (at(t) - at(t - h)) / h : (at(t + h) - at(t)) / h
    }
    const kink = (window: number) => Math.abs(slope(window, 5, 1) - slope(window, 5, -1))
    expect(kink(0)).toBeCloseTo(2, 3)
    expect(kink(1)).toBeLessThan(1e-2)
  })
})

describe('isobars (U35)', () => {
  const grid = { crs: 'EPSG:3857', x0: 400_000, y0: 7_200_000, dx: 6_000, dy: -6_000, width: 40, height: 40 } as MrfHeader['grid']

  it('draws every 4 hPa on multiples of 4 and labels them without a unit', () => {
    const pressure = generated(40, 40, (column) => 1_003 + column * 0.5)
    expect(isolineLevels(pressure, ISOBAR_STEP_HPA)).toEqual([1_004, 1_008, 1_012, 1_016, 1_020])
    const labels = new Set(isolineFeatures(pressure, grid, ISOBAR_STEP_HPA, 0, 'pressure').features.map((feature) => feature.properties.label))
    expect([...labels].sort()).toEqual(['1004', '1008', '1012', '1016', '1020'])
    expect(isolineLabelText('temperature', 12)).toBe('12°')
  })

  it('uses one flat line colour, a little darker than the temperature lines in both themes', () => {
    const luminance = (hex: string) => [1, 3, 5].reduce((sum, offset) => sum + Number.parseInt(hex.slice(offset, offset + 2), 16), 0)
    for (const theme of ['light', 'dark'] as const) {
      expect(luminance(isolineColor(theme, 'pressure'))).toBeLessThan(luminance(isolineColor(theme)))
    }
  })
})

describe('adaptive isobar step (U34)', () => {
  it('counts the isobars a pressure range crosses', () => {
    expect(isobarLineCount(1018.2, 1021.9, 4)).toBe(1)
    expect(isobarLineCount(1018.2, 1021.9, 2)).toBe(1)
    expect(isobarLineCount(1018.2, 1021.9, 1)).toBe(3)
    expect(isobarLineCount(1000, 1016, 4)).toBe(5)
    expect(isobarLineCount(1010, 1009, 1)).toBe(0)
  })

  it('picks the coarsest step that gives at least four lines', () => {
    expect(adaptiveIsobarStep(996, 1020)).toBe(4)
    expect(adaptiveIsobarStep(1015.5, 1022.5)).toBe(2)
    expect(adaptiveIsobarStep(1018.2, 1021.9)).toBe(1)
    // Nog vlakker dan 1 hPa per lijn: de fijnste stap is de ondergrens.
    expect(adaptiveIsobarStep(1020.1, 1020.4)).toBe(1)
  })

  it('does not flip on small range changes (hysteresis)', () => {
    // Bij 4 hPa zakt het bereik naar 3 lijnen: blijft 4 (fijner pas onder 3).
    expect(adaptiveIsobarStep(1000.5, 1012.5, 4)).toBe(4)
    // Onder 3 lijnen meteen naar de stap die er weer ≥ 4 geeft (hier pas 1 hPa).
    expect(adaptiveIsobarStep(1001, 1007, 4)).toBe(1)
    expect(adaptiveIsobarStep(1001, 1009, 4)).toBe(2)
    // Bij 1 hPa geeft 2 hPa net 4 lijnen: blijft 1 (grover pas vanaf 6 lijnen).
    expect(adaptiveIsobarStep(1014, 1020.5, 1)).toBe(1)
    expect(adaptiveIsobarStep(1010, 1021, 1)).toBe(2)
    expect(adaptiveIsobarStep(990, 1016, 1)).toBe(4)
  })

  it('takes min and max of the valid values inside the view', () => {
    // 4×3-grid van 100 km-cellen vanaf (0 m, 5 000 km noord); waarde = kolom + 10 × rij, één ongeldige cel.
    const grid = { x0: 0, y0: 5_000_000, dx: 100_000, dy: -100_000, width: 4, height: 3 } as Parameters<typeof fieldRangeInView>[2]
    const values = Array.from({ length: 12 }, (_, index) => (index % 4) + 10 * Math.floor(index / 4))
    const valid = values.map((_, index) => index === 0 ? 0 : 1)
    const lng = (x: number) => x / 6_378_137 * 180 / Math.PI
    const lat = (y: number) => (2 * Math.atan(Math.exp(y / 6_378_137)) - Math.PI / 2) * 180 / Math.PI
    // Kader over kolom 0–1 en rij 0–1: cel 0 is ongeldig.
    expect(fieldRangeInView(values, valid, grid, { west: lng(10_000), east: lng(190_000), north: lat(4_990_000), south: lat(4_810_000) })).toEqual([1, 11])
    expect(fieldRangeInView(values, valid, grid, { west: lng(-900_000), east: lng(-800_000), north: lat(4_990_000), south: lat(4_810_000) })).toBeUndefined()
  })
})

describe('pressure extrema (H/L, U34)', () => {
  // 40×40-veld: een hoog op (10, 10), een laag op (30, 28), verder een zachte helling.
  const width = 40, height = 40
  const field = (fn: (column: number, row: number) => number) => Float32Array.from({ length: width * height }, (_, index) => fn(index % width, Math.floor(index / width)))
  const bump = (column: number, row: number, cx: number, cy: number, amplitude: number) => amplitude * Math.exp(-((column - cx) ** 2 + (row - cy) ** 2) / 30)
  const pressure = field((column, row) => 1015 + column * 0.02 + bump(column, row, 10, 10, 6) + bump(column, row, 30, 28, -5))
  const valid = new Float32Array(width * height).fill(1)

  it('finds one H and one L with enough prominence', () => {
    const extrema = pressureExtrema(pressure, valid, width, height, 6)
    expect(extrema.map(({ kind, column, row }) => [kind, column, row])).toEqual([['H', 10, 10], ['L', 30, 28]])
  })

  it('ignores flat bumps below the prominence and windows that touch missing data', () => {
    const flat = field((column, row) => 1015 + bump(column, row, 20, 20, 1))
    expect(pressureExtrema(flat, valid, width, height, 6)).toEqual([])
    const holed = Float32Array.from(valid)
    holed[12 * width + 12] = 0
    expect(pressureExtrema(pressure, holed, width, height, 6).map(({ kind }) => kind)).toEqual(['L'])
  })
})
