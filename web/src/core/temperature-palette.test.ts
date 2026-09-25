import { describe, expect, it } from 'vitest'
import { bandColor, fillColor, fillSample, paletteColor, TEMPERATURE_PALETTE } from './temperature-palette'

describe('temperature palette', () => {
  it('hits the stops exactly and runs cold blue → green → warm red', () => {
    for (const [temperature, hex] of TEMPERATURE_PALETTE) {
      const [r, g, b] = paletteColor(temperature).map((channel) => Math.round(channel * 255))
      expect(`#${[r, g, b].map((channel) => channel!.toString(16).padStart(2, '0')).join('')}`).toBe(hex)
    }
    const [coldR, , coldB] = paletteColor(-5)
    const [warmR, , warmB] = paletteColor(30)
    expect(coldB).toBeGreaterThan(coldR)
    expect(warmR).toBeGreaterThan(warmB)
    expect(paletteColor(-60)).toEqual(paletteColor(-20))
    expect(paletteColor(60)).toEqual(paletteColor(40))
  })

  it('colours per band, not continuously: every point between two isolines gets the band-centre colour', () => {
    // Stap 2: band 6 = 12–14 °C, midden 13 °C.
    expect(bandColor(6, 2)).toEqual(paletteColor(13))
    for (const s of [6.01, 6.3, 6.49, 6.51, 6.99]) {
      const sample = fillSample(s, 1, 0.12, 0.7)
      const band = sample.mix === 1 ? sample.upper : sample.lower
      expect(sample.mix === 0 || sample.mix === 1).toBe(true)
      expect(band).toBe(6)
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
  const jumpAtLine = (fade: number) => {
    const left = fillColor(4 - 1e-6, fade, 5, base, 0.7)
    const right = fillColor(4 + 1e-6, fade, 5, base, 0.7)
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
      const a = fillColor(4 - 0.01, fade, 5, base, 0.7), b = fillColor(4 + 0.01, fade, 5, base, 0.7)
      return Math.max(...a.map((channel, index) => Math.abs(channel - b[index]!)))
    }
    expect(slope(0.5)).toBeLessThan(slope(0.9))
    expect(slope(0.9)).toBeLessThan(full)
  })

  it('is continuous along the whole synthetic row for every fade', () => {
    for (const fade of [0, 0.25, 0.5, 0.75]) {
      let previous = fillColor(3.6, fade, 5, base, 0.7)
      for (let x = 1; x <= 80; x++) {
        const current = fillColor(3.6 + x / 100, fade, 5, base, 0.7)
        const jump = Math.max(...current.map((channel, index) => Math.abs(channel - previous[index]!)))
        // Per 0,01 stap: de steilste overgang (f = 0,75: breedte 0,25 stap) verloopt over 25 pixels.
        expect(jump).toBeLessThan(0.1 * base)
        previous = current
      }
    }
  })
})
