import { describe, expect, it } from 'vitest'
import { localTime } from './days'
import { sunEvents } from './solar'
import { aggregateSteps, buildLadder, buildSlotRows, hourlyEnd, type Interval, type LadderSlot } from './ladder'

const hour = 3_600_000
const at = (iso: string) => Date.parse(iso)
const hours = (slot: Pick<LadderSlot, 'start' | 'end'>) => (slot.end - slot.start) / hour
const summary = (slots: LadderSlot[]) => slots.map((slot) => `${slot.date} ${slot.grain} ${slot.label} ${slot.range}`.trim())

/** ECMWF-achtige stappen in UTC: elke `size` uur vanaf `from`. */
function steps(from: string, count: number, size = 3): Interval[] {
  return Array.from({ length: count }, (_, index) => ({ start: at(from) + index * size * hour, end: at(from) + (index + 1) * size * hour }))
}

const utrecht = { lng: 5.12, lat: 52.09 }

describe('table ladder', () => {
  it('goes hourly through the next sunrise and sunset, then day parts through tomorrow, then calendar days to day 10', () => {
    const now = at('2026-10-17T11:00:00Z') // 13:00 lokaal; zon onder ±18:40, zon op morgen ±08:10
    expect(hourlyEnd(now, utrecht)).toBe(localTime('2026-10-18', 9))
    const slots = buildLadder(now, utrecht)
    expect(summary(slots).slice(0, 6)).toEqual([
      '2026-10-18 part Ochtend 09–12', '2026-10-18 part Middag 12–18', '2026-10-18 part Avond 18–24', '2026-10-18 part Nacht 00–06',
      '2026-10-19 day Dag 06–24', '2026-10-20 day Dag 00–24',
    ])
    expect(summary(slots).at(-1)).toBe('2026-10-26 day Dag 00–24')
    // Aaneengesloten: geen gat en geen overlap tussen de rijen.
    for (let index = 1; index < slots.length; index++) expect(slots[index]!.start).toBe(slots[index - 1]!.end)
  })

  it('before sunrise ends the hours after today\'s sunset; each night follows its evening', () => {
    const now = at('2026-10-17T05:00:00Z') // 07:00 lokaal
    expect(hourlyEnd(now, utrecht)).toBe(localTime('2026-10-17', 19))
    const slots = buildLadder(now, utrecht)
    expect(summary(slots).slice(0, 7)).toEqual([
      '2026-10-17 part Avond 19–24', '2026-10-17 part Nacht 00–06', '2026-10-18 part Ochtend 06–12', '2026-10-18 part Middag 12–18',
      '2026-10-18 part Avond 18–24', '2026-10-18 part Nacht 00–06', '2026-10-19 day Dag 06–24',
    ])
    expect(slots[1]).toMatchObject({ start: localTime('2026-10-18', 0), end: localTime('2026-10-18', 6) })
  })

  it('counts the sunrise of the current hour, as the table does with its sun rows', () => {
    const rise = sunEvents(at('2026-10-17T00:00:00Z'), at('2026-10-18T00:00:00Z'), utrecht.lng, utrecht.lat).find((event) => event.kind === 'rise')!
    const sameHour = Math.floor(rise.epoch / hour) * hour + 50 * 60_000
    expect(sameHour).toBeGreaterThan(rise.epoch)
    expect(hourlyEnd(sameHour, utrecht)).toBe(localTime('2026-10-17', 19))
  })

  it('keeps calendar days across the clock changes: 25 hours in autumn, 23 in spring', () => {
    const autumn = buildLadder(at('2026-10-22T10:00:00Z'), utrecht).find((slot) => slot.date === '2026-10-25')!
    expect(autumn).toMatchObject({ grain: 'day', start: at('2026-10-24T22:00:00Z'), end: at('2026-10-25T23:00:00Z') })
    expect(hours(autumn)).toBe(25)
    const spring = buildLadder(at('2026-03-26T10:00:00Z'), utrecht).find((slot) => slot.date === '2026-03-29')!
    expect(hours(spring)).toBe(23)
  })

  it('marks the first row of a new day', () => {
    const now = at('2026-10-17T05:00:00Z')
    const slots = buildLadder(now, utrecht)
    const rows = buildSlotRows(now, slots.slice(0, 3), { harmonieEpochs: Array.from({ length: 60 }, (_, index) => at('2026-10-17T03:00:00Z') + index * hour) }, '2026-10-17')
    expect(rows.map((row) => row.dayStart)).toEqual([undefined, undefined, true])
    expect(rows.every((row) => row.source === 'harmonie' && row.values === undefined)).toBe(true)
  })
})

