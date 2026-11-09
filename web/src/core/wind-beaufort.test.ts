import { describe, expect, it } from 'vitest'
import type { Grid, MrfHeader } from './contract'
import { BEAUFORT_LOWER_MS, beaufortFrame, beaufortNumber, beaufortPalette, beaufortScale, windVanes } from './wind-beaufort'

describe('beaufort', () => {
  it('legt elke klassegrens precies op een geheel getal', () => {
    BEAUFORT_LOWER_MS.forEach((lower, index) => {
      expect(beaufortScale(lower)).toBeCloseTo(index + 1, 9)
      expect(beaufortNumber(lower)).toBe(index + 1)
      expect(beaufortNumber(lower - 0.01)).toBe(index)
    })
    expect(beaufortScale(0)).toBe(0)
    expect(beaufortScale(6.75)).toBeCloseTo(4.5, 9)
  })

  it('kleurt band k in de kleur van klasse k', () => {
    const palette = beaufortPalette()
    expect(palette).toHaveLength(13)
    palette.forEach(([value], force) => expect(value).toBe(force + 0.5))
  })

  it('kwantiseert het Bft-veld uit u en v, met no-data door', () => {
    const quant = Array.from({ length: 256 }, (_, code) => code === 255 ? null : code - 100)
    const header = { quant } as unknown as MrfHeader
    const frame = beaufortFrame(Uint8Array.of(100 + 6, 255), Uint8Array.of(100 + 8, 100), header, header)
    expect(frame.quant[frame.data[0]!]).toBeCloseTo(beaufortScale(10), 1)
    expect(frame.quant[frame.data[1]!]).toBeNull()
  })
})

describe('windVanes', () => {
  const grid = { crs: 'EPSG:3857', x0: 0, y0: 7_000_000, dx: 100_000, dy: -100_000, width: 10, height: 10 } as Grid
  it('wijst waar de wind heen waait en mengt de twee uren', () => {
    const left = new Float32Array(200), right = new Float32Array(200)
    left.fill(0); right.fill(0)
    // Cel van 4,5° O 52,1° N (y ≈ 6,82 Mm): rij 1, kolom 5.
    const cell = 1 * 10 + 5
    left[cell * 2] = -8 // naar het westen
    right[cell * 2 + 1] = 8 // naar het noorden
    const [vane] = windVanes(left, right, grid, 0.5, [{ name: 'Proef', lng: 4.5, lat: 52.1 }])
    expect(vane!.towardDegrees).toBeCloseTo(315, 6)
    expect(vane!.force).toBe(beaufortNumber(Math.hypot(4, 4)))
  })
})
