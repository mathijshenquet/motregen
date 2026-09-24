import { describe, expect, it } from 'vitest'
import type { Grid } from './contract'
import { WindLayer } from './wind-layer'

// Kaartbewegingen (U12) zonder WebGL: een nepkaart met Mercator-bounds en de private
// simulatie van de laag. Raster 1000×1000 km boven ~50° N, overal 5 m/s westenwind.
const R = 6_378_137
const grid: Grid = { crs: 'EPSG:3857', x0: 0, y0: 7_000_000, dx: 1_000, dy: -1_000, width: 1_000, height: 1_000 }
const frame = 1 / 60

interface View { x: number; y: number; zoom: number; width: number; height: number }

interface Internals {
  map: unknown
  active: number
  budget: number
  retiring: number
  x: Float32Array
  y: Float32Array
  ages: Float32Array
  instanceBytes: Uint8Array
  rampRates: Float32Array
  particleBounds: { west: number; east: number; north: number; south: number }
  resetViewport(resetAll?: boolean): void
  advance(seconds: number, worldPx: number): void
  balance(): void
}

function harness(width = 1_280, height = 720, speed = 5) {
  // Midden van het raster als wereldfractie.
  const view: View = { x: 0.5 + 500_000 / (2 * Math.PI * R), y: 0.5 - 6_500_000 / (2 * Math.PI * R), zoom: 8, width, height }
  const lng = (fraction: number) => fraction * 360 - 180
  const lat = (fraction: number) => Math.atan(Math.sinh(Math.PI * (1 - 2 * fraction))) * 180 / Math.PI
  const map = {
    getZoom: () => view.zoom,
    getCanvas: () => ({ clientWidth: view.width, clientHeight: view.height, width: view.width, height: view.height }),
    getCenter: () => ({ lng: lng(view.x), lat: lat(view.y) }),
    getBounds: () => {
      const world = 512 * 2 ** view.zoom
      return {
        getWest: () => lng(view.x - view.width / 2 / world),
        getEast: () => lng(view.x + view.width / 2 / world),
        getNorth: () => lat(view.y - view.height / 2 / world),
        getSouth: () => lat(view.y + view.height / 2 / world),
      }
    },
  }
  const layer = new WindLayer(grid, 'dark')
  const field = new Float32Array(grid.width * grid.height * 2)
  for (let index = 0; index < field.length; index += 2) field[index] = speed
  layer.setFrames(field, field, 0)
  const wind = layer as unknown as Internals
  wind.map = map
  wind.resetViewport(true)
  const run = (seconds: number) => {
    for (let time = 0; time < seconds; time += frame) wind.advance(frame, 512 * 2 ** view.zoom)
  }
  const visible = () => {
    let count = 0
    for (let index = 0; index < wind.active; index++) if (wind.ages[index]! > 0 && wind.instanceBytes[index * 20 + 19]! > 0) count++
    return count
  }
  const move = (change: Partial<View>) => {
    Object.assign(view, change)
    wind.resetViewport()
  }
  return { view, wind, run, visible, move }
}

