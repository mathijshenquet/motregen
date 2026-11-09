import { describe, expect, it } from 'vitest'
import type { Grid } from './contract'
import { WINDSOCK_SAMPLES } from './wind-glyph'
import { advanceWave, angleDifference, followSpring, mixAngle, sampleWind, swayBends, windsockHeadings, type WindsockField, type WindSlice } from './windsock-flow'

const grid = { crs: 'EPSG:3857', x0: 0, y0: 7_000_000, dx: 100_000, dy: -100_000, width: 10, height: 10 } as Grid

/** Uniform veld (oost, noord) in m/s. */
function uniform(east: number, north: number): Float32Array {
  const vectors = new Float32Array(grid.width * grid.height * 2)
  for (let index = 0; index < grid.width * grid.height; index++) { vectors[index * 2] = east; vectors[index * 2 + 1] = north }
  return vectors
}
const slice = (vectors: Float32Array): WindSlice => ({ left: vectors, right: vectors, mix: 0 })
const centre = [500_000, 6_500_000] as const

describe('sampleWind', () => {
  it('mengt de twee uren lineair', () => {
    const field: WindsockField = { grid, slices: [{ left: uniform(-8, 0), right: uniform(0, 8), mix: 0.5 }, slice(uniform(0, 0)), slice(uniform(0, 0))] }
    expect(sampleWind(field, 0, ...centre)).toEqual([-4, 4])
  })
})

describe('hoeken', () => {
  it('nemen de kortste weg', () => {
    expect(angleDifference(350, 10)).toBe(20)
    expect(angleDifference(10, 350)).toBe(-20)
    expect(mixAngle(350, 10, 0.5)).toBe(360)
  })
})

describe('windsockHeadings', () => {
  it('staat recht in een uniform veld', () => {
    const field: WindsockField = { grid, slices: [slice(uniform(5, 0)), slice(uniform(5, 0)), slice(uniform(5, 0))] }
    const headings = windsockHeadings(field, ...centre, 'beide')!
    expect(headings).toHaveLength(WINDSOCK_SAMPLES + 1)
    for (const heading of headings) expect(heading).toBeCloseTo(90, 6)
  })

  it('laat de staart achterlopen als de wind draait', () => {
    // Nu naar het oosten, anderhalf uur eerder naar het noorden: de staart wijst nog deels noordwaarts.
    const field: WindsockField = { grid, slices: [slice(uniform(5, 0)), slice(uniform(5, 5)), slice(uniform(0, 5))] }
    const headings = windsockHeadings(field, ...centre, 'traag')!
    expect(headings[0]).toBeCloseTo(90, 6)
    expect(headings[WINDSOCK_SAMPLES / 2]).toBeCloseTo(45, 6)
    expect(headings.at(-1)).toBeCloseTo(15, 6) // begrensd op 75° buiging
    expect(windsockHeadings(field, ...centre, 'stroom')!.at(-1)).toBeCloseTo(90, 6)
  })
})

describe('momentum', () => {
  it('volgt een sprong vloeiend en zonder doorschieten, ook bij grote framestappen', () => {
    const spring = { value: 0, velocity: 0 }
    const values: number[] = []
    for (let frame = 0; frame < 120; frame++) { followSpring(spring, 90, 1 / 30, 0.6); values.push(spring.value) }
    expect(Math.max(...values)).toBeLessThanOrEqual(90)
    expect(values[8]).toBeGreaterThan(20)
    expect(values[8]).toBeLessThan(80)
    expect(spring.value).toBeCloseTo(90, 1)
    const coarse = { value: 0, velocity: 0 }
    followSpring(coarse, 90, 0.5, 0.6)
    expect(coarse.value).toBeGreaterThan(0)
    expect(coarse.value).toBeLessThanOrEqual(90)
  })
})

describe('wuiven', () => {
  it('beweegt vooral de staart, en sneller bij meer wind', () => {
    const range = (strength: number, index: number) => {
      const values = Array.from({ length: 200 }, (_, step) => swayBends(strength, advanceWave(0, strength, step / 50), step / 50, 1.3)[index]!)
      return Math.max(...values) - Math.min(...values)
    }
    expect(range(3, WINDSOCK_SAMPLES)).toBeGreaterThan(range(3, 0) * 2)
    const crossings = (strength: number) => {
      let count = 0, previous = swayBends(strength, 0, 0, 0.4)[WINDSOCK_SAMPLES]!
      for (let step = 1; step < 400; step++) {
        const value = swayBends(strength, advanceWave(0, strength, step / 100), step / 100, 0.4)[WINDSOCK_SAMPLES]!
        if (Math.sign(value) !== Math.sign(previous)) count++
        previous = value
      }
      return count
    }
    expect(crossings(8)).toBeGreaterThan(crossings(1) * 2)
  })
})
