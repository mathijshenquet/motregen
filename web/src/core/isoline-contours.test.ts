import { describe, expect, it } from 'vitest'
import type { Grid } from './contract'
import { buildSegments, NO_RING_LEVEL, ringFade, ringFadeAt, ringFadeRaster, SEGMENT_FLOATS, shortRings, traceContours } from './isoline-contours'
import { sampleSlice, smoothstep } from './isoline-spline'
import { TraceCore } from './isoline-tracer'

// Evenaar: een cel is dan exact dx km (cos φ = 1), dus ringlengtes zijn na te rekenen.
const grid = { crs: 'EPSG:3857', x0: 0, y0: 0, dx: 1000, dy: -1000, width: 60, height: 60 } as Grid

/** Kegel T = 20 − r/2 (cellen) rond (30, 30): niveau L ligt op een cirkel met r = 2(20 − L). */
function cone(offset = 0) {
  const values = new Float32Array(grid.width * grid.height)
  for (let row = 0; row < grid.height; row++) for (let column = 0; column < grid.width; column++) values[row * grid.width + column] = 20 + offset - Math.hypot(column - 30, row - 30) / 2
  return { values, valid: new Float32Array(values.length).fill(1) }
}

describe('isoline contours on the exact B-spline surface', () => {
  const field = cone()
  const contours = traceContours(field, grid, { step: 1, toleranceCells: 0.02 })

  it('puts every point on its level of the spline surface', () => {
    const slice = { width: grid.width, height: grid.height, fields: [field], weights: [1] }
    for (const contour of contours) {
      for (let index = 0; index < contour.points.length; index += 2) {
        expect(Math.abs(sampleSlice(slice, contour.points[index]!, contour.points[index + 1]!).value - contour.level)).toBeLessThan(2e-3)
      }
    }
  })

  it('closes the rings and measures them in km', () => {
    const ring = contours.find((contour) => contour.level === 15)!
    expect(ring.closed).toBe(true)
    expect(ring.lengthKm).toBeCloseTo(2 * Math.PI * 10, 0)
    // Tolerantie 0,02 cel op r = 10: een koorde van ~1 cel mag ~0,0125 afwijken, dus niet verdicht.
    expect(ring.gradient[0]).toBeCloseTo(0.5, 1)
  })

  it('refines chords more on tight curves', () => {
    const small = contours.find((contour) => contour.level === 19)!
    const perimeter = (contour: typeof small) => contour.points.length / 2 / contour.lengthKm
    // Punten per km: de krappe ring (r = 2) is dichter bemonsterd dan de ruime (r = 10).
    expect(perimeter(small)).toBeGreaterThan(perimeter(contours.find((contour) => contour.level === 15)!))
  })
})

describe('ring fade (lusjes-criterium)', () => {
  it('fades closed rings continuously by length and never open lines', () => {
    expect(ringFade({ closed: true, lengthKm: 20 }, 60)).toBe(0)
    expect(ringFade({ closed: true, lengthKm: 45 }, 60)).toBeCloseTo(0.5, 5)
    expect(ringFade({ closed: true, lengthKm: 60 }, 60)).toBe(1)
    expect(ringFade({ closed: false, lengthKm: 5 }, 60)).toBe(1)
    expect(ringFade({ closed: true, lengthKm: 5 }, 0)).toBe(1)
  })

  it('drops fully faded rings from the segment buffer and counts them', () => {
    const contours = traceContours(cone(), grid, { step: 1, toleranceCells: 0.1 })
    const all = buildSegments(contours, { ringKm: 0 })
    // r = 2(20 − L) cellen: niveaus 16–19 (omtrek < 30 km) vallen weg bij L_min 60 km.
    const filtered = buildSegments(contours, { ringKm: 60 })
    expect(filtered.stats.rings).toBe(all.stats.rings)
    expect(filtered.stats.fadedRings).toBe(contours.filter((contour) => contour.closed && contour.lengthKm < 45).length)
    expect(filtered.stats.fadedRings).toBeGreaterThan(0)
    expect(filtered.stats.segments).toBeLessThan(all.stats.segments)
    expect(filtered.data.length % SEGMENT_FLOATS).toBe(0)
  })

  it('rasterizes the fade of short rings for the fill: full ring fade on and inside the ring, 1 away from it', () => {
    const contours = traceContours(cone(), grid, { step: 1, toleranceCells: 0.1 })
    const rings = shortRings(contours, 60)
    const raster = ringFadeRaster(rings, grid.width, grid.height)!
    const at = (column: number, row: number) => ({ level: raster[(row * grid.width + column) * 2]!, fade: raster[(row * grid.width + column) * 2 + 1]! })
    const top = rings.reduce((best, ring) => ring.level > best.level ? ring : best)
    // Midden van de kegel: binnen de kleinste (hoogste) ring.
    const center = at(Math.round((top.bounds[0] + top.bounds[2]) / 2), Math.round((top.bounds[1] + top.bounds[3]) / 2))
    expect(center.fade).toBeLessThan(1)
    expect(at(0, 0)).toEqual({ level: NO_RING_LEVEL, fade: 1 })
    expect(ringFadeRaster(rings.filter((ring) => ring.fade >= 1), grid.width, grid.height)).toBeUndefined()
  })
})

