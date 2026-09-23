import { describe, expect, it } from 'vitest'
import type { Manifest, ManifestChunk } from './contract'
import { ageMs, formatAge, formatAgeShort, formatClock, freshnessStatus, latestRadarEpoch, sourceFreshness, STATUS_LABELS } from './freshness'

const chunk = (source: ManifestChunk['source'], run: string, times: string[], field?: ManifestChunk['field']): ManifestChunk =>
  ({ url: `chunks/${source}-${run}.mrf`, source, field, run, header_len: 100, times })

const manifest: Manifest = {
  version: 0,
  generated: '2026-09-23T14:27:52Z',
  now: '2026-09-23T14:25:00Z',
  chunks: [
    chunk('rtcor', '2026-09-23T13:00:00Z', ['2026-09-23T13:00:00Z', '2026-09-23T13:55:00Z']),
    chunk('rtcor', '2026-09-23T14:00:00Z', ['2026-09-23T14:00:00Z', '2026-09-23T14:25:00Z']),
    chunk('nowcast', '2026-09-23T14:25:00Z', ['2026-09-23T14:25:00Z', '2026-09-23T16:25:00Z']),
    chunk('seamless', '2026-09-23T14:15:00Z', ['2026-09-23T16:20:00Z']),
    chunk('harmonie', '2026-09-23T08:00:00Z', ['2026-09-23T09:00:00Z'], 'temp_c'),
    chunk('harmonie', '2026-09-23T11:00:00Z', ['2026-09-23T12:00:00Z'], 'temp_c'),
    chunk('uv', '2026-09-23T14:13:12Z', ['2026-09-23T13:45:00Z'], 'uv'),
  ],
}
const at = (iso: string) => Date.parse(iso)
const minutes = (n: number) => n * 60_000

describe('freshness', () => {
  it('takes the last radar measurement and the newest run of every other source, in a fixed order', () => {
    expect(sourceFreshness(manifest).map((row) => [row.source, new Date(row.epoch).toISOString(), row.kind])).toEqual([
      ['rtcor', '2026-09-23T14:25:00.000Z', 'measured'],
      ['nowcast', '2026-09-23T14:25:00.000Z', 'run'],
      ['seamless', '2026-09-23T14:15:00.000Z', 'run'],
      ['harmonie', '2026-09-23T11:00:00.000Z', 'run'],
      ['uv', '2026-09-23T14:13:12.000Z', 'run'],
    ])
    expect(latestRadarEpoch(manifest)).toBe(at('2026-09-23T14:25:00Z'))
  })

  it('leaves out sources the manifest does not carry', () => {
    const radarOnly = { ...manifest, chunks: manifest.chunks.slice(0, 2) }
    expect(sourceFreshness(radarOnly).map((row) => row.source)).toEqual(['rtcor'])
    expect(latestRadarEpoch({ ...manifest, chunks: [] })).toBeUndefined()
  })

  it('classifies radar age: fresh up to 10 min, aging up to 20, stale beyond', () => {
    const radar = at('2026-09-23T14:25:00Z')
    const checked = { checkedAt: radar }
    expect(freshnessStatus(radar, radar + minutes(3), checked)).toBe('fresh')
    expect(freshnessStatus(radar, radar + minutes(10), checked)).toBe('fresh')
    expect(freshnessStatus(radar, radar + minutes(10) + 1, checked)).toBe('aging')
    expect(freshnessStatus(radar, radar + minutes(20), checked)).toBe('aging')
    expect(freshnessStatus(radar, radar + minutes(20) + 1, checked)).toBe('stale')
    expect(freshnessStatus(undefined, radar, checked)).toBe('stale')
  })

  it('a failed refresh is its own status, whatever the age', () => {
    const radar = at('2026-09-23T14:25:00Z')
    expect(freshnessStatus(radar, radar + minutes(1), { checkedAt: radar, failedAt: radar + minutes(1) })).toBe('offline')
    expect(STATUS_LABELS.offline).toBe('Offline')
  })

  it('clamps a device clock running behind the server to zero age', () => {
    expect(ageMs(1_000, 400)).toBe(0)
    expect(freshnessStatus(1_000, 400, undefined)).toBe('fresh')
  })

  it('formats ages in Dutch, long and short', () => {
    expect(formatAge(minutes(0.5))).toBe('zojuist')
    expect(formatAge(minutes(3))).toBe('3 min geleden')
    expect(formatAge(minutes(60))).toBe('1 u geleden')
    expect(formatAge(minutes(213))).toBe('3 u 33 min geleden')
    expect(formatAge(minutes(60 * 24))).toBe('1 dag geleden')
    expect(formatAge(minutes(60 * 24 * 26 + 5))).toBe('26 dagen geleden')
    expect(formatAgeShort(minutes(0.9))).toBe('zojuist')
    expect(formatAgeShort(minutes(8.3))).toBe('8 min')
    expect(formatAgeShort(minutes(213))).toBe('3 u')
    expect(formatAgeShort(minutes(60 * 24 * 3))).toBe('3 d')
  })

  it('shows only the time for today and adds the day otherwise', () => {
    const noon = new Date(2026, 8, 23, 12, 0).getTime()
    expect(formatClock(new Date(2026, 8, 23, 9, 5).getTime(), noon)).toBe('09:05')
    expect(formatClock(new Date(2026, 8, 20, 9, 5).getTime(), noon)).toMatch(/20 sep.* 09:05$/)
  })
})
