import { describe, expect, it } from 'vitest'
import { profileTop } from './prof-top'

const frame = (functionName: string) => ({ functionName, url: 'app.js', lineNumber: 1, columnNumber: 0 })

describe('prof-top', () => {
  it('counts self time and ancestors across incremental chunks and recursive stacks', () => {
    const result = profileTop({ traceEvents: [
      { name: 'ProfileChunk', pid: 1, tid: 1, id: '1', args: { data: {
        cpuProfile: { nodes: [
          { id: 1, callFrame: frame('buildWaterMask'), children: [2] },
          { id: 2, callFrame: frame('decode'), children: [3] },
          { id: 3, callFrame: frame('decode') },
        ], samples: [3] }, timeDeltas: [10_000],
      } } },
      { name: 'ProfileChunk', pid: 1, tid: 1, id: '1', args: { data: {
        cpuProfile: { nodes: [], samples: [1] }, timeDeltas: [20_000],
      } } },
      { name: 'ProfileChunk', pid: 2, tid: 1, id: '1', args: { data: {
        cpuProfile: { nodes: [{ id: 1, callFrame: frame('worker') }], samples: [1] }, timeDeltas: [5_000],
      } } },
    ] })
    expect(result.samples).toBe(3)
    expect(result.sampledMs).toBe(35)
    expect(result.functions.find((entry) => entry.functionName === 'buildWaterMask')).toMatchObject({ selfMs: 20, selfSamples: 1, stackSamples: 2, stackMs: 30 })
    expect(result.functions.find((entry) => entry.functionName === 'decode')).toMatchObject({ selfMs: 10, stackSamples: 1, stackMs: 10 })
  })

  it('rejects incomplete samples instead of reporting a false zero', () => {
    expect(() => profileTop({ traceEvents: [{ name: 'ProfileChunk', pid: 1, tid: 1, id: '1', args: {
      data: { cpuProfile: { nodes: [], samples: [99] }, timeDeltas: [10] },
    } }] })).toThrow(/ontbrekende node/)
  })
})
