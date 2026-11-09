import { describe, expect, it } from 'vitest'
import { absorbedSunQ, directNormalFromGlobalHour, feelsLikeC, feelsLikeSunC, standingProjectedAreaFactor, sunQAt, windChillC } from './feels-sun'
import { linkedFeelsVariant, quantizeLinear } from './feels-variant'
import { solarElevationSin } from './solar'

const deBilt = (epoch: number) => solarElevationSin(epoch, 5.18, 52.1)
const springNoon = Date.parse('2026-04-20T12:00:00Z')
const midnight = Date.parse('2026-04-20T23:00:00Z')

describe('gevoelstemperatuur met zon (MIP-41)', () => {
  it('volgt de ingest tot en met 10 °C, ook in de zon', () => {
    for (const q of [0, 100, 250]) {
      expect(feelsLikeSunC(-5, 0.8, 20 / 3.6, q)).toBeCloseTo(windChillC(-5, 20 / 3.6), 6)
      expect(feelsLikeSunC(10, 0.6, 4, q)).toBeCloseTo(feelsLikeC(10, 0.6, 4), 6)
    }
  })

  it('springt nergens rond de overgangsband van 10 tot 15 °C', () => {
    let largest = 0
    for (const q of [0, 50, 100, 200, 250]) {
      for (const humidity of [0.3, 0.6, 0.8, 1]) {
        for (const wind of [0, 1, 1.3, 3, 6, 10, 15]) {
          expect(Math.abs(feelsLikeSunC(10.005, humidity, wind, q) - feelsLikeSunC(9.995, humidity, wind, q))).toBeLessThan(0.05)
          for (let temperature = 8; temperature < 17; temperature += 0.1) {
            const jump = Math.abs(feelsLikeSunC(temperature + 0.1, humidity, wind, q) - feelsLikeSunC(temperature, humidity, wind, q))
            largest = Math.max(largest, jump)
          }
        }
      }
    }
    // MIP-10/MIP-41: geen sprong > 1 °C. Bij veel zon en weinig wind is de band steil (Q 250, windstil: ruim 0,5 °C per
    // 0,1 °C), maar continu.
    expect(largest).toBeLessThan(0.6)
  })

  it('valt zonder zon terug op de schaduwvorm', () => {
    expect(sunQAt(midnight, 0, 0, deBilt)).toBe(0)
    expect(sunQAt(midnight, null, undefined, deBilt)).toBe(0)
    for (const temperature of [15, 18, 22, 25]) {
      for (const humidity of [0.3, 0.6, 0.9]) {
        for (const wind of [0, 3, 8]) {
          // BoM met Q = 0 tegen de vereenvoudigde schaduwvorm: alleen de constanten verschillen (0,348e − 4,25 tegen
          // 0,33e − 4,00, verschil 0,018e − 0,25): hooguit 0,3 °C, op een benauwde zomeravond (25 °C, RH 90 %).
          expect(Math.abs(feelsLikeSunC(temperature, humidity, wind, 0) - feelsLikeC(temperature, humidity, wind))).toBeLessThan(0.3)
        }
      }
    }
  })

  it('bewolkt heeft vrijwel geen directe zon', () => {
    const q = sunQAt(springNoon, 150, 150, deBilt)
    expect(q).toBeLessThan(5)
    expect(feelsLikeSunC(15, 0.85, 4.4, q)).toBeLessThan(15)
  })

  it('een zonnige lentemiddag voelt duidelijk warmer dan de lucht', () => {
    const q = sunQAt(springNoon, 700, 700, deBilt)
    expect(q).toBeGreaterThan(70)
    expect(q).toBeLessThan(120)
    expect(feelsLikeSunC(15, 0.6, 2.5, q)).toBeGreaterThan(16.5)
  })

  it('heeft een redelijke zonbundel en projectiefactor', () => {
    expect(standingProjectedAreaFactor(Math.sin(Math.PI / 2))).toBeCloseTo(0.08, 2)
    expect(standingProjectedAreaFactor(0.01)).toBeCloseTo(0.308, 2)
    expect(standingProjectedAreaFactor(-0.1)).toBe(0)
    expect(absorbedSunQ(800, Math.sin(Math.PI / 4))).toBeCloseTo(0.7 * 800 * standingProjectedAreaFactor(Math.sin(Math.PI / 4)), 6)
    const clear = directNormalFromGlobalHour(700, springNoon, deBilt)
    expect(clear).toBeGreaterThan(500)
    expect(clear).toBeLessThanOrEqual(1000)
    expect(directNormalFromGlobalHour(700, midnight, deBilt)).toBe(0)
  })
})

describe('?dev&gevoel', () => {
  it('kiest alleen onder ?dev', () => {
    expect(linkedFeelsVariant('?dev&gevoel=zon')).toBe('zon')
    expect(linkedFeelsVariant('?dev&gevoel=zon-sterk')).toBe('zon-sterk')
    expect(linkedFeelsVariant('?gevoel=zon')).toBe('nu')
    expect(linkedFeelsVariant('?dev&gevoel=raar')).toBe('nu')
  })

  it('kwantiseert op de temperatuurtabel', () => {
    const quant = [...Array.from({ length: 255 }, (_, index) => -31.2 + index * 0.3), null]
    expect(quant[quantizeLinear(quant, 17.4)]).toBeCloseTo(17.4, 5)
    expect(quantizeLinear(quant, 99)).toBe(254)
    expect(quantizeLinear(quant, -99)).toBe(0)
  })
})
