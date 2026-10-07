import { describe, expect, it } from 'vitest'
import { distribution, fidelityComparison, summarizeReference } from './mobile-fidelity'

describe('PO-opnames vergelijken', () => {
  it('ankert absolute timestamps zonder metadata op tijd nul mee te tellen', () => {
    const summary = summarizeReference({ traceEvents: [
      { cat: '__metadata', name: 'process_name', ts: 0 },
      { cat: 'motregen.phase', name: 'frame-decode', ts: 1_791_367_200_000_000, dur: 10_000 },
      { cat: 'motregen.phase', name: 'frame-decode', ts: 1_791_367_202_000_000, dur: 30_000 },
    ] })
    expect(summary.decodesPerSecond.slice(0, 3)).toEqual([1, 0, 1])
    expect(summary.phases['frame-decode']).toEqual({ count: 2, totalMs: 40, p50Ms: 10, p95Ms: 30 })
    expect(summary.encodedBodyBytes).toBeNull()
  })

  it('rapporteert ontbrekende fasen en nulreferenties zonder verzonnen delta', () => {
    const empty = summarizeReference({ traceEvents: [{ cat: '__metadata', name: 'Profile', ts: 1 }] })
    const reference = summarizeReference({ traceEvents: [{ cat: 'motregen.phase', name: 'wind-step', ts: 1, dur: 0 }] })
    expect(fidelityComparison(empty, reference)['wind-step']).toEqual({ countDeltaPercent: null, p50DeltaPercent: null, p95DeltaPercent: null })
    expect(distribution([])).toEqual({ count: 0, totalMs: 0, p50Ms: null, p95Ms: null })
  })
})
