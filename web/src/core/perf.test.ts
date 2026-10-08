import { describe, expect, it } from 'vitest'
import { configurePerfMode, consumeColdProfile, PerfMonitor, type PerfEnvironment } from './perf'

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
    test.monitor.markBasemapReady()
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

  it('lets ttfr wait for both the first rain frame and the basemap tiles', () => {
    const test = harness()
    test.advance(120)
    test.monitor.markRainFrameCommitted()
    expect(test.monitor.snapshot()).toMatchObject({ firstRainMs: 120, basemapReadyMs: null, ttfrMs: null })
    test.advance(300)
    test.monitor.markBasemapReady()
    test.advance(50)
    test.monitor.markBasemapReady()
    expect(test.monitor.snapshot()).toMatchObject({ firstRainMs: 120, basemapReadyMs: 420, ttfrMs: 420 })
  })

  it('reaches ttfp at the first rain frame change while playing, not while paused or on a repeated frame', () => {
    const test = harness()
    test.advance(100)
    expect(test.monitor.markRainFrameCommitted({ frameEpoch: 1_000, playing: false })).toBe(false)
    test.advance(100)
    expect(test.monitor.markRainFrameCommitted({ frameEpoch: 2_000, playing: false })).toBe(false)
    test.advance(100)
    expect(test.monitor.markRainFrameCommitted({ frameEpoch: 2_000, playing: true })).toBe(false)
    expect(test.monitor.snapshot().ttfpMs).toBeNull()
    test.advance(100)
    expect(test.monitor.markRainFrameCommitted({ frameEpoch: 3_000, playing: true })).toBe(true)
    test.advance(100)
    expect(test.monitor.markRainFrameCommitted({ frameEpoch: 4_000, playing: true })).toBe(false)
    expect(test.monitor.snapshot().ttfpMs).toBe(400)
  })

  it('accumulates blank-visible time only after the splash and while a visible slot is blank', () => {
    const test = harness()
    test.monitor.setBlankVisibleSlots(12)
    test.advance(500)
    test.monitor.markSplashGone()
    test.advance(200)
    expect(test.monitor.snapshot().blankVisibleMs).toBe(200)
    test.advance(100)
    test.monitor.setBlankVisibleSlots(0)
    test.advance(1_000)
    test.monitor.setBlankVisibleSlots(3)
    test.advance(50)
    test.monitor.setBlankVisibleSlots(1)
    test.advance(50)
    test.monitor.setBlankVisibleSlots(0)
    test.advance(1_000)
    expect(test.monitor.snapshot().blankVisibleMs).toBe(400)
  })

  it('integrates blank slots over time as an area and marks the first bar', () => {
    const test = harness()
    test.monitor.setBlankVisibleSlots(10, 10)
    test.advance(1_000)
    test.monitor.markSplashGone()
    test.advance(2_000)
    test.monitor.setBlankVisibleSlots(4, 10)
    test.advance(1_000)
    test.monitor.setBlankVisibleSlots(0, 10)
    test.advance(5_000)
    // 10 slots × 2 s + 4 slots × 1 s = 24 slot-seconden; als aandeel 1,0 × 2 s + 0,4 × 1 s.
    expect(test.monitor.snapshot()).toMatchObject({ blankSlotSeconds: 24, blankShareSeconds: 2.4, firstBarMs: 3_000, blankVisibleMs: 3_000 })
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

  it('traces a load request from start to decoded frames and marks', () => {
    const test = harness()
    const loads = test.monitor.loads
    loads.mark({ kind: 'schedule', layer: 'L1', field: 'rain_rate', indexes: [3, 4], reason: 'idle' })
    test.advance(10)
    const request = loads.request('https://motregen.nl/data/chunks/rain.mrf', [100, 199], 'low', 'L1', [3, 4])
    test.advance(20)
    loads.response(request)
    loads.received(request, 60)
    loads.frameBytesReady('https://motregen.nl/data/chunks/rain.mrf', 3)
    test.advance(5)
    loads.received(request, 40)
    loads.finished(request)
    loads.frameDecoded('https://motregen.nl/data/chunks/rain.mrf', 3)

    const snapshot = loads.snapshot()
    expect(snapshot.requests).toEqual([{ id: 1, url: 'https://motregen.nl/data/chunks/rain.mrf', range: [100, 199], priority: 'low', layer: 'L1', frames: [3, 4], startMs: 10, responseMs: 30, endMs: 35, bytes: 100 }])
    expect(snapshot.frames).toEqual([
      { url: 'https://motregen.nl/data/chunks/rain.mrf', frameIndex: 3, layer: 'L1', requestId: 1, requestedMs: 10, bytesReadyMs: 30, decodedMs: 35 },
      { url: 'https://motregen.nl/data/chunks/rain.mrf', frameIndex: 4, layer: 'L1', requestId: 1, requestedMs: 10 },
    ])
    expect(snapshot.marks).toEqual([{ kind: 'schedule', layer: 'L1', field: 'rain_rate', indexes: [3, 4], reason: 'idle', t: 0 }])
  })

  it('aggregates phase percentiles in the last 30 seconds and keeps the five longest frames', () => {
    const test = harness()
    for (const [index, duration] of [1, 2, 3, 4, 100].entries()) {
      test.monitor.recordPhase({ phase: 'wind-step', startTime: 2_000 + index * 10, duration })
    }
    test.monitor.recordPhase({ phase: 'wind-step', startTime: 1, duration: 999 })
    for (let index = 0; index < 7; index++) test.monitor.recordLongFrame({
      startTime: 31_000 + index,
      duration: 50 + index,
      blockingDuration: index,
      scripts: [{ duration: index, sourceURL: `/app-${index}.js`, sourceFunctionName: 'tick', invoker: 'event-listener' }],
    })
    test.advance(31_100)

    const snapshot = test.monitor.snapshot()
    expect(snapshot.phases['wind-step']).toEqual({ count: 5, p50Ms: 3, p95Ms: 100 })
    expect(snapshot.longFrames.map((frame) => frame.duration)).toEqual([56, 55, 54, 53, 52])
    expect(snapshot.longFrames[0]!.scripts[0]!.sourceURL).toBe('/app-6.js')
  })

  it('keeps ?perf explicit, clears stale state on a plain URL and consumes a cold-start request once', () => {
    const values = new Map<string, string>()
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
      removeItem: (key: string) => { values.delete(key) },
    }
    expect(configurePerfMode(new URL('https://example.test/?perf'), storage)).toBe(true)
    expect(configurePerfMode(new URL('https://example.test/'), storage)).toBe(false)
    expect(values.get('motregen-perf')).toBeUndefined()
    storage.setItem('motregen-perf', '1')
    storage.setItem('motregen-perf-cold', '1')
    expect(configurePerfMode(new URL('https://example.test/'), storage)).toBe(true)
    expect(consumeColdProfile(storage)).toBe(true)
    expect(consumeColdProfile(storage)).toBe(false)
    expect(values.get('motregen-perf')).toBeUndefined()
    expect(configurePerfMode(new URL('https://example.test/?perf=0'), storage)).toBe(false)
    expect(configurePerfMode(new URL('https://example.test/?perf=start'), storage)).toBe(true)
    expect(consumeColdProfile(storage)).toBe(true)
  })
})
