import { expect, it } from 'vitest'
import { validateLoopBytes, videoSettings } from './video-settings.js'

it('accepts large quality-based films and rejects files above the safety limit', () => {
  const settings = videoSettings({})
  for (const bytes of [3_000_001, settings.maxBytes]) expect(() => validateLoopBytes(bytes, settings)).not.toThrow()
  for (const bytes of [0, -1, NaN, settings.maxBytes + 1]) expect(() => validateLoopBytes(bytes, settings)).toThrow('veiligheidsgrens')
})

it('overrides quality and the safety limit independently without a size-targeted retry', () => {
  expect(videoSettings({ MOTREGEN_VIDEO_PRESET: 'medium', MOTREGEN_VIDEO_CRF: '16', MOTREGEN_VIDEO_MAX_BYTES: '10000000' })).toMatchObject({ preset: 'medium', crf: 16, maxBytes: 10_000_000 })
  for (const environment of [
    { MOTREGEN_VIDEO_PRESET: 'invalid' }, { MOTREGEN_VIDEO_CRF: '' }, { MOTREGEN_VIDEO_CRF: '0' },
    { MOTREGEN_VIDEO_CRF: '52' }, { MOTREGEN_VIDEO_CRF: '18.5' }, { MOTREGEN_VIDEO_CRF: 'invalid' },
    { MOTREGEN_VIDEO_MAX_BYTES: '0' }, { MOTREGEN_VIDEO_MAX_BYTES: '50000000' },
  ]) expect(() => videoSettings(environment)).toThrow('MOTREGEN_VIDEO_')
})
