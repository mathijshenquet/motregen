import { describe, expect, it } from 'vitest'
import type { Source, TimelineFrame } from './contract'
import { CLOCK_JOG_MS_PER_PX, clockKeyCursor, jogCursor, sourceStrip, stripEpochAtPosition, stripPositionAtEpoch } from './clock-timeline'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const start = Date.parse('2026-10-07T10:00:00Z')

function frames(source: Source, fromMinutes: number, toMinutes: number, stepMinutes: number): TimelineFrame[] {
  const result: TimelineFrame[] = []
  for (let offset = fromMinutes; offset <= toMinutes; offset += stepMinutes) {
    const epoch = start + offset * MINUTE
    const time = new Date(epoch).toISOString()
    result.push({ time, epoch, source, run: time, chunk: { url: `${source}.mrf`, source, run: time, header_len: 1, times: [time] }, frameIndex: 0 })
  }
  return result
}

// Radar 2 u per 5 min, nowcast 2 u per 5 min, blend tot +6 u per kwartier, HARMONIE tot +48 u per uur.
const timeline = [
  ...frames('rtcor', 0, 120, 5),
  ...frames('nowcast', 125, 240, 5),
  ...frames('seamless', 255, 480, 15),
  ...frames('harmonie', 540, 50 * 60, 60),
]
const lastCursor = timeline.length - 1

describe('clock jog', () => {
  it('moves two minutes per pixel, later to the right, in fractional cursor units', () => {
    expect(CLOCK_JOG_MS_PER_PX).toBe(2 * MINUTE)
    expect(jogCursor(timeline, start + HOUR, 0)).toBe(12)
    expect(jogCursor(timeline, start + HOUR, 10)).toBe(16)
    expect(jogCursor(timeline, start + HOUR, -5)).toBe(10)
    expect(jogCursor(timeline, start + HOUR, 1)).toBeCloseTo(12.4)
  })

  it('follows the widening frame steps of the later sources', () => {
    // 60 px = 2 u: van het laatste radarframe tot het einde van de nowcast.
    expect(timeline[Math.round(jogCursor(timeline, start + 2 * HOUR, 60))]!.epoch).toBe(start + 4 * HOUR)
    // In HARMONIE is een uur één frame: 30 px.
    const harmonieStart = timeline.findIndex((frame) => frame.source === 'harmonie')
    expect(jogCursor(timeline, timeline[harmonieStart]!.epoch, 30)).toBe(harmonieStart + 1)
  })

  it('stops at both ends of the timeline and accepts another scale', () => {
    expect(jogCursor(timeline, start + HOUR, -10_000)).toBe(0)
    expect(jogCursor(timeline, start + HOUR, 10_000)).toBe(lastCursor)
    expect(jogCursor(timeline, start, 4, 5 * MINUTE)).toBe(4)
    expect(jogCursor([], start, 10)).toBe(0)
  })

  it('steps with the same keys as the scrubber', () => {
    expect(clockKeyCursor('ArrowRight', 3, lastCursor)).toBe(4)
    expect(clockKeyCursor('ArrowDown', 3, lastCursor)).toBe(2)
    expect(clockKeyCursor('PageUp', 3, lastCursor)).toBe(9)
    expect(clockKeyCursor('PageDown', 3, lastCursor)).toBe(0)
    expect(clockKeyCursor('End', 3, lastCursor)).toBe(lastCursor)
    expect(clockKeyCursor('Home', 3, lastCursor)).toBe(0)
    expect(clockKeyCursor('ArrowRight', lastCursor, lastCursor)).toBe(lastCursor)
    expect(clockKeyCursor('Enter', 3, lastCursor)).toBeUndefined()
  })
})

describe('source strip', () => {
  const zones = sourceStrip(timeline)

  it('splits the timeline into radar, nowcast (with the blend) and HARMONIE, edge to edge', () => {
    expect(zones.map((zone) => [zone.key, zone.label, zone.kind])).toEqual([
      ['radar', 'Radar', 'observations'],
      ['nowcast', 'Nowcast', 'forecast'],
      ['harmonie', 'HARMONIE', 'forecast'],
    ])
    expect(zones[0]!.startEpoch).toBe(start)
    // Grenzen halverwege twee frames, zoals de regimes in de scrubber.
    expect(zones[0]!.endEpoch).toBe(start + 122.5 * MINUTE)
    expect(zones[1]!.endEpoch).toBe(start + 8.5 * HOUR)
    expect(zones[2]!.endEpoch).toBe(start + 50 * HOUR)
    expect(zones[0]!.start).toBe(0)
    expect(zones[2]!.end).toBe(100)
    for (let index = 1; index < zones.length; index++) {
      expect(zones[index]!.start).toBe(zones[index - 1]!.end)
      expect(zones[index]!.startEpoch).toBe(zones[index - 1]!.endEpoch)
    }
  })

  it('keeps the short zones readable next to sixty hours of model', () => {
    const widths = zones.map((zone) => zone.end - zone.start)
    expect(widths[0]).toBeGreaterThan(15)
    expect(widths[1]).toBeGreaterThan(15)
    expect(widths[2]).toBeGreaterThan(widths[1]!)
  })

  it('maps time to position and back, linearly inside a zone', () => {
    const radar = zones[0]!
    expect(stripPositionAtEpoch(zones, start + HOUR)).toBeCloseTo(radar.end * 60 / 122.5)
    for (const epoch of [start, start + 90 * MINUTE, start + 3 * HOUR, start + 20 * HOUR, start + 50 * HOUR]) {
      expect(stripEpochAtPosition(zones, stripPositionAtEpoch(zones, epoch))).toBeCloseTo(epoch, 3)
    }
    expect(stripPositionAtEpoch(zones, start - HOUR)).toBe(0)
    expect(stripPositionAtEpoch(zones, start + 99 * HOUR)).toBe(100)
    expect(stripEpochAtPosition(zones, -20)).toBe(start)
    expect(stripEpochAtPosition(zones, 140)).toBe(start + 50 * HOUR)
  })

  it('leaves out a zone without frames and an empty timeline', () => {
    const withoutNowcast = [...frames('rtcor', 0, 60, 5), ...frames('harmonie', 120, 600, 60)]
    expect(sourceStrip(withoutNowcast).map((zone) => zone.key)).toEqual(['radar', 'harmonie'])
    expect(sourceStrip([])).toEqual([])
    expect(sourceStrip(frames('rtcor', 0, 0, 5))).toEqual([])
    expect(stripPositionAtEpoch([], start)).toBe(0)
    expect(stripEpochAtPosition([], 50)).toBe(0)
  })
})