describe('wind across map movement (U12)', () => {
  it('keeps particles that stay in view untouched and refills the rest without a staggered delay on zoom-in', () => {
    const { wind, run, visible, move, view } = harness()
    run(10)
    const before = visible()
    const positions = Array.from({ length: wind.active }, (_, index) => [wind.x[index]!, wind.y[index]!, wind.ages[index]!] as const)
    move({ zoom: view.zoom + 1 })
    const bounds = wind.particleBounds
    let kept = 0
    for (const [index, [x, y, age]] of positions.entries()) {
      if (x < bounds.west || x > bounds.east || y < bounds.north || y > bounds.south) continue
      expect([wind.x[index], wind.y[index], wind.ages[index]]).toEqual([x, y, age])
      kept++
    }
    expect(kept).toBeGreaterThan(0.15 * before)
    for (let index = 0; index < wind.active; index++) expect(wind.ages[index]).toBeGreaterThan(0)
    expect(wind.active - wind.retiring).toBe(wind.budget)
    run(0.3)
    expect(visible()).toBeGreaterThan(0.85 * before)
  })

  it('fades the surplus out of the old view and fills the new rim straight away on zoom-out', () => {
    const { wind, run, visible, move, view } = harness()
    run(10)
    const before = visible()
    const old = { ...wind.particleBounds }
    move({ zoom: view.zoom - 1 })
    expect(wind.retiring / wind.budget).toBeGreaterThan(0.6)
    expect(wind.active - wind.retiring).toBe(wind.budget)
    run(0.3)
    expect(visible()).toBeGreaterThan(0.85 * before)
    run(0.3)
    expect(wind.retiring).toBe(0)
    expect(wind.active).toBe(wind.budget)
    let rim = 0
    for (let index = 0; index < wind.active; index++) {
      const x = wind.x[index]!
      const y = wind.y[index]!
      if (x < old.west || x > old.east || y < old.north || y > old.south) rim++
    }
    // Driekwart van het nieuwe beeld is rand.
    expect(rim / wind.active).toBeGreaterThan(0.6)
  })

  it('refills a pan strip immediately and never lets a steady drag thin the field', () => {
    const { wind, run, visible, move, view } = harness()
    run(10)
    const before = visible()
    const world = 512 * 2 ** view.zoom
    for (let step = 0; step < 60; step++) {
      move({ x: view.x + 10 / world })
      run(frame)
      expect(wind.retiring).toBe(0)
    }
    expect(visible()).toBeGreaterThan(0.85 * before)
    move({ x: view.x + view.width / 2 / world })
    run(0.3)
    expect(visible()).toBeGreaterThan(0.85 * before)
  })

  it('keeps the field populated through a continuous pinch in both directions', () => {
    const { wind, run, visible, move, view } = harness()
    run(10)
    const before = visible()
    let lowest = Infinity
    for (const direction of [1, -1]) {
      for (let step = 0; step < 90; step++) {
        move({ zoom: view.zoom + direction / 60 })
        run(frame)
        if (step > 15) lowest = Math.min(lowest, visible())
      }
    }
    expect(lowest).toBeGreaterThan(0.8 * before)
    run(1)
    expect(wind.active).toBe(wind.budget)
  })

  it('shrinks the particle budget by fading out instead of cutting slots off', () => {
    const { wind, run } = harness()
    run(10)
    const previous = wind.active
    wind.budget = Math.floor(previous * 0.78)
    wind.balance()
    expect(wind.active).toBe(previous)
    expect(wind.retiring).toBe(previous - wind.budget)
    run(0.5)
    expect(wind.active).toBe(wind.budget)
    expect(wind.retiring).toBe(0)
  })

  it('follows a resize to the new screen-area target', () => {
    const { wind, run, move, view } = harness()
    run(10)
    const previous = wind.budget
    move({ width: view.width / 2 })
    expect(wind.budget).toBeLessThan(previous)
    run(0.5)
    expect(wind.active).toBe(wind.budget)
    move({ width: view.width * 2 })
    expect(wind.retiring).toBe(0)
    expect(wind.active - wind.retiring).toBe(previous)
  })

  it('does not let a zoom cohort die and respawn in one wave where maxAge rules (slow wind over land, U20)', () => {
    // 1 m/s ≈ 7,5 CSS-px/s: 90 px afstand duurt 12 s, dus maxAge (6 s) bepaalt de dood. Zonder
    // spreiding in leeftijd sterven alle aanvullers van één zoomstap in hetzelfde kwart seconde.
    const { wind, run, move, view } = harness(1_280, 720, 1)
    run(20)
    const waves = () => {
      const buckets = new Array<number>(40).fill(0)
      let previous = Float32Array.from(wind.ages.subarray(0, wind.active))
      for (let frameIndex = 0; frameIndex < 600; frameIndex++) {
        run(frame)
        for (let index = 0; index < Math.min(previous.length, wind.active); index++) if (wind.ages[index]! < previous[index]!) buckets[Math.floor(frameIndex / 15)]!++
        previous = Float32Array.from(wind.ages.subarray(0, wind.active))
      }
      const mean = buckets.reduce((sum, value) => sum + value, 0) / buckets.length
      return Math.max(...buckets) / mean
    }
    const rest = waves()
    expect(rest, 'rust').toBeLessThan(3)
    move({ zoom: view.zoom + 1 })
    const zoomed = waves()
    expect(zoomed, 'na inzoomen').toBeLessThan(3)
  })

  it('lets the fills of one zoom step appear spread out, not all in the same frame (U20)', () => {
    const { wind, run, move, view } = harness()
    run(10)
    move({ zoom: view.zoom + 1 })
    const fills: number[] = []
    for (let index = 0; index < wind.active; index++) if (wind.rampRates[index]! > 0) fills.push(index)
    expect(fills.length).toBeGreaterThan(wind.active / 2)
    const alpha = (index: number) => wind.instanceBytes[index * 20 + 19]!
    const shown = new Set<number>()
    let most = 0
    for (let frameIndex = 0; frameIndex < 30; frameIndex++) {
      run(frame)
      let appeared = 0
      for (const index of fills) if (!shown.has(index) && alpha(index) > 0) { shown.add(index); appeared++ }
      most = Math.max(most, appeared)
    }
    expect(shown.size).toBeGreaterThan(fills.length * 0.9)
    expect(most).toBeLessThan(fills.length * 0.4)
  })
})

