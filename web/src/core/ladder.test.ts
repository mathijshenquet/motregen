import { describe, expect, it } from 'vitest'
import { localTime } from './days'
import { aggregateSteps, buildLadder, buildSlotRows, hourlyEnd, type Interval, type LadderSlot } from './ladder'

const hour = 3_600_000
const at = (iso: string) => Date.parse(iso)
const hours = (slot: Pick<LadderSlot, 'start' | 'end'>) => (slot.end - slot.start) / hour
const summary = (slots: LadderSlot[]) => slots.map((slot) => `${slot.date} ${slot.grain} ${slot.label} ${slot.range}`.trim())

/** ECMWF-achtige stappen in UTC: elke `size` uur vanaf `from`. */
function steps(from: string, count: number, size = 3): Interval[] {
  return Array.from({ length: count }, (_, index) => ({ start: at(from) + index * size * hour, end: at(from) + (index + 1) * size * hour }))
}

describe('table ladder', () => {
  it('goes hourly for twelve hours, then 3 h to the end of tomorrow, day parts for two days, then day and night to day 10', () => {
    const now = at('2026-10-17T11:00:00Z') // 13:00 lokaal
    expect(hourlyEnd(now)).toBe(localTime('2026-10-18', 3))
    const slots = buildLadder(now)
    expect(summary(slots).slice(0, 8)).toEqual([
      '2026-10-18 3h 03–06', '2026-10-18 3h 06–09', '2026-10-18 3h 09–12', '2026-10-18 3h 12–15',
      '2026-10-18 3h 15–18', '2026-10-18 3h 18–21', '2026-10-18 3h 21–24', '2026-10-19 part Nacht 00–06',
    ])
    expect(summary(slots).slice(11, 18)).toEqual([
      '2026-10-20 part Nacht 00–06', '2026-10-20 part Ochtend 06–12', '2026-10-20 part Middag 12–18', '2026-10-20 part Avond 18–24',
      '2026-10-21 night Nacht 00–06', '2026-10-21 day Dag 06–18', '2026-10-21 night Nacht 18–06',
    ])
    expect(summary(slots).at(-1)).toBe('2026-10-26 night Nacht 18–06')
    // Aaneengesloten: geen gat en geen overlap tussen de rijen.
    for (let index = 1; index < slots.length; index++) expect(slots[index]!.start).toBe(slots[index - 1]!.end)
  })

  it('keeps the local clock across the autumn change: a 4-hour block and a 13-hour night', () => {
    const slots = buildLadder(at('2026-10-24T10:00:00Z'))
    const early = slots.find((slot) => slot.date === '2026-10-25' && slot.label === '00–03')!
    expect(early).toMatchObject({ start: at('2026-10-24T22:00:00Z'), end: at('2026-10-25T02:00:00Z') })
    expect(hours(early)).toBe(4)
    const night = buildLadder(at('2026-10-20T10:00:00Z')).find((slot) => slot.date === '2026-10-24' && slot.grain === 'night' && slot.range === '18–06')!
    expect(night).toMatchObject({ start: at('2026-10-24T16:00:00Z'), end: at('2026-10-25T05:00:00Z') })
    expect(hours(night)).toBe(13)
  })

  it('keeps the local clock across the spring change: a 5-hour night part', () => {
    const slots = buildLadder(at('2026-03-27T10:00:00Z'))
    const night = slots.find((slot) => slot.date === '2026-03-29' && slot.label === 'Nacht')!
    expect(night).toMatchObject({ start: at('2026-03-28T23:00:00Z'), end: at('2026-03-29T04:00:00Z') })
    expect(hours(night)).toBe(5)
    expect(hours(slots.find((slot) => slot.date === '2026-03-29' && slot.label === 'Ochtend')!)).toBe(6)
  })

  it('crosses midnight between two 3-hour rows and puts the day heading on the first row of the new day', () => {
    const now = at('2026-10-17T05:00:00Z') // 07:00 lokaal
    const slots = buildLadder(now)
    expect(summary(slots).slice(0, 2)).toEqual(['2026-10-17 3h 21–24', '2026-10-18 3h 00–03'])
    expect(slots[0]!.end).toBe(localTime('2026-10-18', 0))
    const rows = buildSlotRows(now, slots.slice(0, 3), { harmonieEpochs: Array.from({ length: 60 }, (_, index) => at('2026-10-17T03:00:00Z') + index * hour) })
    expect(rows.map((row) => row.heading)).toEqual([undefined, 'Morgen', undefined])
    expect(rows.every((row) => row.source === 'harmonie' && row.values === undefined)).toBe(true)
  })
})

