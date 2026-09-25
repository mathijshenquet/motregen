import { describe, expect, it } from 'vitest'
import { bandColor, fillColor, fillSample, paletteColor, paletteRange, paletteStops, rampKnots, TEMPERATURE_RAMP, type Rgb } from './temperature-palette'

const hex = (color: Rgb) => `#${color.map((channel) => Math.round(channel * 255).toString(16).padStart(2, '0')).join('')}`
const ramp = (index: number) => TEMPERATURE_RAMP[index]!
// Blauwachtig: blauw kanaal duidelijk boven rood; roodachtig: omgekeerd.
const bluish = ([r, , b]: Rgb) => b > r + 0.3
const reddish = ([r, , b]: Rgb) => r > b + 0.5
const distance = (a: Rgb, b: Rgb) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

describe('palette range', () => {
  it('rounds outward to whole degrees', () => {
    expect(paletteRange(8.3, 17.2)).toEqual({ low: 8, high: 18 })
    expect(paletteRange(-4.6, 9.01)).toEqual({ low: -5, high: 10 })
  })

  it('widens to a span of at least 8 °C around the middle', () => {
    expect(paletteRange(11.2, 14.7)).toEqual({ low: 9, high: 17 })
    expect(paletteRange(12, 12)).toEqual({ low: 8, high: 16 })
    const { low, high } = paletteRange(10.5, 13.5)!
    expect(high - low).toBe(8)
  })

  it('has no range without values', () => {
    expect(paletteRange(Infinity, -Infinity)).toBeUndefined()
    expect(paletteRange(Number.NaN, 3)).toBeUndefined()
  })
})

describe('stretched palette', () => {
  it('spans the whole ramp over a mild day, so each band gets its own hue', () => {
    const stops = paletteStops({ low: 9, high: 17 })
    expect(hex(paletteColor(9, stops))).toBe(ramp(0))
    expect(hex(paletteColor(17, stops))).toBe(ramp(TEMPERATURE_RAMP.length - 1))
    const bands = Array.from({ length: 8 }, (_, index) => bandColor(9 + index, 1, stops))
    for (let index = 1; index < bands.length; index++) expect(distance(bands[index]!, bands[index - 1]!)).toBeGreaterThan(0.08)
    // Vergeleken met het vaste U25-palet (−20…40 °C), waar dit bereik één à twee tinten was.
    expect(distance(bands[0]!, bands.at(-1)!)).toBeGreaterThan(0.6)
  })

  it('keeps sub-zero blue on a cold range (−3…6 °C): the 0 °C anchor bends the ramp', () => {
    const range = paletteRange(-3, 6)!
    expect(range).toEqual({ low: -3, high: 6 })
    expect(rampKnots(range).map(([temperature]) => temperature)).toEqual([-3, 0, 6])
    const stops = paletteStops(range)
    for (const temperature of [-3, -2, -1, -0.1]) expect(bluish(paletteColor(temperature, stops))).toBe(true)
    expect(hex(paletteColor(0, stops))).toBe(ramp(1))
    expect(reddish(paletteColor(6, stops))).toBe(true)
  })

  it('keeps 25 °C and up red on a hot range (18…31 °C)', () => {
    const range = paletteRange(18.4, 30.2)!
    expect(rampKnots(range).map(([temperature]) => temperature)).toEqual([18, 25, 31])
    const stops = paletteStops(range)
    for (const temperature of [25, 27, 31]) expect(reddish(paletteColor(temperature, stops))).toBe(true)
    expect(bluish(paletteColor(18, stops))).toBe(true)
  })

  it('is entirely blue below zero and entirely red above 25 °C', () => {
    const frost = paletteStops({ low: -12, high: -1 })
    for (const temperature of [-12, -6, -1]) expect(bluish(paletteColor(temperature, frost))).toBe(true)
    const heat = paletteStops({ low: 26, high: 34 })
    for (const temperature of [26, 30, 34]) expect(reddish(paletteColor(temperature, heat))).toBe(true)
  })

  it('is continuous and fits the shader uniforms', () => {
    for (const range of [{ low: 9, high: 17 }, { low: -3, high: 6 }, { low: 18, high: 31 }, { low: -8, high: 30 }]) {
      const stops = paletteStops(range)
      expect(stops.length).toBeLessThanOrEqual(TEMPERATURE_RAMP.length + 2)
      for (let index = 1; index < stops.length; index++) expect(stops[index]![0]).toBeGreaterThan(stops[index - 1]![0])
      let previous = paletteColor(range.low, stops)
      for (let temperature = range.low; temperature <= range.high; temperature += 0.01) {
        const color = paletteColor(temperature, stops)
        expect(distance(color, previous)).toBeLessThan(0.05)
        previous = color
      }
    }
  })

  it('colours per band, not continuously: every point between two isolines gets the band-centre colour', () => {
    const stops = paletteStops({ low: 9, high: 17 })
    // Stap 2: band 6 = 12–14 °C, midden 13 °C.
    expect(bandColor(6, 2, stops)).toEqual(paletteColor(13, stops))
    for (const s of [6.01, 6.3, 6.49, 6.51, 6.99]) {
      const sample = fillSample(s, 1, 0.18, 0.7)
      expect(sample.mix === 0 || sample.mix === 1).toBe(true)
      expect(sample.mix === 1 ? sample.upper : sample.lower).toBe(6)
    }
  })
})

