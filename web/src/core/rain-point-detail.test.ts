import { describe, expect, it } from 'vitest'
import type { MrfHeader } from './contract.js'
import { rainBetween, rainPatch } from './rain-point-detail.js'

const width = 40
const height = 20
const quant = Array.from({ length: 256 }, (_, byte) => byte === 255 ? null : byte / 10)
const header = { grid: { x0: 0, y0: 0, dx: 1, dy: 1, width, height }, quant } as unknown as MrfHeader

function frameWithBlob(column: number, byte = 100): Uint8Array {
  const frame = new Uint8Array(width * height)
  for (let row = 8; row <= 12; row++) for (let offset = -2; offset <= 2; offset++) frame[row * width + column + offset] = byte
  return frame
}

function motionField(cellsPerMinute: number) {
  const vectors = new Uint8Array(4 * 4 * 2)
  for (let index = 0; index < 16; index++) vectors[index * 2] = Math.round(cellsPerMinute * 10)
  return { width: 4, height: 4, vectors }
}

describe('rainBetween', () => {
  const point = { x: 15.5, y: 10.5 }

  it('follows a shower that crosses the place between two frames, as the map warp does', () => {
    const left = rainPatch(header, frameWithBlob(10), point.x, point.y)
    const right = rainPatch(header, frameWithBlob(20), point.x, point.y)
    const motion = motionField(1)
    expect(rainBetween(left, right, motion, 10, 0)).toBe(0)
    expect(rainBetween(left, right, motion, 10, 0.5)).toBeCloseTo(10)
    expect(rainBetween(left, right, motion, 10, 1)).toBe(0)
    // Zonder beweging valt de bui ertussenuit: alleen overvloeien.
    expect(rainBetween(left, right, undefined, 10, 0.5)).toBe(0)
  })

  it('crossfades in bytes without motion and treats missing data as dry', () => {
    const left = rainPatch(header, frameWithBlob(15, 100), point.x, point.y)
    const right = rainPatch(header, frameWithBlob(15, 200), point.x, point.y)
    expect(rainBetween(left, right, undefined, 60, 0.25)).toBeCloseTo(12.5)
    const missing = frameWithBlob(15, 255)
    expect(rainBetween(left, rainPatch(header, missing, point.x, point.y), undefined, 60, 0.5)).toBeCloseTo(5)
  })

  it('keeps the warp within the map cap for fast motion', () => {
    const left = rainPatch(header, frameWithBlob(15), point.x, point.y)
    const right = rainPatch(header, frameWithBlob(15), point.x, point.y)
    // 40 cellen in een interval: voorbij de vervaging alleen overvloeien, net als de kaart.
    expect(rainBetween(left, right, motionField(4), 10, 0.5)).toBeCloseTo(10)
  })
})
