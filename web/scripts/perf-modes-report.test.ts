import { describe, expect, it } from 'vitest'
import type { Manifest } from '../src/core/contract'
import type { LoadTraceSnapshot } from '../src/core/perf'
import { classifyRequest, framesCompleteMs, histogramFrames, longFramesIn, mapFrames, renderSummary, totalsBySource, type VisitReport } from './perf-modes-report'

const hourly = (start: string, count: number) => Array.from({ length: count }, (_, index) => new Date(Date.parse(start) + index * 3_600_000).toISOString())

const manifest = {
  version: 0,
  generated: '2026-11-09T10:00:00Z',
  now: '2026-11-09T10:00:00Z',
  chunks: [
    { url: 'chunks/harmonie-20261109T0400-temp_c-a.mrf', source: 'harmonie', field: 'temp_c', run: '2026-11-09T04:00:00Z', header_len: 10, times: hourly('2026-11-09T05:00:00Z', 24) },
    { url: 'chunks/harmonie-20261109T0000-temp_c-b.mrf', source: 'harmonie', field: 'temp_c', run: '2026-11-09T00:00:00Z', header_len: 10, times: hourly('2026-11-09T01:00:00Z', 8) },
    { url: 'chunks/harmonie-20261109T0400-feels_like_c-c.mrf', source: 'harmonie', field: 'feels_like_c', run: '2026-11-09T04:00:00Z', header_len: 10, times: hourly('2026-11-09T05:00:00Z', 24) },
  ],
} as unknown as Manifest

describe('perf-modes-report', () => {
  it('classifies chunk URLs by source and the rest by kind', () => {
    expect(classifyRequest('https://motregen.nl/data/chunks/icon_d2-20261109T0600-radiation_direct-x.mrf')).toBe('icon_d2')
    expect(classifyRequest('https://motregen.nl/data/chunks/rtcor-20261109T0955-h3-g1c.mrf')).toBe('rtcor')
    expect(classifyRequest('https://motregen.nl/data/chunks/harmonie-wind_u_ms-20261109T0700-h48-l1-24-g6f8b.mrf')).toBe('harmonie')
    expect(classifyRequest('https://motregen.nl/plaatsen-4d18b8790eecd5af.json')).toBe('plaatsen')
    expect(classifyRequest('https://motregen.nl/data/chunks/icon-d2-radiation_direct-20261109T09-g4a.mrf')).toBe('icon_d2')
    expect(classifyRequest('https://motregen.nl/data/chunks/uv_clear-20261109T0938-g1.mrf')).toBe('uv')
    expect(classifyRequest('https://motregen.nl/data/manifest.json?s=1')).toBe('manifest')
    expect(classifyRequest('https://motregen.nl/assets/index-abc.js')).toBe('app')
    expect(classifyRequest('https://tiles.example/planet.pmtiles')).toBe('basemap')
  })

  it('takes the histogram frames of the opening window from the newest run per hour', () => {
    const frames = histogramFrames(manifest, 'gevoel')
    // Venster 06:50 … 15:50 (8 u met de cursor op een derde, plus een halfuur lucht): 07:00 … 15:00 uur.
    expect(frames.filter((frame) => frame.field === 'temp_c').map((frame) => new Date(frame.epoch).getUTCHours())).toEqual([7, 8, 9, 10, 11, 12, 13, 14, 15])
    expect(new Set(frames.filter((frame) => frame.field === 'temp_c').map((frame) => frame.url))).toEqual(new Set(['chunks/harmonie-20261109T0400-temp_c-a.mrf']))
    expect(frames.filter((frame) => frame.field === 'feels_like_c')).toHaveLength(9)
  })

  it('brackets now with one frame on an exact hour', () => {
    expect(mapFrames(manifest, 'gevoel').map((frame) => frame.frameIndex)).toEqual([5])
    expect(mapFrames(manifest, 'gevoel', Date.parse('2026-11-09T10:30:00Z')).map((frame) => frame.frameIndex)).toEqual([5, 6])
  })

  it('reports completion at the last wanted decode and null while one is missing', () => {
    const wanted = mapFrames(manifest, 'gevoel', Date.parse('2026-11-09T10:30:00Z'))
    const trace = (decoded: Array<[number, number]>): LoadTraceSnapshot => ({
      requests: [], marks: [],
      frames: decoded.map(([frameIndex, decodedMs]) => ({ url: `https://motregen.nl/data/chunks/harmonie-20261109T0400-feels_like_c-c.mrf`, frameIndex, layer: 'L0', requestId: null, requestedMs: 0, decodedMs })),
    })
    expect(framesCompleteMs(wanted, trace([[5, 900]])).completeMs).toBeNull()
    expect(framesCompleteMs(wanted, trace([[5, 900], [6, 1_200]])).completeMs).toBe(1_200)
  })

  it('sums bytes per source until a moment and keeps first start and last end', () => {
    const totals = totalsBySource([
      { url: 'https://x/data/chunks/harmonie-20261109T0400-temp_c-a.mrf', startMs: 100, endMs: 400, bytes: 1_000, fromCache: false, failed: null },
      { url: 'https://x/data/chunks/harmonie-20261109T0400-feels_like_c-c.mrf', startMs: 200, endMs: 900, bytes: 500, fromCache: false, failed: null },
      { url: 'https://x/data/chunks/uv-20261109T0938-uv-d.mrf', startMs: 2_000, endMs: 2_100, bytes: 300, fromCache: false, failed: null },
    ], 1_000)
    expect(totals.harmonie).toEqual({ requests: 2, bytes: 1_500, firstStartMs: 100, lastEndMs: 900 })
    expect(totals.uv.requests).toBe(0)
    expect(totals.totaal.bytes).toBe(1_500)
  })

  it('counts long frames that start inside a phase', () => {
    const frames = [{ startMs: 10, durationMs: 80, blockingMs: 30 }, { startMs: 500, durationMs: 120, blockingMs: 70 }, { startMs: 1_500, durationMs: 60, blockingMs: 10 }]
    expect(longFramesIn(frames, { startMs: 0, endMs: 1_000 })).toEqual({ count: 2, totalMs: 200, blockingMs: 100, maxMs: 120 })
  })

  it('renders medians with units and marks combinations that did not always finish', () => {
    const report = (histogramCompleteMs: number | null): VisitReport => {
      const totals = totalsBySource([{ url: 'https://x/data/manifest.json', startMs: 0, endMs: 50, bytes: 40_000, fromCache: false, failed: null }])
      return {
        mode: 'wind', profile: 'desktop', visit: 'koud', run: 1, origin: 'x', capturedAt: '', loadAverage: 1, settled: true,
        milestones: { firstMapMs: 800, ttfrMs: 700, histogramCompleteMs, tableCompleteMs: 1_000, settledMs: 3_000 },
        histogram: { frames: 27, missing: 0 }, table: { rowsChecked: 9 },
        untilHistogram: totals, untilSettled: totals, longFrames: { laden: { count: 1, totalMs: 60, blockingMs: 10, maxMs: 60 } },
      }
    }
    const summary = renderSummary([report(1_500), report(null)])
    expect(summary).toContain('| desktop koud | wind | 2 | 0,80 s | 1,50 s (1/2) | 1,00 s | 40 kB | 1 | 40 kB | 1 |')
    expect(summary).toContain('1 / 10 ms / 60 ms')
  })
})