describe('slot sources', () => {
  const now = at('2026-10-18T03:00:00Z') // 05:00 lokaal: dagdelen voor de rest van vandaag en heel morgen
  // HARMONIE tot maandag 07 UTC (09 lokaal); ECMWF in stappen van 3 u vanaf zaterdag 00 UTC.
  const harmonieEpochs = Array.from({ length: 53 }, (_, index) => at('2026-10-17T03:00:00Z') + index * hour)
  const intervals = steps('2026-10-17T00:00:00Z', 48)
  const constant = (value: number) => intervals.map(() => value)

  it('takes a window from HARMONIE only when HARMONIE covers all of it, else from the ECMWF steps', () => {
    const slots = buildLadder(now, utrecht).filter((slot) => slot.date === '2026-10-18' || slot.date === '2026-10-19')
    const rows = buildSlotRows(now, slots, { harmonieEpochs, steps: { intervals } })
    // De nacht naar maandag (22–04 UTC) ligt binnen HARMONIE; maandagochtend loopt tot 10 UTC en HARMONIE stopt om 07.
    expect(rows.map((row) => `${row.slot.label} ${row.source}`)).toEqual(['Avond harmonie', 'Nacht harmonie', 'Ochtend ecmwf', 'Middag ecmwf', 'Avond ecmwf', 'Nacht ecmwf'])
    expect(rows.map((row) => row.dayStart === true)).toEqual([false, false, true, false, false, false])
  })

  it('aggregates loaded steps over a whole calendar day and puts the chance of rain on it', () => {
    const slots = buildLadder(now, utrecht).filter((slot) => slot.date === '2026-10-21')
    const rows = buildSlotRows(now, slots, {
      harmonieEpochs,
      steps: { intervals, values: { step_tmax_c: constant(12), step_tmin_c: constant(6), step_precip_mm: constant(1.5), step_cloud: constant(80), step_wind_u_ms: constant(4), step_wind_v_ms: constant(0) } },
      days: { dates: ['2026-10-21'], values: { day_precip_prob: [70] } },
    })
    expect(rows.map((row) => row.slot.grain)).toEqual(['day'])
    expect(rows[0]!.values).toMatchObject({ tmax: 12, tmin: 6, cloud: 80, precipProb: 70, windMs: 4, windFromDegrees: 270 })
    expect(rows[0]!.values!.precipMm).toBeCloseTo(12) // 24 uur × 1,5 mm per 3 u
  })

  it('shows only day rows from the day fields while there are no steps, and drops what has no source', () => {
    const slots = buildLadder(now, utrecht).filter((slot) => slot.date === '2026-10-19' || slot.date === '2026-10-22')
    const rows = buildSlotRows(now, slots, { harmonieEpochs, days: { dates: ['2026-10-22'], values: { day_tmax_c: [15], day_precip_prob: [40] } } })
    expect(rows.map((row) => `${row.slot.date} ${row.slot.label}`)).toEqual(['2026-10-22 Dag'])
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
    // Zonder momentopnamen geldt het midden van de stap: 03–06 (04:30) telt nog, 09–12 (10:30) niet meer.
    expect(values).toMatchObject({ tmax: 14, tmin: 5, gustMs: 18 })
    // Stapeinden 06 en 09 UTC vallen in het venster, 12 UTC niet.
    expect(values.windMs).toBeCloseTo(6)
    expect(values.windFromDegrees).toBeCloseTo(180)
    expect(values.cloud).toBe(25)
  })

  it('keeps afternoon warmth out of a night window that only touches the afternoon step', () => {
    const intervals = steps('2026-10-21T12:00:00Z', 6) // 12–15, 15–18 … 03–06 UTC
    const night = { start: at('2026-10-21T16:00:00Z'), end: at('2026-10-22T04:00:00Z') } // 18–06 lokaal
    const values = aggregateSteps(intervals, {
      // De piek van 15–18 UTC viel om 15 UTC (17 lokaal): gelijk aan de temperatuur aan het begin van de stap.
      step_tmax_c: [14.2, 14, 11, 10, 9, 9], step_tmin_c: [12, 11, 10, 9, 8, 7], step_temp_c: [14, 11, 10, 9, 8, 8],
    }, night)
    expect(values.tmax).toBeCloseTo(13) // 18 lokaal, tussen 14 en 11 °C
    // Het minimum van 03–06 UTC (7 °C) ligt midden in die stap, na 06 lokaal.
    expect(values.tmin).toBe(8)
  })

  it('keeps an afternoon peak inside a 6-hour step that the day window only partly covers', () => {
    const intervals = steps('2026-10-24T00:00:00Z', 3, 6) // 00–06, 06–12, 12–18 UTC
    const day = { start: at('2026-10-24T04:00:00Z'), end: at('2026-10-24T16:00:00Z') } // 06–18 lokaal
    const values = aggregateSteps(intervals, {
      step_tmax_c: [9, 11.5, 12], step_tmin_c: [7, 8, 9], step_temp_c: [8, 11, 9],
    }, day)
    expect(values.tmax).toBe(12)
  })

  it('falls back to the step end nearest the middle when a 6-hour step leaves none inside', () => {
    const intervals = steps('2026-10-25T00:00:00Z', 3, 6) // 00–06, 06–12, 12–18 UTC
    const values = aggregateSteps(intervals, { step_cloud: [10, 60, 90], step_wind_u_ms: [1, 2, 3], step_wind_v_ms: [0, 0, 0] }, { start: at('2026-10-25T09:00:00Z'), end: at('2026-10-25T11:00:00Z') })
    expect(values.cloud).toBe(60)
    expect(values.windMs).toBe(2)
    expect(values.precipMm).toBeNull()
  })
})
