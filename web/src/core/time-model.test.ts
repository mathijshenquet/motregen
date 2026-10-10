import { describe, expect, it } from 'vitest'
import type { Manifest } from './contract'
import { blendFixture, overlapFixture } from './time-model.fixtures'
import { buildTimeline, epochInWindow, frameBlend, scrubberViewWindow, seriesValueAt, timelineIndexesInWindow, timelineCursorAtEpoch, timelineEpochAtCursor, timelineCoverage, timelinePlaybackRate, timelineZones } from './time-model'

const chunk = (source: 'rtcor' | 'nowcast' | 'seamless' | 'harmonie', run: string, times: string[]) => ({ url: `${source}.mrf`, source, run, header_len: 42, times })

describe('time model', () => {
  it('sorts frames and resolves overlap by source priority then latest run', () => {
    const time = '2026-08-28T15:00:00Z'
    const manifest = overlapFixture
    const timeline = buildTimeline(manifest)
    expect(timeline.map((frame) => frame.source)).toEqual(['rtcor', 'nowcast'])
    expect(timeline[0]?.run).toBe(time)
  })

  it('calculates interpolation and clamps endpoints', () => {
    const manifest = blendFixture
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

  it('keeps past model hours and UV analyses for fields without observations', () => {
    const now = '2026-08-28T15:00:00Z'
    const past = '2026-08-28T14:00:00Z'
    const temp = { ...chunk('harmonie', '2026-08-28T12:00:00Z', [past, now]), field: 'temp_c' as const, url: 'temp.mrf' }
    const uv = { ...chunk('harmonie', now, [past]), source: 'uv' as const, field: 'uv' as const, url: 'uv.mrf' }
    const manifest: Manifest = { version: 0, generated: now, now, chunks: [temp, uv] }

    expect(buildTimeline(manifest, 'temp_c').map(({ time }) => time)).toEqual([past, now])
    expect(buildTimeline(manifest, 'uv').map(({ time }) => time)).toEqual([past])
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
    expect(timelineZones(timeline).map(({ label }) => label)).toEqual(['Voorspelling'])
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

describe('timelineCoverage', () => {
  const hour = 3_600_000
  const frames = [0, 1, 2].map((index) => ({ epoch: 10 * hour + index * hour }))

  it('is full inside the frames and ramps to zero outside them', () => {
    expect(timelineCoverage(frames, 10 * hour, hour / 3)).toBe(1)
    expect(timelineCoverage(frames, 11.5 * hour, hour / 3)).toBe(1)
    expect(timelineCoverage(frames, 10 * hour - hour / 6, hour / 3)).toBeCloseTo(0.5)
    expect(timelineCoverage(frames, 12 * hour + hour / 6, hour / 3)).toBeCloseTo(0.5)
    expect(timelineCoverage(frames, 9 * hour, hour / 3)).toBe(0)
    expect(timelineCoverage([], 10 * hour, hour / 3)).toBe(0)
  })
  it('loads the scrubber view around the cursor: a third behind, two thirds ahead, half an hour of slack', () => {
    const minute = 60_000
    const cursor = Date.parse('2026-10-07T12:10:00Z')
    const window = scrubberViewWindow(cursor)
    const anchor = Date.parse('2026-10-07T12:00:00Z')
    expect(window).toEqual({ start: anchor - 160 * minute - 30 * minute, end: anchor + 320 * minute + 30 * minute })
    // Tijdens afspelen blijft het venster staan tot de cursor een halfuurgrens passeert.
    expect(scrubberViewWindow(cursor + 4 * minute)).toEqual(window)
    expect(scrubberViewWindow(cursor + 6 * minute)).toEqual({ start: window.start + 30 * minute, end: window.end + 30 * minute })
    // De hele zichtbare breedte valt er altijd in.
    for (const offset of [0, 14 * minute, -14 * minute]) {
      const view = scrubberViewWindow(anchor + offset)
      expect(view.start).toBeLessThanOrEqual(anchor + offset - 160 * minute)
      expect(view.end).toBeGreaterThanOrEqual(anchor + offset + 320 * minute)
    }
  })

  it('selects the timeline frames inside a window, nearest to the cursor first', () => {
    const hour = 3_600_000
    const base = Date.parse('2026-10-07T00:00:00Z')
    const frames = Array.from({ length: 24 }, (_, index) => ({
      time: new Date(base + index * hour).toISOString(), epoch: base + index * hour, source: 'harmonie' as const,
      run: '2026-10-07T00:00:00Z', chunk: chunk('harmonie', '2026-10-07T00:00:00Z', []), frameIndex: index,
    }))
    const window = { start: base + 9.5 * hour, end: base + 13 * hour }
    expect(timelineIndexesInWindow(frames, window, base + 12.2 * hour)).toEqual([12, 13, 11, 10])
    expect(timelineIndexesInWindow(frames, { start: base + 30 * hour, end: base + 40 * hour }, base)).toEqual([])
    expect(epochInWindow(base + 9 * hour, window)).toBe(false)
    expect(epochInWindow(base + 9 * hour, window, hour)).toBe(true)
  })
})
