import { describe, expect, it } from 'vitest'
import { validateChromeTrace } from './prof-check'

describe('profile checker', () => {
  it('accepts a measures-only trace', () => {
    expect(validateChromeTrace({ traceEvents: [
      { cat: 'motregen.phase', name: 'wind-step', ph: 'X', pid: 1, tid: 1, ts: 10, dur: 5, args: {} },
    ] })).toEqual({ events: 1, measures: 1, samples: 0 })
  })

  it('rejects samples without a matching node', () => {
    expect(() => validateChromeTrace({ traceEvents: [
      { cat: 'x', name: 'Profile', ph: 'P', pid: 1, tid: 1, ts: 0, id: '1', args: {} },
      { cat: 'x', name: 'ProfileChunk', ph: 'P', pid: 1, tid: 1, ts: 1, id: '1', args: { data: { cpuProfile: { nodes: [], samples: [2] }, timeDeltas: [1] } } },
    ] })).toThrow(/sample verwijst niet/)
  })
})
