import { expect, it } from 'vitest'
import { validateLoopBytes, videoArguments, videoSettings } from './video-settings.js'

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

it('budgets the complete encoded loop including its hold, for both frame rates', () => {
  const settings = videoSettings({})
  for (const [frames, fps, maxrate] of [[179, 10, 8_044_692], [114, 4.5, 5_684_210]]) {
    const args = videoArguments(settings, frames!, fps!)
    expect(args.slice(args.indexOf('-maxrate'), args.indexOf('-maxrate') + 4)).toEqual(['-maxrate', String(maxrate), '-bufsize', String(2 * maxrate!)])
    expect(args).not.toContain('-x264-params')
  }
  expect(videoArguments(videoSettings({ MOTREGEN_VIDEO_PRESET: 'ultrafast' }), 179, 10)).toContain('8x8dct=1')
  for (const [frames, fps] of [[0, 10], [179, 0], [179, NaN]]) expect(() => videoArguments(settings, frames!, fps!)).toThrow('VBV')
})
