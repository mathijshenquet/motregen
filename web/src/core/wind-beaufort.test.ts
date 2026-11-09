import { describe, expect, it } from 'vitest'
import type { MrfHeader } from './contract'
import { BEAUFORT_LOWER_MS, beaufortFrame, beaufortNumber, beaufortPalette, beaufortScale } from './wind-beaufort'

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
