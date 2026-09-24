import { describe, expect, it, vi } from 'vitest'
import type { Manifest, ManifestChunk, TimelineFrame } from './contract'
import { cursorAfterTimelineRefresh, isNewerManifest, nextManifestRefreshDelay, reconcileTimelineSeries, scheduleManifestRefresh, type ManifestRefreshHost } from './manifest-refresh'
import { timelineEpochAtCursor } from './time-model'

const chunk = (url: string): ManifestChunk => ({
  url,
  source: 'rtcor',
  run: '2026-08-31T18:00:00Z',
  header_len: 100,
  times: [],
})

const frame = (url: string, frameIndex: number, epoch: number): TimelineFrame => ({
  time: new Date(epoch).toISOString(),
  epoch,
  source: 'rtcor',
  run: '2026-08-31T18:00:00Z',
  chunk: chunk(url),
  frameIndex,
})

describe('manifest refresh', () => {
  it('re-arms after each refresh, refreshes on visible return, and coalesces overlap', async () => {
    let timerCallback: () => void = () => undefined
    let visibilityCallback: () => void = () => undefined
    let visibility: DocumentVisibilityState = 'hidden'
    let resolveRefresh: () => void = () => undefined
    const delays: number[] = []
    const refresh = vi.fn(() => new Promise<void>((resolve) => { resolveRefresh = resolve }))
    const host: ManifestRefreshHost = {
      setTimeout: (callback, delay) => { delays.push(delay); timerCallback = callback; return delays.length },
      clearTimeout: vi.fn(),
      visibilityState: () => visibility,
      addVisibilityListener: (callback) => { visibilityCallback = callback },
      removeVisibilityListener: vi.fn(),
    }
    let next = 60_000
    const stop = scheduleManifestRefresh(refresh, host, () => next)
    expect(delays).toEqual([60_000])

    timerCallback()
    timerCallback()
    visibilityCallback()
    expect(refresh).toHaveBeenCalledTimes(1)
    next = 15_000
    resolveRefresh()
    await Promise.resolve()
    await Promise.resolve()
    expect(delays).toEqual([60_000, 15_000])
    visibility = 'visible'
    visibilityCallback()
    expect(refresh).toHaveBeenCalledTimes(2)
    resolveRefresh()
    await Promise.resolve()
    await Promise.resolve()
    stop()
    expect(host.clearTimeout).toHaveBeenLastCalledWith(3)
    expect(host.removeVisibilityListener).toHaveBeenCalledWith(visibilityCallback)
  })

  it('polls fast only around the expected publication of the next radar frame', () => {
    const radar = Date.parse('2026-09-24T10:55:00Z')
    const at = (clock: string) => nextManifestRefreshDelay(Date.parse(`2026-09-24T${clock}Z`), radar)
    expect(nextManifestRefreshDelay(radar, undefined)).toBe(60_000)
    expect(at('10:57:52')).toBe(60_000)
    expect(at('11:01:00')).toBe(30_000)
    expect(at('11:01:29')).toBe(1_000)
    expect(at('11:01:30')).toBe(15_000)
    expect(at('11:05:29')).toBe(15_000)
    // Blijft het frame uit, dan terug naar de minuutpoll.
    expect(at('11:05:30')).toBe(60_000)
  })

  it('keeps the selected epoch and reuses values for unchanged generation URLs', () => {
    const previous = [frame('old.mrf', 0, 0), frame('stable.mrf', 0, 300_000), frame('stable.mrf', 1, 600_000)]
    const next = [frame('stable.mrf', 0, 300_000), frame('stable.mrf', 1, 600_000), frame('new.mrf', 0, 900_000)]
    const cursor = 1.5
    const reconciled = reconcileTimelineSeries(previous, next, [1, 2, 3], [true, true, true])

    expect(timelineEpochAtCursor(next, cursorAfterTimelineRefresh(previous, next, cursor))).toBe(450_000)
    expect(reconciled).toEqual({ values: [2, 3, null], loaded: [true, true, false] })
  })

  it('accepts only a strictly newer generated timestamp', () => {
    const manifest = (generated: string): Manifest => ({ version: 0, generated, now: generated, chunks: [] })
    expect(isNewerManifest(manifest('2026-08-31T18:00:00Z'), manifest('2026-08-31T18:01:00Z'))).toBe(true)
    expect(isNewerManifest(manifest('2026-08-31T18:00:00Z'), manifest('2026-08-31T18:00:00Z'))).toBe(false)
    expect(isNewerManifest(manifest('2026-08-31T18:00:00Z'), manifest('2026-08-31T17:59:00Z'))).toBe(false)
  })
})
