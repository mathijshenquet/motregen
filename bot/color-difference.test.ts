import { expect, it } from 'vitest'
import { colorDifference } from './color-difference.js'

it('measures ΔE76 for identical colours and the full black-to-white lightness range', () => {
  expect(colorDifference(new Uint8Array([0, 0, 0]), new Uint8Array([0, 0, 0]))).toEqual({ mean: 0, maximum: 0, pixels: 1 })
  expect(colorDifference(new Uint8Array([0, 0, 0]), new Uint8Array([255, 255, 255])).mean).toBeCloseTo(100, 4)
  expect(() => colorDifference(new Uint8Array(3), new Uint8Array(4))).toThrow('RGB-maten')
})
