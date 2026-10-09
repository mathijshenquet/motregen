import { expect, it } from 'vitest'
import { sampleWind } from './native-wind.js'
import type { RainFrame } from './native-rain.js'
import type { MrfHeader } from '../web/src/core/contract.js'

it('interpolates signed physical wind components and preserves no-data at contributing corners', () => {
  const header = { grid: { width: 2, height: 2 }, quant: [-10, 10, null] } as unknown as MrfHeader
  const frame = { grid: header.grid, leftHeader: header, rightHeader: header, left: Uint8Array.of(0, 1, 0, 1), right: Uint8Array.of(1, 1, 1, 1), mix: 0.5 } as RainFrame
  expect(sampleWind(frame, 0.5, 0.5)).toBe(5)
  expect(sampleWind(frame, -1, 0)).toBeUndefined()
  expect(sampleWind({ ...frame, left: Uint8Array.of(0, 2, 0, 1) }, 0, 0)).toBe(0)
  expect(sampleWind({ ...frame, left: Uint8Array.of(0, 2, 0, 1) }, 0.5, 0)).toBeUndefined()
})
