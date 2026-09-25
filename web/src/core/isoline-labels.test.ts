// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import type { Grid } from './contract'
import { shortRings, traceContours } from './isoline-contours'
import { IsolineLabels } from './isoline-labels'
import { smoothstep } from './isoline-spline'
import type { IsolineFeatureCollection } from './isolines'

vi.mock('maplibre-gl', () => ({
  Marker: class {
    private readonly element: HTMLElement
    constructor({ element }: { element: HTMLElement }) { this.element = element }
    getElement() { return this.element }
    setLngLat() { return this }
    setRotation() { return this }
    addTo() { document.body.append(this.element); return this }
    remove() { this.element.remove() }
  },
}))

const EARTH_RADIUS = 6378137
const grid = { crs: 'EPSG:3857', x0: 0, y0: 0, dx: 1000, dy: -1000, width: 60, height: 60 } as Grid
const toLngLat = (column: number, row: number): [number, number] => {
  const x = (column + 0.5) * grid.dx, y = (row + 0.5) * grid.dy
  return [x / EARTH_RADIUS * 180 / Math.PI, (2 * Math.atan(Math.exp(y / EARTH_RADIUS)) - Math.PI / 2) * 180 / Math.PI]
}
const [west, north] = toLngLat(-0.5, -0.5), [east, south] = toLngLat(59.5, 59.5)
const map = {
  getZoom: () => 10,
  getBounds: () => ({ getWest: () => west, getEast: () => east, getNorth: () => north, getSouth: () => south }),
} as unknown as MapLibreMap

/** Kegel rond (30, 30) met niveau 17 op een ring van `km` km omtrek (zie de contourtests). */
function slice(km: number, base = 0) {
  const offset = base + (km / (2 * Math.PI) - 6) / 2
  const values = new Float32Array(grid.width * grid.height)
  for (let row = 0; row < grid.height; row++) for (let column = 0; column < grid.width; column++) values[row * grid.width + column] = 20 + offset - Math.hypot(column - 30, row - 30) / 2
  const field = { values, valid: new Float32Array(values.length).fill(1) }
  return { slice: { width: grid.width, height: grid.height, fields: [field], weights: [1] }, rings: shortRings(traceContours(field, grid, { step: 1, toleranceCells: 0.1 }), 60, 0.1) }
}

function ringLines(km: number, level = 17): IsolineFeatureCollection {
  const r = km / (2 * Math.PI)
  const coordinates = Array.from({ length: 65 }, (_, index) => toLngLat(30 + r * Math.cos(index / 64 * 2 * Math.PI), 30 + r * Math.sin(index / 64 * 2 * Math.PI)))
  return { type: 'FeatureCollection', features: [{ type: 'Feature', geometry: { type: 'LineString', coordinates }, properties: { level, label: String(level) } }] }
}

describe('isoline labels follow the length fade of their ring', () => {
  it('fades a label on a shrinking ring and despawns it below ½·L_min', () => {
    vi.useFakeTimers()
    const labels = new IsolineLabels(map, grid, 'light', () => true)
    labels.setOpacity(1)
    // Gespawnd op een ring boven L_min (het spawnfilter), daarna krimpt de ring.
    labels.setLines(ringLines(70), 1)
    const big = slice(70)
    labels.update(big.slice, big.rings, 0)
    expect(labels.count).toBeGreaterThan(0)
    // Eerst de despawn-timers: gestorven ankers houden tot hun verwijdering hun laatste dekking.
    const opacities = () => { vi.runOnlyPendingTimers(); return [...document.querySelectorAll<HTMLElement>('.isoline-label')].map((element) => Number(element.style.opacity)) }
    expect(opacities().every((opacity) => opacity === 1)).toBe(true)

    // Continu krimpen zoals tijdens de tween: het anker glijdt mee (hooguit 2 cellen per snede).
    const shrink = (from: number, to: number) => {
      for (let km = from; km >= to; km -= 1) {
        const step = slice(km)
        labels.update(step.slice, step.rings, 70 - km)
      }
    }
    shrink(69, 40)
    expect(labels.count).toBeGreaterThan(0)
    // De koordelengte van de trace ligt iets onder de echte omtrek.
    for (const opacity of opacities()) expect(opacity).toBeCloseTo(smoothstep(30, 60, 40), 1)

    shrink(39, 28)
    expect(labels.count).toBe(0)
    vi.runAllTimers()
    vi.useRealTimers()
  })
})

describe('isobar labels', () => {
  it('carry the pressure without a unit, in the isobar colour', () => {
    const labels = new IsolineLabels(map, grid, 'light', () => true, 'pressure')
    labels.setOpacity(1)
    // Niveau 1012 = de kegel van `slice` 995 hPa hoger.
    labels.setLines(ringLines(70, 1_012), 4)
    const ring = slice(70, 995)
    labels.update(ring.slice, ring.rings, 0)
    const elements = [...document.querySelectorAll<HTMLElement>('.isobar-label')]
    expect(elements.length).toBeGreaterThan(0)
    expect(elements.every((element) => element.textContent === '1012')).toBe(true)
    expect(elements[0]!.style.color).toBe('rgb(30, 45, 51)')
    labels.clear()
  })
})
