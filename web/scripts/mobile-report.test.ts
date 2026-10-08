import { describe, expect, it } from 'vitest'
import { compareBaseline, completedBytesBefore, reconcileWire, repetitionSpread, requestsStartedWithin, resourceKind, smoothness, summarizePhases, wireWindow, type MobileBaseline, type WireRequest } from './mobile-report'

const baseline: MobileBaseline = { schema: 1, profile: 'mobile-4g', scenario: 'koud', sourceSha: 'abc', capturedAt: '2026-10-07', contractHash: 'fixed', regressionLimitPercent: 10, wireBytes: 1_000, decodes: 100 }
const request: WireRequest = { url: '/data/chunks/rain.mrf', startMs: 10, endMs: 100, encodedBodyBytes: 1_000, range: 'bytes=0-999', status: 206, failure: null }

describe('mobiele rapportage', () => {
  it('selecteert dezelfde requests als native fetch-start vóór de netwerk-start op de grens ligt', () => {
    const inside = { ...request, startMs: 29_980, endMs: 30_040 }
    const outside = { ...request, startMs: 30_010, endMs: 30_050 }
    const nativeInside = { ...inside, startMs: 29_960, encodedBodyBytes: 1_000 }
    const nativeOutside = { ...outside, startMs: 29_993, encodedBodyBytes: 1_000 }
    const selected = wireWindow([inside, outside], [nativeInside, nativeOutside], 30_000)
    expect(selected).toEqual({ requests: [inside], timing: [nativeInside] })
    expect(reconcileWire(selected.requests, selected.timing).findings).toEqual([])
    const missing = wireWindow([inside], [nativeInside, nativeOutside], 30_000)
    expect(reconcileWire(missing.requests, missing.timing).findings.length).toBeGreaterThan(0)
    const missingBody = wireWindow([{ ...inside, encodedBodyBytes: null }], [nativeInside], 30_000)
    expect(reconcileWire(missingBody.requests, missingBody.timing).findings).toContain('Onvolledige response: /data/chunks/rain.mrf (bodygrootte onbekend)')
  })
  it('meet de hele body van een request dat binnen de meetduur begint en erna eindigt', () => {
    const crossing = { ...request, startMs: 29_990, endMs: 30_040, encodedBodyBytes: 1_000 }
    const selected = requestsStartedWithin([crossing, { ...request, startMs: 30_001 }, { ...request, startMs: -1 }], 30_000)
    expect(selected).toEqual([crossing])
    expect(reconcileWire(selected, [crossing]).findings).toEqual([])
    expect(completedBytesBefore(selected, 30_000)).toBe(0)
    expect(reconcileWire([{ ...crossing, encodedBodyBytes: null }], [crossing]).findings).toContain('Onvolledige response: /data/chunks/rain.mrf (bodygrootte onbekend)')
  })
  it('telt PMTiles-ranges bij kaartbytes', () => {
    expect(resourceKind('/data/basemap/nl-0123456789abcdef.pmtiles')).toBe('tiles')
  })
  it('houdt bodies, ranges, categorieën en een strikte 2%-bevinding uit elkaar', () => {
    const equal = reconcileWire([request], [{ ...request, endMs: 100, encodedBodyBytes: 1_000 }])
    expect(equal.playwright.chunks).toEqual({ requests: 1, bytes: 1_000, meanRequestBytes: 1_000 })
    expect(equal.findings).toEqual([])
    const mismatch = reconcileWire([request], [{ ...request, endMs: 100, encodedBodyBytes: 1_021 }])
    expect(mismatch.findings).toHaveLength(3)
    expect(reconcileWire([request], [{ ...request, endMs: 100, encodedBodyBytes: 1_020 }]).findings).toEqual([])
  })

  it('laat tegengestelde bodyfouten elkaar niet wegmiddelen in het totaal', () => {
    const other = { ...request, url: '/data/chunks/cloud.mrf' }
    const result = reconcileWire([request, other], [
      { ...request, endMs: 100, encodedBodyBytes: 1_100 },
      { ...other, endMs: 100, encodedBodyBytes: 900 },
    ])
    expect(result.playwright.total.bytes).toBe(result.resourceTiming.total.bytes)
    expect(result.findings).toHaveLength(2)
  })

  it('telt bij mijlpalen uitsluitend voltooide responses en bewaart ontbrekende metingen', () => {
    expect(completedBytesBefore([request], 99)).toBe(0)
    expect(completedBytesBefore([request], 100)).toBe(1_000)
    expect(completedBytesBefore([request], null)).toBeNull()
    expect(reconcileWire([{ ...request, endMs: null, encodedBodyBytes: null }], []).findings).toContain('Onvolledige response: /data/chunks/rain.mrf (bodygrootte onbekend)')
  })

  it('bewaart een transportabort na een onafhankelijk bevestigde complete body', () => {
    const complete = { ...request, failure: 'net::ERR_ABORTED', contentLength: 1_000 }
    const report = reconcileWire([complete], [{ ...request, endMs: 100, encodedBodyBytes: 1_000 }])
    expect(report.findings).toEqual([])
    expect(report.completeBodyAborts).toBe(1)
    expect(reconcileWire([{ ...complete, encodedBodyBytes: 500 }], []).findings.some((finding) => finding.startsWith('Onvolledige'))).toBe(true)
  })

  it('sluit decodes buiten de meetduur uit en splitst veldkosten en secondehistogrammen', () => {
    const report = summarizePhases([
      { phase: 'frame-decode', startTime: 200, duration: 10, detail: { field: 'rain_rate' } },
      { phase: 'frame-decode', startTime: 1_100, duration: 20, detail: { field: 'cloud_low' } },
      { phase: 'frame-decode', startTime: 1_999, duration: 10 },
    ], 2_000)
    expect(report.decodesPerSecond).toEqual([1, 1])
    expect(report.fields.rain_rate!.count).toBe(1)
    expect(report.phases['frame-decode']!.count).toBe(2)
  })

  it('geeft rood op elk van beide regressiematen, met een grens uit de baseline', () => {
    expect(compareBaseline({ ...baseline, wireBytes: 1_100, decodes: 110 }, baseline).passed).toBe(true)
    expect(compareBaseline({ ...baseline, wireBytes: 1_101 }, baseline).passed).toBe(false)
    expect(compareBaseline({ ...baseline, decodes: 111 }, baseline).passed).toBe(false)
    expect(compareBaseline({ ...baseline, wireBytes: 0 }, { ...baseline, wireBytes: 0 }).passed).toBe(true)
    expect(compareBaseline(baseline, { ...baseline, wireBytes: 0 }).passed).toBe(false)
    expect(() => compareBaseline({ ...baseline, contractHash: 'changed' }, baseline)).toThrow(/meetcontract/)
  })

  it('maakt de determinismegrens controleerbaar in plaats van afronden naar groen', () => {
    expect(repetitionSpread([100, 100, 100])).toBe(0)
    expect(repetitionSpread([100, 103, 106])).toBeGreaterThan(5)
    expect(repetitionSpread([0, 0, 0])).toBe(0)
  })
})

