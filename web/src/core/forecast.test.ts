import { describe, expect, it } from 'vitest'
import type { TimelineFrame } from './contract'
import { buildHourlyForecast } from './forecast'

const start = Date.parse('2026-08-28T15:20:00Z')

function frame(epoch: number): TimelineFrame {
  const time = new Date(epoch).toISOString()
  return {
    time,
    epoch,
    source: 'harmonie',
    run: time,
    frameIndex: 0,
    chunk: { url: time, source: 'harmonie', run: time, header_len: 8, times: [time] },
  }
}

describe('hourly forecast', () => {
  it('selects the next 24 whole hours and joins both fields by nearest time', () => {
    const rain = Array.from({ length: 25 }, (_, index) => frame(Date.parse('2026-08-28T16:00:00Z') + index * 3_600_000 + 5 * 60_000))
    const radiation = Array.from({ length: 24 }, (_, index) => frame(Date.parse('2026-08-28T16:00:00Z') + index * 3_600_000))
    const uv = Array.from({ length: 8 }, (_, index) => frame(Date.parse('2026-08-28T15:45:00Z') + index * 15 * 60_000))
    const rows = buildHourlyForecast(rain, radiation, uv, start)

    expect(rows).toHaveLength(24)
    expect(rows[0]).toEqual({ epoch: Date.parse('2026-08-28T16:00:00Z'), rainIndex: 0, radiationIndex: 0, uvIndex: 1 })
    expect(rows[23]?.radiationIndex).toBe(23)
  })

  it('leaves unavailable radiation empty without hiding rain', () => {
    const rain = [frame(Date.parse('2026-08-28T16:00:00Z'))]
    expect(buildHourlyForecast(rain, [], [], start, 1)).toEqual([
      { epoch: Date.parse('2026-08-28T16:00:00Z'), rainIndex: 0, radiationIndex: null, uvIndex: null },
    ])
  })
})
