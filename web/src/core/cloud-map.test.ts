import { describe, expect, it } from 'vitest'
import type { Grid, MrfHeader } from './contract'
import type { FieldBlend } from './sun'
import { prepareCloudMapField } from './cloud-map'

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
})
