import { describe, expect, it } from 'vitest'
import type { Field, MrfHeader } from './contract'
import { sunnyLocations, sunAnchors, type FieldBlend } from './sun'

function field(value: number, type: Extract<Field, 'radiation' | 'uv'>): FieldBlend {
  const quant = new Array<number | null>(255).fill(value)
  quant.push(null)
  const header = {
    version: 0,
    field: type,
    grid: { crs: 'EPSG:3857', x0: 300_000, y0: 7_200_000, dx: 20_000, dy: -20_000, width: 30, height: 40 },
    quant,
    source: type === 'uv' ? 'uv' : 'harmonie',
    run: '2026-08-28T12:00:00Z',
    frames: [],
    dict: null,
  } satisfies MrfHeader
  const frame = new Uint8Array(header.grid.width * header.grid.height)
  return { left: frame, right: frame, leftHeader: header, rightHeader: header, mix: 0 }
}

describe('sun map anchors', () => {
  const noon = Date.parse('2026-08-28T12:00:00Z')

  it('shows only the sparse anchor set in genuinely sunny daytime conditions', () => {
    expect(sunnyLocations(noon, field(700, 'radiation')).features).toHaveLength(sunAnchors.length)
  })

  it('gates icons for dense cloud and nighttime', () => {
    expect(sunnyLocations(noon, field(25, 'radiation'), field(0.4, 'uv')).features).toHaveLength(0)
    expect(sunnyLocations(Date.parse('2026-08-28T23:00:00Z'), field(700, 'radiation'), field(6, 'uv')).features).toHaveLength(0)
  })

  it('can fall back to official UV when radiation is unavailable', () => {
    expect(sunnyLocations(noon, undefined, field(5, 'uv')).features).toHaveLength(sunAnchors.length)
  })
})
