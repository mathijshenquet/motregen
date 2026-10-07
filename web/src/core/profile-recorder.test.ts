import { describe, expect, it } from 'vitest'
import { buildChromeTrace, type SelfProfilerTrace } from './profile-recorder'

describe('Chrome trace export', () => {
  it('exports deterministic phase, long-frame and self-profile events', () => {
    const selfProfile: SelfProfilerTrace = {
      resources: ['https://ageq-mthq/assets/app.js'],
      frames: [
        { name: 'tick', resourceId: 0, line: 12, column: 4 },
        { name: 'draw', resourceId: 0, line: 20, column: 2 },
      ],
      stacks: [{ frameId: 0 }, { parentId: 0, frameId: 1 }],
      samples: [{ timestamp: 110, stackId: 1 }, { timestamp: 120, stackId: 0 }],
    }
    const trace = buildChromeTrace({
      entries: {
        measures: [{ phase: 'wind-step', startTime: 105, duration: 4.25, detail: { particles: 300 } }],
        longFrames: [{
          startTime: 100,
          duration: 70,
          blockingDuration: 20,
          scripts: [{ duration: 35, sourceURL: '/assets/app.js', sourceFunctionName: 'tick', invoker: 'event-listener' }],
        }],
      },
      timeOrigin: 1_000,
      captureStartTime: 100,
      captureEndTime: 130,
      profileStartTime: 100,
      selfProfile,
      capturedAt: '2026-10-07T08:00:00.000Z',
      origin: 'http://ageq-mthq:4330',
      platform: 'Linux',
      userAgent: 'test',
    })

    expect(trace.metadata.profiler).toBe('js-self-profiling')
    expect(trace.traceEvents.find((event) => event.name === 'wind-step')).toMatchObject({ ph: 'X', ts: 1_105_000, dur: 4_250 })
    expect(trace.traceEvents.find((event) => event.name === 'Long animation frame')).toMatchObject({ ph: 'X', ts: 1_100_000, dur: 70_000 })
    const chunk = trace.traceEvents.find((event) => event.name === 'ProfileChunk')!
    expect(chunk.args).toEqual({ data: {
      cpuProfile: {
        nodes: [
          { id: 1, callFrame: { functionName: '(root)', scriptId: '0', url: '', lineNumber: -1, columnNumber: -1 }, children: [2] },
          { id: 2, callFrame: { functionName: 'tick', scriptId: '1', url: 'https://ageq-mthq/assets/app.js', lineNumber: 11, columnNumber: 3 }, children: [3] },
          { id: 3, callFrame: { functionName: 'draw', scriptId: '1', url: 'https://ageq-mthq/assets/app.js', lineNumber: 19, columnNumber: 1 }, children: [] },
        ],
        samples: [3, 2],
      },
      timeDeltas: [10_000, 10_000],
      source: 'SelfProfiling',
    } })
  })

  it('keeps measures usable when the Profiler API is unavailable', () => {
    const trace = buildChromeTrace({
      entries: { measures: [{ phase: 'frame-decode', startTime: 5, duration: 2 }], longFrames: [] },
      timeOrigin: 10,
      captureStartTime: 0,
      captureEndTime: 30,
      profileStartTime: 0,
      capturedAt: '2026-10-07T08:00:00.000Z',
      origin: 'http://localhost',
      platform: 'test',
      userAgent: 'test',
    })
    expect(trace.metadata.profiler).toBe('measures-only')
    expect(trace.traceEvents.some((event) => event.name === 'Profile')).toBe(false)
    expect(trace.traceEvents.find((event) => event.name === 'frame-decode')).toMatchObject({ ts: 15_000, dur: 2_000 })
  })
})
