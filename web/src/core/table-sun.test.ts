import { describe, expect, it } from 'vitest'
import { sunEvents, type SunEvent } from './solar'
import { tableSunEvents } from './table-sun'

const HOUR = 3_600_000
const utc = (text: string) => Date.parse(text)
const hoursFrom = (start: string, count: number) => Array.from({ length: count }, (_, index) => utc(start) + index * HOUR)
/** Vaste momenten: op 07:00, onder 17:00 (UTC), elke dag. */
const fixed = (start: number, end: number): SunEvent[] => {
  const events: SunEvent[] = []
  for (let day = Math.floor(start / (24 * HOUR)) * 24 * HOUR; day < end; day += 24 * HOUR) {
    for (const [kind, at] of [['rise', 7], ['set', 17]] as const) {
      const epoch = day + at * HOUR
      if (epoch >= start && epoch < end) events.push({ kind, epoch })
    }
  }
  return events
}
const kinds = (sun: ReturnType<typeof tableSunEvents>) => [...sun.top, ...sun.hourly.values(), ...sun.spans.values()].map((event) => event.kind).sort()

describe('zonrijen in de tabel (U107 vervolg)', () => {
  it('shows a sunset just before the first row at the top and the next sunrise in the day parts (PO 19:00 case)', () => {
    // Uurrijen 17:10 … 01:10 → eerste rij net na zonsondergang 17:00; zonsopgang 07:00 valt in "ochtend".
    const hours = hoursFrom('2026-11-09T17:10:00Z', 9)
    const spans = [{ start: utc('2026-11-10T02:10:00Z'), end: utc('2026-11-10T06:00:00Z') }, { start: utc('2026-11-10T06:00:00Z'), end: utc('2026-11-10T10:00:00Z') }]
    const sun = tableSunEvents(hours, spans, fixed)
    expect(sun.top).toEqual([{ kind: 'set', epoch: utc('2026-11-09T17:00:00Z') }])
    expect(sun.hourly.size).toBe(0)
    expect([...sun.spans]).toEqual([[utc('2026-11-10T06:00:00Z'), { kind: 'rise', epoch: utc('2026-11-10T07:00:00Z') }]])
    expect(kinds(sun)).toEqual(['rise', 'set'])
  })

  it('uses the hourly rows when an event falls inside, and only the first of each kind', () => {
    const sun = tableSunEvents(hoursFrom('2026-11-09T05:00:00Z', 40), [], fixed)
    expect([...sun.hourly.values()]).toEqual([{ kind: 'rise', epoch: utc('2026-11-09T07:00:00Z') }, { kind: 'set', epoch: utc('2026-11-09T17:00:00Z') }])
    expect(sun.top).toEqual([])
  })

  it('prefers the nearer side when an event lies both before and after the hourly block', () => {
    // 08:00 … 16:00: zonsopgang 07:00 net ervóór (1 u), zonsondergang 17:00 net erna in de dagdelen (0 u).
    const sun = tableSunEvents(hoursFrom('2026-11-09T08:00:00Z', 9), [{ start: utc('2026-11-09T17:00:00Z'), end: utc('2026-11-09T23:00:00Z') }], fixed)
    expect(sun.top).toEqual([{ kind: 'rise', epoch: utc('2026-11-09T07:00:00Z') }])
    expect([...sun.spans.values()]).toEqual([{ kind: 'set', epoch: utc('2026-11-09T17:00:00Z') }])
  })

  it('always has exactly one of each with real sun times for Utrecht, whatever hour the table starts', () => {
    const find = (start: number, end: number) => sunEvents(start, end, 5.12, 52.09)
    for (let start = utc('2026-11-09T00:00:00Z'); start < utc('2026-11-10T00:00:00Z'); start += HOUR) {
      const hours = Array.from({ length: 8 }, (_, index) => start + index * HOUR)
      const end = hours.at(-1)! + HOUR
      const spans = Array.from({ length: 12 }, (_, index) => ({ start: end + index * 4 * HOUR, end: end + (index + 1) * 4 * HOUR }))
      expect(kinds(tableSunEvents(hours, spans, find))).toEqual(['rise', 'set'])
    }
  })

  it('shows nothing without hourly rows', () => {
    expect(tableSunEvents([], [], fixed)).toEqual({ hourly: new Map(), top: [], spans: new Map() })
  })
})
