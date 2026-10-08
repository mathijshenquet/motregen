import { describe, expect, it } from 'vitest'
import type { TimelineFrame } from './contract'
import { buildHourlyForecast, isPassiveRow, skyRadiationRows } from './forecast'
import { scrubberViewWindow, SCRUBBER_CURSOR_FRACTION, SCRUBBER_VIEW_HOURS } from './time-model'

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
  return { rain: [], uv: [], uvClear: [], radiation: [], temperature: [], feelsLike: [], cloud: [], windU: [], windV: [], gust: [], ...overrides }
}

describe('sky radiation rows (U62)', () => {
  const hourMs = 3_600_000
  const now = Date.parse('2026-10-08T05:18:00Z')
  const currentHour = Math.floor(now / hourMs) * hourMs
  const rows = Array.from({ length: 48 }, (_, index) => {
    const epoch = currentHour - 6 * hourMs + index * hourMs
    return { epoch, kind: epoch < currentHour ? 'past' as const : epoch === currentHour ? 'now' as const : 'future' as const }
  })
  // Wat de scrubber bij deze cursor toont: de cursor staat op een vast deel van de breedte.
  const visibleHours = (cursorEpoch: number) => {
    const from = cursorEpoch - SCRUBBER_VIEW_HOURS * hourMs * SCRUBBER_CURSOR_FRACTION
    const to = cursorEpoch + SCRUBBER_VIEW_HOURS * hourMs * (1 - SCRUBBER_CURSOR_FRACTION)
    return rows.filter((row) => row.kind !== 'past' && row.epoch >= from && row.epoch <= to).map((row) => row.epoch)
  }

  it('feeds every visible hour stop and the one just outside, wherever the cursor is', () => {
    const futureHours = new Set(rows.filter((row) => row.kind !== 'past').map((row) => row.epoch))
    for (let minutes = 0; minutes <= 30 * 60; minutes += 7) {
      const cursorEpoch = now + minutes * 60_000
      const fed = new Set(skyRadiationRows(rows, scrubberViewWindow(cursorEpoch)).map((row) => row.epoch))
      for (const visible of visibleHours(cursorEpoch)) {
        for (const epoch of [visible - hourMs, visible, visible + hourMs]) {
          if (futureHours.has(epoch)) expect(fed.has(epoch), `${new Date(epoch).toISOString()} bij cursor +${minutes} min`).toBe(true)
        }
      }
    }
  })

  it('leaves the past to the layer estimate and stays near the window', () => {
    const window = scrubberViewWindow(now + 12 * hourMs)
    const fed = skyRadiationRows(rows, window)
    expect(fed.length).toBeGreaterThan(0)
    expect(fed.every((row) => row.epoch >= window.start - hourMs && row.epoch <= window.end + hourMs)).toBe(true)
    expect(skyRadiationRows(rows, scrubberViewWindow(now))[0]!.epoch).toBe(currentHour)
  })
})
