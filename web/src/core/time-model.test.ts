import { describe, expect, it } from 'vitest'
import type { Manifest } from './contract'
import { buildTimeline, frameBlend, seriesValueAt, timelineCursorAtEpoch, timelineEpochAtCursor, timelinePlaybackRate, timelineZones } from './time-model'

const chunk = (source: 'rtcor' | 'nowcast' | 'seamless' | 'harmonie', run: string, times: string[]) => ({ url: `${source}.mrf`, source, run, header_len: 42, times })

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
    expect(timelineEpochAtCursor(timeline, Number.NaN)).toBe(timeline[0]!.epoch)
    expect(timelineEpochAtCursor(timeline, 99)).toBe(timeline[1]!.epoch)
    expect(timelineCursorAtEpoch(timeline, Number.NaN)).toBe(0)
    expect(timelineCursorAtEpoch(timeline, Date.parse('2026-08-28T15:05:00Z'))).toBe(0.5)
    expect(seriesValueAt(timeline, [2, 6], Date.parse('2026-08-28T15:05:00Z'), 300_000)).toBe(4)
    expect(seriesValueAt(timeline, [2, 6], Date.parse('2026-08-28T14:00:00Z'), 300_000)).toBeNull()
  })

  it('keeps field timelines separate and defaults missing fields to rain', () => {
    const time = '2026-08-28T16:00:00Z'
    const rain = chunk('harmonie', time, [time])
    const radiation = { ...chunk('harmonie', time, [time]), field: 'radiation' as const, url: 'radiation.mrf' }
    const manifest: Manifest = { version: 0, generated: time, now: time, chunks: [rain, radiation] }

    expect(buildTimeline(manifest).map((frame) => frame.chunk.url)).toEqual(['harmonie.mrf'])
    expect(buildTimeline(manifest, 'radiation').map((frame) => frame.chunk.url)).toEqual(['radiation.mrf'])
  })

  it('accepts the dedicated official UV source', () => {
    const time = '2026-08-28T15:00:00Z'
    const uv = { ...chunk('harmonie', time, [time]), source: 'uv' as const, field: 'uv' as const, url: 'uv.mrf' }
    const manifest: Manifest = { version: 0, generated: time, now: time, chunks: [uv] }
    expect(buildTimeline(manifest, 'uv')[0]?.source).toBe('uv')
  })

  it('removes all non-observations before now while retaining forecasts at now', () => {
    const now = '2026-08-28T15:00:00Z'
    const past = '2026-08-28T14:00:00Z'
    const manifest: Manifest = { version: 0, generated: now, now, chunks: [
      chunk('harmonie', '2026-08-28T12:00:00Z', [past, now]),
      chunk('nowcast', now, [past, now]),
      chunk('rtcor', now, [past]),
    ] }

    expect(buildTimeline(manifest).map(({ time, source }) => [time, source])).toEqual([
      [past, 'rtcor'],
      [now, 'nowcast'],
    ])
  })

  it('prefers seamless over raw model and folds it into the model zone', () => {
    const now = '2026-08-28T15:00:00Z'
    const later = '2026-08-28T18:00:00Z'
    const manifest: Manifest = { version: 0, generated: now, now, chunks: [
      chunk('harmonie', '2026-08-28T12:00:00Z', [later]),
      chunk('seamless', now, [later]),
      chunk('nowcast', now, [now]),
    ] }
    const timeline = buildTimeline(manifest)

    expect(timeline[1]?.source).toBe('seamless')
    expect(timelineZones(timeline).map(({ label }) => label)).toEqual(['Nowcast', 'Model'])
  })

  it('recomputes playback speed when switching horizon in both directions', () => {
    const now = '2026-08-28T15:00:00Z'
    const nowEpoch = Date.parse(now)
    const quarterHours = Array.from({ length: 13 }, (_, index) => new Date(nowEpoch + index * 15 * 60_000).toISOString())
    const modelHours = Array.from({ length: 21 }, (_, index) => new Date(nowEpoch + (index + 4) * 3_600_000).toISOString())
    const manifest: Manifest = { version: 0, generated: now, now, chunks: [
      chunk('nowcast', now, quarterHours),
      chunk('harmonie', '2026-08-28T12:00:00Z', modelHours),
    ] }
    const timeline = buildTimeline(manifest)
    const speed3 = timelinePlaybackRate(timeline, nowEpoch, 3)
    const speed8 = timelinePlaybackRate(timeline, nowEpoch, 8)
    const speed24 = timelinePlaybackRate(timeline, nowEpoch, 24)

    let horizon = 24
    const beforeNarrowing = timelinePlaybackRate(timeline, nowEpoch, horizon)
    horizon = 8
    const afterNarrowing = timelinePlaybackRate(timeline, nowEpoch, horizon)
    expect([beforeNarrowing, afterNarrowing]).toEqual([speed24, speed8])
    expect(afterNarrowing).toBeLessThan(beforeNarrowing)

    horizon = 8
    const beforeWidening = timelinePlaybackRate(timeline, nowEpoch, horizon)
    horizon = 24
    const afterWidening = timelinePlaybackRate(timeline, nowEpoch, horizon)
    expect([beforeWidening, afterWidening]).toEqual([speed8, speed24])
    expect(afterWidening).toBeGreaterThan(beforeWidening)
    expect(speed3).toBeLessThan(speed8)
    expect(speed8).toBeLessThan(speed24)
  })
})
