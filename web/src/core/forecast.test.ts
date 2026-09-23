import { describe, expect, it } from 'vitest'
import type { TimelineFrame } from './contract'
import { buildHourlyForecast, isPassiveRow } from './forecast'

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
  const at = (iso: string) => Date.parse(iso)
  const hourly = (from: string, count: number, offset = 0) =>
    Array.from({ length: count }, (_, index) => frame(at(from) + index * 3_600_000 + offset))

  it('spans six history hours through the last forecast hour and marks the current hour', () => {
    const rain = hourly('2026-08-28T12:00:00Z', 30, 5 * 60_000)
    const temperature = hourly('2026-08-28T09:00:00Z', 54)
    const rows = buildHourlyForecast(timelines({ rain, temperature }), start)

    expect(rows[0]).toMatchObject({ epoch: at('2026-08-28T09:00:00Z'), kind: 'past', temperatureIndex: 0, rainIndex: null })
    expect(rows.filter((row) => row.kind === 'past')).toHaveLength(6)
    expect(rows[6]).toMatchObject({ epoch: at('2026-08-28T15:00:00Z'), kind: 'now', rainIndex: 3 })
    expect(rows.at(-1)).toMatchObject({ epoch: at('2026-08-30T14:00:00Z'), kind: 'future', temperatureIndex: 53 })
  })

  it('starts at the first hour with data and never drops the current hour', () => {
    const temperature = hourly('2026-08-28T13:00:00Z', 3)
    const rows = buildHourlyForecast(timelines({ temperature }), start)
    expect(rows.map((row) => row.kind)).toEqual(['past', 'past', 'now'])
    expect(buildHourlyForecast(timelines({}), start).map((row) => row.kind)).toEqual(['now'])
  })

  it('pairs the radiation hour ending at the row with the hour after it', () => {
    const radiation = hourly('2026-08-28T15:00:00Z', 2)
    const rows = buildHourlyForecast(timelines({ radiation, temperature: radiation }), start, 0)
    expect(rows[0]).toMatchObject({ radiationIndex: 0, radiationNextIndex: 1 })
    expect(rows[1]).toMatchObject({ radiationIndex: 1, radiationNextIndex: null })
  })

  it('loads rows beyond the passive horizon only on demand', () => {
    expect(isPassiveRow({ epoch: start + 18 * 3_600_000 } as never, start)).toBe(true)
    expect(isPassiveRow({ epoch: start + 19 * 3_600_000 } as never, start)).toBe(false)
  })
})

function timelines(overrides: Partial<Parameters<typeof buildHourlyForecast>[0]>): Parameters<typeof buildHourlyForecast>[0] {
  return { rain: [], uv: [], radiation: [], temperature: [], feelsLike: [], humidity: [], cloud: [], windU: [], windV: [], ...overrides }
}
