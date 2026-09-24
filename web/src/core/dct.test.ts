import { describe, expect, it } from 'vitest'
import { dctFrameLength, dctFrameToBitmap, encodeDctFrame, inverseDct, quantizeField } from './dct'

// Zelfde veld en bytes als `golden_frame_is_stable` in crates/mrf/src/dct.rs: encoder-pariteit Rust ↔ TS.
const GOLDEN_HEX = 'cdcc4c3e010000000000000080000000000000618102f2ff4202fffdfd01fffcfdff06fdfe0105fefe00050302ff00ffff0000ffffff00ffffffff00ffff0000ffff000000'

function goldenField(): number[] {
  return Array.from({ length: 120 }, (_, index) => {
    if (index === 7 || index === 64) return Number.NaN
    const x = index % 12, y = Math.floor(index / 12)
    return Math.fround(9 + Math.fround(0.7 * x) - Math.fround(0.4 * y) + Math.fround(Math.sin(Math.fround(x * y * 0.3))))
  })
}

const hex = (bytes: Uint8Array) => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')
const temperatureTable = [...Array.from({ length: 255 }, (_, index) => -31.2 + index * 0.3), null]

describe('DCT-frames', () => {
  it('codeert byte-gelijk aan de Rust-ingest', () => {
    expect(hex(encodeDctFrame(goldenField(), 12, 10, 5))).toBe(GOLDEN_HEX)
  })

  it('reconstrueert een glad veld en houdt het masker', () => {
    const width = 209, height = 225
    const field = Array.from({ length: width * height }, (_, index) => {
      const x = index % width, y = Math.floor(index / width)
      return x < 6 ? Number.NaN : 12 + 6 * Math.sin(x / width * 3) - 4 * Math.cos(y / height * 2)
    })
    const bytes = encodeDctFrame(field, width, height, 64)
    expect(bytes.length).toBe(dctFrameLength(width, height, 64))
    const back = inverseDct(bytes, width, height, 64)
    let worst = 0
    for (let index = 0; index < field.length; index++) {
      expect(Number.isNaN(back[index]!)).toBe(Number.isNaN(field[index]!))
      if (!Number.isNaN(field[index]!)) worst = Math.max(worst, Math.abs(back[index]! - field[index]!))
    }
    expect(worst).toBeLessThan(0.3)
  })

  it('kwantiseert terug zoals de ingest: 255 = no-data, satureren, middenpunt naar beneden', () => {
    expect([...quantizeField(Float32Array.of(Number.NaN, -99, 99, -31.1, -31), temperatureTable)]).toEqual([255, 0, 254, 0, 1])
    const integers = [...Array.from({ length: 255 }, (_, index) => index), null]
    expect([...quantizeField(Float32Array.of(0.5, 1.5, 1.51, 253.5), integers)]).toEqual([0, 1, 2, 253])
  })

  it('levert een bitmapframe van exact het grid', () => {
    const bitmap = dctFrameToBitmap(encodeDctFrame(goldenField(), 12, 10, 5), { width: 12, height: 10, k: 5, quant: temperatureTable })
    expect(bitmap.length).toBe(120)
    expect(bitmap[7]).toBe(255)
    expect(bitmap[64]).toBe(255)
    expect(bitmap[0]).toBeGreaterThan(0)
  })

  it('weigert een frame met de verkeerde lengte', () => {
    expect(() => inverseDct(new Uint8Array(3), 12, 10, 5)).toThrow()
  })
})