describe('soepelheid per venster', () => {
  it('telt frame-tijden alleen binnen het venster en meldt de uitschieters', () => {
    // Vier nette beelden, één hapering van 120 ms, en beelden buiten het venster die niet meetellen.
    const frameTimes = [900, 1_000, 1_016, 1_032, 1_048, 1_168, 1_184, 2_500]
    const longFrames = [{ startTime: 950, duration: 80, blockingDuration: 30 }, { startTime: 1_048, duration: 120, blockingDuration: 70 }, { startTime: 1_100, duration: 60, blockingDuration: 10 }]
    expect(smoothness(frameTimes, { name: 'test', fromMs: 1_000, toMs: 1_200 }, longFrames)).toEqual({ name: 'test', frames: 6, p50Ms: 16, p95Ms: 120, maxMs: 120, over50Ms: 1, over100Ms: 1, longFrames: { count: 2, totalMs: 180, blockingMs: 80 } })
  })

  it('geeft lege waarden zonder beelden in het venster', () => {
    expect(smoothness([10, 20], { name: 'leeg', fromMs: 100, toMs: 200 })).toEqual({ name: 'leeg', frames: 0, p50Ms: null, p95Ms: null, maxMs: null, over50Ms: 0, over100Ms: 0, longFrames: { count: 0, totalMs: 0, blockingMs: 0 } })
  })
})
