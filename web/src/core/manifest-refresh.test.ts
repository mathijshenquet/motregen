import { describe, expect, it, vi } from 'vitest'
import type { Manifest, ManifestChunk, TimelineFrame } from './contract'
import { cursorAfterTimelineRefresh, isNewerManifest, reconcileTimelineSeries, scheduleManifestRefresh, type ManifestRefreshHost } from './manifest-refresh'
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
  it('polls every minute, refreshes on visible return, and coalesces overlap', async () => {
    let intervalCallback: () => void = () => undefined
    let visibilityCallback: () => void = () => undefined
    let visibility: DocumentVisibilityState = 'hidden'
    let resolveRefresh: () => void = () => undefined
    const refresh = vi.fn(() => new Promise<void>((resolve) => { resolveRefresh = resolve }))
    const host: ManifestRefreshHost = {
      setInterval: (callback, interval) => { expect(interval).toBe(60_000); intervalCallback = callback; return 7 },
      clearInterval: vi.fn(),
      visibilityState: () => visibility,
      addVisibilityListener: (callback) => { visibilityCallback = callback },
      removeVisibilityListener: vi.fn(),
    }
    const stop = scheduleManifestRefresh(refresh, host)

    intervalCallback()
    intervalCallback()
    visibilityCallback()
    expect(refresh).toHaveBeenCalledTimes(1)
    resolveRefresh()
    await Promise.resolve()
    await Promise.resolve()
    visibility = 'visible'
    visibilityCallback()
    expect(refresh).toHaveBeenCalledTimes(2)
    resolveRefresh()
    await Promise.resolve()
    stop()
    expect(host.clearInterval).toHaveBeenCalledWith(7)
    expect(host.removeVisibilityListener).toHaveBeenCalledWith(visibilityCallback)
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