describe('fill opacity', () => {
  it('is strongest at the line and falls off to (1 − falloff) at the band centre', () => {
    expect(fillSample(5, 1, 0.12, 0.7).opacity).toBeCloseTo(0.12, 9)
    expect(fillSample(5.5, 1, 0.12, 0.7).opacity).toBeCloseTo(0.12 * 0.3, 9)
    expect(fillSample(4.5, 1, 0.12, 0.7).opacity).toBeCloseTo(0.12 * 0.3, 9)
    expect(fillSample(5.25, 1, 0.12, 0.7).opacity).toBeCloseTo(0.12 * (0.3 + 0.7 * 0.5), 9)
    // Geen afval: egaal.
    expect(fillSample(5.37, 1, 0.1, 0).opacity).toBeCloseTo(0.1, 9)
  })

  it('is continuous across the band centre, where the nearest line switches', () => {
    for (const [below, above] of [[1, 0.2], [0, 1], [0.4, 0.9]] as const) {
      // Links van 5,5 is lijn 5 het dichtst (fade `below`), rechts lijn 6 (fade `above`).
      const left = fillSample(5.5 - 1e-7, below, 0.12, 0.7)
      const right = fillSample(5.5 + 1e-7, above, 0.12, 0.7)
      expect(Math.abs(left.opacity - right.opacity)).toBeLessThan(1e-6)
      expect(left.mix).toBeCloseTo(1, 5)
      expect(right.mix).toBeCloseTo(0, 5)
      expect(left.upper).toBe(right.lower)
    }
  })
})

describe('fading line: the two band colours mix with the same factor', () => {
  // Synthetisch veld s(x) = 3,6 + x/100 langs een rij pixels: één lijn (niveau 4, bij x = 40) die
  // met factor f vervaagt. Stap 5 °C: band 3 (15–20) en 4 (20–25) liggen ver uit elkaar in het palet.
  const base = 0.12
  const stops = paletteStops({ low: 14, high: 24 })
  const jumpAtLine = (fade: number) => {
    const left = fillColor(4 - 1e-6, fade, 5, stops, base, 0.7)
    const right = fillColor(4 + 1e-6, fade, 5, stops, base, 0.7)
    return Math.max(...left.map((channel, index) => Math.abs(channel - right[index]!)))
  }

  it('leaves no colour border where the line has faded out', () => {
    expect(jumpAtLine(0)).toBeLessThan(base / 255)
    expect(jumpAtLine(0.001)).toBeLessThan(base / 255)
  })

  it('keeps the hard border under a fully visible line, scaled by the fade in between', () => {
    const full = jumpAtLine(1)
    expect(full).toBeGreaterThan(10 * base / 255)
    // Tussenin: de grens is een overgang over (1 − f) stap; hoe zichtbaarder de lijn, hoe steiler.
    const slope = (fade: number) => {
      const a = fillColor(4 - 0.01, fade, 5, stops, base, 0.7), b = fillColor(4 + 0.01, fade, 5, stops, base, 0.7)
      return Math.max(...a.map((channel, index) => Math.abs(channel - b[index]!)))
    }
    expect(slope(0.5)).toBeLessThan(slope(0.9))
    expect(slope(0.9)).toBeLessThan(full)
  })

  it('is continuous along the whole synthetic row for every fade', () => {
    for (const fade of [0, 0.25, 0.5, 0.75]) {
      let previous = fillColor(3.6, fade, 5, stops, base, 0.7)
      for (let x = 1; x <= 80; x++) {
        const current = fillColor(3.6 + x / 100, fade, 5, stops, base, 0.7)
        const jump = Math.max(...current.map((channel, index) => Math.abs(channel - previous[index]!)))
        // Per 0,01 stap: de steilste overgang (f = 0,75: breedte 0,25 stap) verloopt over 25 pixels.
        expect(jump).toBeLessThan(0.1 * base)
        previous = current
      }
    }
  })
})
