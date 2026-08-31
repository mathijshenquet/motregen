import { describe, expect, it } from 'vitest'
import { encodeCloudCoverage } from './cloud-edge-layer'

describe('cloud edge texture', () => {
  it('encodes coverage and keeps no-data transparent', () => {
    const quant = [0, 0.5, 1, ...new Array<number | null>(252).fill(0), null]
    expect([...encodeCloudCoverage(Uint8Array.from([0, 1, 2, 255]), quant)]).toEqual([
      0, 255, 128, 255, 255, 255, 0, 0,
    ])
  })
})
