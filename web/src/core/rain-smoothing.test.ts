import { describe, expect, it } from 'vitest'
import { WARP_CAP_CELLS, WARP_FADE_END_CELLS } from './rain-layer'
import { DEFAULT_RAIN_FIELD_TUNING, loadRainFieldTuning, RAIN_FIELD_STORAGE_KEYS, rainSampling, rainSourceGroup, rainTimeBlend, type RainFieldTuning } from './rain-smoothing'

const storage = (values: Record<string, string>) => ({ getItem: (key: string) => values[key] ?? null })

describe('rain smoothing', () => {
  it('groups the blend with radar and nowcast: only HARMONIE has the coarse source grid', () => {
    expect(['rtcor', 'nowcast', 'seamless', 'harmonie'].map((source) => rainSourceGroup(source as 'rtcor'))).toEqual(['radar', 'radar', 'radar', 'harmonie'])
  })

  it('keeps the product look by default', () => {
    expect(rainSampling('harmonie', DEFAULT_RAIN_FIELD_TUNING).kernel).toBe('bilinear')
    expect(rainSampling('rtcor', DEFAULT_RAIN_FIELD_TUNING).kernel).toBe('bilinear')
    expect(rainTimeBlend('harmonie', 'harmonie', DEFAULT_RAIN_FIELD_TUNING)).toEqual({ eased: false, warpCapCells: WARP_CAP_CELLS, warpFadeEndCells: WARP_FADE_END_CELLS })
  })

  it('samples each source group with its own kernel and source cell', () => {
    const tuning: RainFieldTuning = { radar: 'glad', harmonie: 'blur 3×3', harmonieTime: 'meebewegen' }
    const radar = rainSampling('nowcast', tuning), harmonie = rainSampling('harmonie', tuning)
    expect([radar.kernel, harmonie.kernel]).toEqual(['source-cubic', 'source-blur-3'])
    expect(harmonie.sourceCellWidth).toBeGreaterThan(radar.sourceCellWidth)
  })

  it('changes the time blend only between two HARMONIE frames', () => {
    const tuning: RainFieldTuning = { ...DEFAULT_RAIN_FIELD_TUNING, harmonieTime: 'meebewegen' }
    expect(rainTimeBlend('harmonie', 'harmonie', tuning).warpCapCells).toBeGreaterThan(WARP_CAP_CELLS)
    expect(rainTimeBlend('seamless', 'harmonie', tuning).warpCapCells).toBe(WARP_CAP_CELLS)
    expect(rainTimeBlend('harmonie', 'harmonie', { ...tuning, harmonieTime: 'vloeiend' }).eased).toBe(true)
  })

  it('ignores stored values that are not a known choice', () => {
    expect(loadRainFieldTuning(storage({ [RAIN_FIELD_STORAGE_KEYS.radar]: 'onzin', [RAIN_FIELD_STORAGE_KEYS.harmonie]: 'glad' }))).toEqual({ ...DEFAULT_RAIN_FIELD_TUNING, harmonie: 'glad' })
  })
})
