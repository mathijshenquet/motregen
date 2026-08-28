import { describe, expect, it } from 'vitest'
import type { Manifest } from './contract'
import { buildTimeline, frameBlend } from './time-model'

const chunk = (source: 'rtcor' | 'nowcast' | 'harmonie', run: string, times: string[]) => ({ url: `${source}.mrf`, source, run, header_len: 42, times })

describe('time model', () => {
  it('sorts frames and resolves overlap by source priority then latest run', () => {
    const time = '2026-08-28T15:00:00Z'
    const manifest: Manifest = { version: 0, generated: time, now: time, chunks: [
      chunk('harmonie', '2026-08-28T12:00:00Z', [time]),
      chunk('nowcast', '2026-08-28T14:00:00Z', [time, '2026-08-28T15:05:00Z']),
      chunk('nowcast', '2026-08-28T14:55:00Z', [time]),
      chunk('rtcor', time, [time]),
    ] }
    const timeline = buildTimeline(manifest)
    expect(timeline.map((frame) => frame.source)).toEqual(['rtcor', 'nowcast'])
    expect(timeline[0]?.run).toBe(time)
  })

  it('calculates interpolation and clamps endpoints', () => {
    const manifest: Manifest = { version: 0, generated: '2026-08-28T15:00:00Z', now: '2026-08-28T15:00:00Z', chunks: [
      chunk('rtcor', '2026-08-28T15:00:00Z', ['2026-08-28T15:00:00Z', '2026-08-28T15:10:00Z']),
    ] }
    const timeline = buildTimeline(manifest)
    expect(frameBlend(timeline, Date.parse('2026-08-28T15:05:00Z'))).toEqual({ left: 0, right: 1, mix: 0.5 })
    expect(frameBlend(timeline, 0)).toEqual({ left: 0, right: 0, mix: 0 })
  })
})