describe('trace core (worker body)', () => {
  it('slices the hour fields in time like the shader before tracing', () => {
    const core = new TraceCore(grid, 3)
    core.setLayer(0, cone(0))
    core.setLayer(1, cone(2))
    // De B-spline in de tijd raakt op t = 0,5 ook uurlaag 2.
    expect(core.trace({ time: 0.5, window: 1, step: 1, toleranceCells: 0.1, ringKm: 0 })).toBeUndefined()
    // Lineair halverwege 0 en 1 is de kegel 1 °C hoger: de top (21 °C) heeft een ring voor niveau 20 met r = 2.
    const result = core.trace({ time: 0.5, window: 0, step: 1, toleranceCells: 0.02, ringKm: 0 })!
    let top = Infinity
    for (let offset = 0; offset < result.data.length; offset += SEGMENT_FLOATS) top = Math.min(top, Math.hypot(result.data[offset]! - 30, result.data[offset + 1]! - 30))
    expect(top).toBeGreaterThan(1.5)
    expect(top).toBeLessThan(2.5)
  })
})

describe('short rings (label fade)', () => {
  // Niveau 17 op r = 6 + 2·offset cellen; omtrek 40 km ⇔ r = 40/2π.
  const offset = (40 / (2 * Math.PI) - 6) / 2
  const contours = traceContours(cone(offset), grid, { step: 1, toleranceCells: 0.1 })

  it('reports rings below L_min with their length fade, including fully faded ones', () => {
    const rings = shortRings(contours, 60, 0.1)
    const ring = rings.find((candidate) => candidate.level === 17)!
    expect(ring.fade).toBeCloseTo(smoothstep(30, 60, 40), 1)
    expect(rings.some((candidate) => candidate.fade === 0)).toBe(true)
    expect(rings.every((candidate) => contours.find((contour) => contour.level === candidate.level)!.lengthKm < 60)).toBe(true)
    expect(shortRings(contours, 0)).toEqual([])
  })

  it('finds the fade of the ring a point lies on, and 1 on long lines', () => {
    const rings = shortRings(contours, 60, 0.1)
    const r = 40 / (2 * Math.PI)
    expect(ringFadeAt(rings, 17, 30 + r * Math.cos(1), 30 + r * Math.sin(1))).toBeCloseTo(smoothstep(30, 60, 40), 1)
    // Zelfde plek, ander niveau; en het ringmidden ligt niet op de lijn.
    expect(ringFadeAt(rings, 16, 30 + r * Math.cos(1), 30 + r * Math.sin(1))).toBe(1)
    expect(ringFadeAt(rings, 17, 30, 30)).toBe(1)
    // Niveau 10 (r ≈ 20 cellen, 126 km) is lang genoeg: geen korte ring.
    expect(ringFadeAt(rings, 10, 30 + 2 * (10 + offset), 30)).toBe(1)
  })
})
