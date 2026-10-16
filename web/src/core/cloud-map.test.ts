import { describe, expect, it } from 'vitest'
import type { Grid, MrfHeader } from './contract'
import type { FieldBlend } from './sun'
import { cloudDriftAt, cloudDriftPath, cloudMotionMean, cloudFlowPhase, prepareCloudMapField } from './cloud-map'

const grid: Grid = { crs: 'EPSG:3857', width: 1, height: 1, x0: 560000, y0: 6820000, dx: 16000, dy: -16000 }
const field = { values: new Float32Array([100]), valid: new Float32Array([1]) }
function constant(value: number): FieldBlend {
  const header = { grid, quant: [value] } as MrfHeader
  return { left: new Uint8Array([0]), right: new Uint8Array([0]), leftHeader: header, rightHeader: header, mix: 0 }
}

describe('cloud map light and structure', () => {
  it('gives closed high cloud a different character and lighter ground than closed low cloud', () => {
    const epoch = Date.parse('2026-10-12T12:00:00Z')
    const high = prepareCloudMapField(grid, field, epoch, { low: constant(0), mid: constant(0), high: constant(100) })
    const low = prepareCloudMapField(grid, field, epoch, { low: constant(100), mid: constant(0), high: constant(0) })
    expect(high.values[0]).toBe(low.values[0])
    expect(high.cloudHints![0]).toBeGreaterThan(low.cloudHints![0]!)
    expect(high.cloudHints![1]).toBeLessThan(low.cloudHints![1]!)
  })

  it('uses the layers at night instead of reading zero radiation as an opaque cloud', () => {
    const epoch = Date.parse('2026-10-12T01:00:00Z')
    const layers = { low: constant(0), mid: constant(0), high: constant(100) }
    const withNightRadiation = prepareCloudMapField(grid, field, epoch, { ...layers, radiation: constant(0), radiationNext: constant(0) })
    const withoutRadiation = prepareCloudMapField(grid, field, epoch, layers)
    expect(withNightRadiation.cloudHints).toEqual(withoutRadiation.cloudHints)
    expect(withNightRadiation.cloudHints![1]).toBeLessThan(0.5)
  })

  it('keeps the no-data mask when other weather fields are available', () => {
    const missing = { values: new Float32Array([0]), valid: new Float32Array([0]) }
    const result = prepareCloudMapField(grid, missing, Date.parse('2026-10-12T12:00:00Z'), { high: constant(100) })
    expect(result.valid[0]).toBe(0)
  })

  it('falls back to total cover when a missing layer prevents a complete light estimate', () => {
    const partial = prepareCloudMapField(grid, field, Date.parse('2026-10-12T01:00:00Z'), { mid: constant(0), high: constant(0) })
    expect(partial.cloudHints![1]).toBeGreaterThan(0.5)
  })

  it('uses signed rain-annex vectors with their byte offset and projected cell units', () => {
    const storage = new Int8Array([99, 99, -20, 30, 99, 99])
    const motion = { grid: { ...grid, width: 16, height: 16, dx: 1000, dy: -1000 },
      field: { width: 1, height: 1, vectors: new Uint8Array(storage.buffer, 2, 2) } }
    const result = prepareCloudMapField(grid, field, 0, { motion })
    expect([...result.cloudFlow!]).toEqual([-7.5, 11.25])
  })

  it('bilinearly samples the same normalized motion grid as the rain shader', () => {
    const motion = { grid, field: { width: 2, height: 2, vectors: new Uint8Array([0, 0, 10, 20, 20, 40, 30, 60]) } }
    const result = prepareCloudMapField(grid, field, 0, { motion })
    expect([...result.cloudFlow!]).toEqual([90, 180])
  })

  it('does not turn an invalid annex component or a missing annex into ground wind', () => {
    const motion = { grid, field: { width: 1, height: 1, vectors: new Uint8Array([20, 128]) } }
    expect([...prepareCloudMapField(grid, field, 0, { motion }).cloudFlow!]).toEqual([0, 0])
    expect([...prepareCloudMapField(grid, field, 0, {}).cloudFlow!]).toEqual([0, 0])
  })

  it('does not extrapolate motion beyond the rain footprint', () => {
    const motion = { grid: { ...grid, x0: grid.x0 + 100000 }, field: { width: 1, height: 1, vectors: new Uint8Array([20, 30]) } }
    expect([...prepareCloudMapField(grid, field, 0, { motion }).cloudFlow!]).toEqual([0, 0])
  })

  it('anchors the detail lifetime to model time and repeats independently of visit order', () => {
    const time = Date.parse('2026-10-12T17:56:00Z')
    const first = cloudFlowPhase(time)
    cloudFlowPhase(time + 90 * 60_000)
    expect(cloudFlowPhase(time)).toBe(first)
    expect(cloudFlowPhase(time + 4 * 3_600_000)).toBe(first)
  })
})


describe('cloud birth trajectory', () => {
  it('integrates changing bulk motion continuously across hours and midnight', () => {
    const epoch = Date.parse('2026-10-16T23:00:00+02:00')
    const path = cloudDriftPath([
      { epoch, velocity: [10000, -20000] },
      { epoch: epoch + 3600000, velocity: [30000, -20000] },
      { epoch: epoch + 7200000, velocity: [10000, -20000] },
    ])
    expect(cloudDriftAt(path, epoch + 1800000)).toEqual([7500, -10000])
    expect(cloudDriftAt(path, epoch + 3600000)).toEqual([20000, -20000])
    expect(cloudDriftAt(path, epoch + 7200000)).toEqual([40000, -40000])
    expect(cloudDriftAt(path, epoch + 3600000 - 1)[0]).toBeCloseTo(20000, 1)
    expect(cloudDriftAt(path, epoch + 3600000 + 1)[0]).toBeCloseTo(20000, 1)
  })

  it('never rewinds either bank under uniform translation when its lifetime renews', () => {
    const epoch = Date.parse('2026-10-16T23:00:00+02:00'), speed = 20000
    const path = cloudDriftPath([{ epoch, velocity: [speed, 0] }])
    for (let minute = 0; minute <= 120; minute++) {
      const now = epoch + minute * 60000, phase = cloudFlowPhase(now)
      for (const age of [phase, (phase + 0.25) % 0.5]) {
        const anchor = cloudDriftAt(path, now - age * 3600000)[0]
        expect(-speed * age - anchor).toBeCloseTo(-speed * minute / 60, 5)
      }
    }
    expect(cloudDriftAt(path, epoch)).toEqual([0, 0])
  })

  it('keeps its origin when a refreshed timeline drops old history', () => {
    const original = cloudDriftPath([{ epoch: 0, velocity: [10000, 0] }, { epoch: 7200000, velocity: [10000, 0] }])
    const refreshed = cloudDriftPath([{ epoch: 3600000, velocity: [10000, 0] }, { epoch: 10800000, velocity: [10000, 0] }], original)
    expect(cloudDriftAt(refreshed, 5400000)).toEqual(cloudDriftAt(original, 5400000))
  })

  it('averages only valid projected motion pairs and respects the byte offset', () => {
    const data = new Int8Array([99, 99, 10, -20, -128, 40, 30, -40, 99, 99])
    expect(cloudMotionMean({grid: {...grid, dx: 1000, dy: -1000}, field: {
      width: 3, height: 1, vectors: new Uint8Array(data.buffer, 2, 6),
    }})).toEqual([120000, 180000])
    expect(cloudMotionMean(undefined)).toEqual([0, 0])
  })
})