describe('slot sources', () => {
  const now = at('2026-10-17T11:00:00Z')
  // HARMONIE tot maandag 07 UTC (09 lokaal); ECMWF in stappen van 3 u vanaf zaterdag 00 UTC.
  const harmonieEpochs = Array.from({ length: 53 }, (_, index) => at('2026-10-17T03:00:00Z') + index * hour)
  const intervals = steps('2026-10-17T00:00:00Z', 48)
  const constant = (value: number) => intervals.map(() => value)

  it('takes a window from HARMONIE only when HARMONIE covers all of it, else from the ECMWF steps', () => {
    const slots = buildLadder(now).filter((slot) => slot.date === '2026-10-19')
    const rows = buildSlotRows(now, slots, { harmonieEpochs, steps: { intervals } })
    // Nacht 00–06 (22–04 UTC) ligt binnen HARMONIE; de ochtend loopt tot 10 UTC en HARMONIE stopt om 07.
    expect(rows.map((row) => `${row.slot.label} ${row.source}`)).toEqual(['Nacht harmonie', 'Ochtend ecmwf', 'Middag ecmwf', 'Avond ecmwf'])
    expect(rows[0]!.heading).toBe('maandag 19')
  })

  it('aggregates loaded steps and puts the chance of rain only on day rows', () => {
    const slots = buildLadder(now).filter((slot) => slot.date === '2026-10-21')
    const rows = buildSlotRows(now, slots, {
      harmonieEpochs,
      steps: { intervals, values: { step_tmax_c: constant(12), step_tmin_c: constant(6), step_precip_mm: constant(1.5), step_cloud: constant(80), step_wind_u_ms: constant(4), step_wind_v_ms: constant(0) } },
      days: { dates: ['2026-10-21'], values: { day_precip_prob: [70] } },
    })
    expect(rows.map((row) => row.slot.grain)).toEqual(['night', 'day', 'night'])
    expect(rows[1]!.values).toMatchObject({ tmax: 12, tmin: 6, cloud: 80, precipProb: 70, windMs: 4, windFromDegrees: 270 })
    expect(rows[1]!.values!.precipMm).toBeCloseTo(6) // 12 uur × 1,5 mm per 3 u
    expect(rows[0]!.values!.precipProb).toBeNull()
  })

  it('shows only day rows from the day fields while there are no steps, and drops what has no source', () => {
    const slots = buildLadder(now).filter((slot) => slot.date === '2026-10-22')
    const rows = buildSlotRows(now, slots, { harmonieEpochs, days: { dates: ['2026-10-22'], values: { day_tmax_c: [15], day_precip_prob: [40] } } })
    expect(rows.map((row) => row.slot.grain)).toEqual(['day'])
    expect(rows[0]!.values).toMatchObject({ tmax: 15, precipProb: 40, tmin: null })
  })
})

describe('step aggregation', () => {
  it('splits rain by overlap and reads wind and cloud at the step ends inside the window', () => {
    const intervals = steps('2026-10-19T03:00:00Z', 3) // 03–06, 06–09, 09–12 UTC
    const window = { start: at('2026-10-19T04:00:00Z'), end: at('2026-10-19T10:00:00Z') } // ochtend 06–12 lokaal
    const values = aggregateSteps(intervals, {
      step_precip_mm: [3, 3, 3],
      step_tmax_c: [9, 14, 11],
      step_tmin_c: [5, 7, 8],
      step_gust_ms: [10, 18, 12],
      step_wind_u_ms: [0, 3, 0],
      step_wind_v_ms: [6, 0, 9],
      step_cloud: [10, 40, 100],
    }, window)
    expect(values.precipMm).toBeCloseTo(2 + 3 + 1)
    expect(values).toMatchObject({ tmax: 14, tmin: 5, gustMs: 18 })
    // Stapeinden 06 en 09 UTC vallen in het venster, 12 UTC niet.
    expect(values.windMs).toBeCloseTo(6)
    expect(values.windFromDegrees).toBeCloseTo(180)
    expect(values.cloud).toBe(25)
  })

  it('falls back to the step end nearest the middle when a 6-hour step leaves none inside', () => {
    const intervals = steps('2026-10-25T00:00:00Z', 3, 6) // 00–06, 06–12, 12–18 UTC
    const values = aggregateSteps(intervals, { step_cloud: [10, 60, 90], step_wind_u_ms: [1, 2, 3], step_wind_v_ms: [0, 0, 0] }, { start: at('2026-10-25T09:00:00Z'), end: at('2026-10-25T11:00:00Z') })
    expect(values.cloud).toBe(60)
    expect(values.windMs).toBe(2)
    expect(values.precipMm).toBeNull()
  })
})
