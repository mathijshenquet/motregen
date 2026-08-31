import { describe, expect, it } from 'vitest'
import { PerfMonitor, type PerfEnvironment } from './perf'

function harness() {
  let now = 0
  let wallNow = Date.parse('2026-08-31T10:00:00Z')
  let frame: FrameRequestCallback | undefined
  const resources: ReturnType<PerfEnvironment['resources']> = []
  const monitor = new PerfMonitor({
    now: () => now,
    wallNow: () => wallNow,
    resources: () => resources,
    requestFrame: (callback) => { frame = callback; return 1 },
    cancelFrame: () => { frame = undefined },
  })
  return {
    monitor,
    resources,
    advance(milliseconds: number) { now += milliseconds; wallNow += milliseconds },
    frame(timestamp: number) { frame?.(timestamp) },
  }
}

describe('performance monitor', () => {
  it('measures first render, scrub percentiles, fps and manifest age', () => {
    const test = harness()
    test.monitor.start()
    test.advance(180)
    test.monitor.markRainFrameCommitted()
    for (const latency of [10, 20, 30, 100]) {
      test.monitor.markScrubInput()
      test.advance(latency)
      test.monitor.markRainFrameCommitted()
    }
    test.monitor.setManifestGenerated('2026-08-31T09:45:00Z')
    test.frame(0)
    for (let timestamp = 20; timestamp <= 1_000; timestamp += 20) test.frame(timestamp)

    const snapshot = test.monitor.snapshot()
    expect(snapshot.ttfrMs).toBe(180)
    expect(snapshot.scrub).toEqual({ samples: 4, p50Ms: 20, p95Ms: 100 })
    expect(snapshot.fps).toBe(50)
    expect(snapshot.manifestAgeMs).toBe(900_340)
  })

  it('counts transferred bytes by resource category', () => {
    const test = harness()
    test.resources.push(
      { name: 'https://motregen.nl/data/manifest.json', initiatorType: 'fetch', transferSize: 900 },
      { name: 'https://motregen.nl/data/chunks/rain.mrf', initiatorType: 'fetch', transferSize: 2_100 },
      { name: 'https://tiles.example/tiles/1/2/3.pbf', initiatorType: 'fetch', transferSize: 4_000 },
      { name: 'https://motregen.nl/assets/app.js', initiatorType: 'script', transferSize: 3_000 },
    )

    expect(test.monitor.snapshot().network).toEqual({
      manifest: { requests: 1, bytes: 900 },
      chunks: { requests: 1, bytes: 2_100 },
      tiles: { requests: 1, bytes: 4_000 },
      other: { requests: 1, bytes: 3_000 },
      total: { requests: 4, bytes: 10_000 },
    })
  })

  it('keeps only the latest pending scrub input and a bounded sample window', () => {
    const test = harness()
    test.monitor.markScrubInput()
    test.advance(40)
    test.monitor.markScrubInput()
    test.advance(5)
    test.monitor.markRainFrameCommitted()
    for (let index = 0; index < 300; index++) {
      test.monitor.markScrubInput()
      test.advance(index)
      test.monitor.markRainFrameCommitted()
    }

    const snapshot = test.monitor.snapshot()
    expect(snapshot.scrub.samples).toBe(256)
    expect(snapshot.scrub.p95Ms).toBe(287)
  })
})
