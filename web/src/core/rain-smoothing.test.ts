import { describe, expect, it } from 'vitest'
import { WARP_CAP_CELLS } from './rain-layer'
import { autoBlurSigma, blurSigma, DEFAULT_RAIN_FIELD_TUNING, loadRainFieldTuning, RAIN_FIELD_STORAGE_KEYS, rainSampling, rainSourceGroup, rainWarpLimit, type RainFieldTuning } from './rain-smoothing'

const HOUR_MS = 3_600_000
const storage = (values: Record<string, string>) => ({ getItem: (key: string) => values[key] ?? null })

describe('rain smoothing', () => {
  it('groups the blend with radar and nowcast: only HARMONIE has the coarse source grid', () => {
    expect(['rtcor', 'nowcast', 'seamless', 'harmonie'].map((source) => rainSourceGroup(source as 'rtcor'))).toEqual(['radar', 'radar', 'radar', 'harmonie'])
  })

  it('blurs by lead time, not by source: 5×5 up to two hours ahead, 9×9 from three hours', () => {
    expect(autoBlurSigma(-HOUR_MS)).toBe(blurSigma(5))
    expect(autoBlurSigma(2 * HOUR_MS)).toBe(blurSigma(5))
    expect(autoBlurSigma(2.5 * HOUR_MS)).toBeCloseTo((blurSigma(5) + blurSigma(9)) / 2)
    expect(autoBlurSigma(3 * HOUR_MS)).toBe(blurSigma(9))
    expect(autoBlurSigma(40 * HOUR_MS)).toBe(blurSigma(9))
    for (const source of ['nowcast', 'harmonie'] as const) {
      expect(rainSampling(source, HOUR_MS, DEFAULT_RAIN_FIELD_TUNING)).toMatchObject({ kernel: 'source-blur', blurSigma: blurSigma(5) })
    }
  })

  it('moves the rain along over a long step, also across the seam from the blend into HARMONIE', () => {
    expect(rainWarpLimit(60).capCells).toBeGreaterThan(WARP_CAP_CELLS)
    expect(rainWarpLimit(55).capCells).toBe(rainWarpLimit(60).capCells)
    expect(rainWarpLimit(5).capCells).toBe(WARP_CAP_CELLS)
  })

  it('lets a dev override replace the automatic blur per source group', () => {
    const tuning: RainFieldTuning = { radar: 'glad', harmonie: 'blur 3×3' }
    const radar = rainSampling('nowcast', 5 * HOUR_MS, tuning), harmonie = rainSampling('harmonie', 5 * HOUR_MS, tuning)
    expect([radar.kernel, harmonie.kernel, harmonie.blurSigma]).toEqual(['source-cubic', 'source-blur', blurSigma(3)])
    expect(harmonie.sourceCellWidth).toBeGreaterThan(radar.sourceCellWidth)
  })

  it('ignores stored values that are not a known choice', () => {
    expect(loadRainFieldTuning(storage({ [RAIN_FIELD_STORAGE_KEYS.radar]: 'onzin', [RAIN_FIELD_STORAGE_KEYS.harmonie]: 'glad' }))).toEqual({ ...DEFAULT_RAIN_FIELD_TUNING, harmonie: 'glad' })
  })
})
