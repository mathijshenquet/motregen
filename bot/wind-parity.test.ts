import { expect, it } from 'vitest'
import { phaseMask, unmaskedRgb, windMetrics } from './wind-parity.js'

it('measures density and length independently of the positions of wind streaks', () => {
  const size = { width: 100, height: 100 }
  const draw = (positions: number[], length: number) => {
    const alpha = new Uint8Array(size.width * size.height)
    for (const top of positions) for (let y = top; y < top + 3; y++) for (let x = 10; x < 10 + length; x++) alpha[y * size.width + x] = 128
    return windMetrics(alpha, size.width, size.height, 1)
  }
  const first = draw([10, 30], 20)
  expect(first).toEqual(draw([20, 50], 20))
  expect(first.components).toBe(2)
  expect(first.meanLength).toBe(20)
  expect(first.meanWidth).toBe(3)
  expect(draw([10, 30, 50, 70], 20).components).toBe(4)
  expect(draw([10, 30], 10).meanLength).toBe(10)
})

it('excludes only the two wind footprints with one pixel of edge coverage', () => {
  const first = Uint8Array.of(255, 0, 0, 0, 0, 0, 0, 0, 0)
  const second = Uint8Array.of(0, 0, 0, 0, 0, 0, 0, 0, 255)
  const mask = phaseMask(first, second, 3, 3)
  expect([...mask]).toEqual([1, 1, 0, 1, 1, 1, 0, 1, 1])
  const rgb = Buffer.from(Array.from({ length: 27 }, (_, index) => index))
  expect([...unmaskedRgb(rgb, mask)]).toEqual([6, 7, 8, 18, 19, 20])
  expect(() => phaseMask(first, second, 4, 4)).toThrow('maten')
})
