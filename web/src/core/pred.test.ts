import { describe, expect, it } from 'vitest'
import { decodePredFrame, encodePredFrame } from './pred'

// Zelfde cellen en bytes als `golden_frame_is_stable` in crates/mrf/src/pred.rs: encoder-pariteit Rust ↔ TS.
const GOLDEN_HEX = '01000000000000008000000000000000d46b80d2e882a2450dffd6566c714d06e98d2dc07dd5666ef86abc75decc9f091f6d76be138bb80b'

function goldenCells(): Uint8Array {
  return Uint8Array.from({ length: 120 }, (_, index) =>
    index === 7 || index === 64 ? 255 : index === 33 ? 0 : 100 + index % 12 * 3 + Math.floor(index / 12) * 2 + index * 7 % 5)
}

const hex = (bytes: Uint8Array) => [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('')

function noisyField(width: number, height: number, seed: number): Uint8Array {
  let state = seed
  return Uint8Array.from({ length: width * height }, (_, index) => {
    state = (Math.imul(state, 1103515245) + 12345) >>> 0
    const x = index % width, y = Math.floor(index / width)
    if (y < 3 && x > width / 2) return 255
    return Math.min(254, Math.trunc(140 + 30 * Math.sin(x / 17) - 20 * Math.cos(y / 23)) + (state >>> 16) % 5)
  })
}

describe('predictieve frames', () => {
  it('codeert byte-gelijk aan de Rust-ingest en decodeert dat terug', () => {
    const bytes = encodePredFrame(goldenCells(), 12)
    expect(hex(bytes)).toBe(GOLDEN_HEX)
    expect(decodePredFrame(bytes, { width: 12, height: 10 })).toEqual(goldenCells())
  })

  it('is verliesvrij op een ruizig veld met no-data, extremen en randvormen', () => {
    const cases: Array<[Uint8Array, number, number]> = [
      [noisyField(209, 225, 7), 209, 225],
      [Uint8Array.from({ length: 400 }, (_, index) => (index + Math.floor(index / 20)) % 2 ? 254 : 0), 20, 20],
      [new Uint8Array(77).fill(255), 11, 7],
      [Uint8Array.of(254), 1, 1],
      [Uint8Array.of(0, 254, 255, 3, 250), 5, 1],
      [Uint8Array.of(0, 254, 255, 3, 250), 1, 5],
    ]
    for (const [cells, width, height] of cases) {
      expect(decodePredFrame(encodePredFrame(cells, width), { width, height })).toEqual(cells)
    }
    expect(encodePredFrame(cases[0]![0], 209).length).toBeLessThan(209 * 225 / 2)
  })

  it('weigert te korte en te lange streams', () => {
    const bytes = encodePredFrame(noisyField(40, 30, 3), 40)
    expect(() => decodePredFrame(bytes.subarray(0, bytes.length - 1), { width: 40, height: 30 })).toThrow()
    expect(() => decodePredFrame(Uint8Array.from([...bytes, 0]), { width: 40, height: 30 })).toThrow()
  })
})
