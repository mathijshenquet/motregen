import { describe, expect, it } from 'vitest'
import { WARP_CAP_CELLS } from './rain-layer'
import { autoBlurSigma, blurSigma, rainSampling, rainWarpLimit } from './rain-smoothing'

const HOUR_MS = 3_600_000

describe('rain smoothing', () => {
  it('uses the coarse source grid only for HARMONIE', () => {
    for (const source of ['rtcor', 'nowcast', 'seamless'] as const) {
      expect(rainSampling(source, 0).sourceCellWidth).toBe(1.56)
    }
    expect(rainSampling('harmonie', 0).sourceCellWidth).toBe(3.25)
  })

  it('blurs by lead time, not by source: 5×5 up to two hours ahead, 9×9 from three hours', () => {
    expect(autoBlurSigma(-HOUR_MS)).toBe(blurSigma(5))
    expect(autoBlurSigma(2 * HOUR_MS)).toBe(blurSigma(5))
    expect(autoBlurSigma(2.5 * HOUR_MS)).toBeCloseTo((blurSigma(5) + blurSigma(9)) / 2)
    expect(autoBlurSigma(3 * HOUR_MS)).toBe(blurSigma(9))
    expect(autoBlurSigma(40 * HOUR_MS)).toBe(blurSigma(9))
    for (const source of ['nowcast', 'harmonie'] as const) {
      expect(rainSampling(source, HOUR_MS)).toMatchObject({ kernel: 'source-blur', blurSigma: blurSigma(5) })
    }
  })

  it('moves the rain along over a long step, also across the seam from the blend into HARMONIE', () => {
    expect(rainWarpLimit(60).capCells).toBeGreaterThan(WARP_CAP_CELLS)
    expect(rainWarpLimit(55).capCells).toBe(rainWarpLimit(60).capCells)
    expect(rainWarpLimit(5).capCells).toBe(WARP_CAP_CELLS)
  })


})
