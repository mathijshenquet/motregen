import { describe, expect, it } from 'vitest'
import type { EcmwfSection, Manifest, ManifestChunk } from './contract'
import { aggregateHourlyDay, buildDayList, ecmwfDayChunks, localDayBounds, localDate, type HourlyDayInputs, type Sample } from './days'
import { deriveDayIcon } from './weather'

const hour = 3_600_000
const at = (iso: string) => Date.parse(iso)

function hourly(from: string, to: string, value: (epoch: number) => number | null): Sample[] {
  const samples: Sample[] = []
  for (let epoch = at(from); epoch <= at(to); epoch += hour) samples.push({ epoch, value: value(epoch) })
  return samples
}

function inputs(partial: Partial<HourlyDayInputs>): HourlyDayInputs {
  return { temperature: [], rain: [], cloud: [], windU: [], windV: [], gust: [], ...partial }
}

describe('local days', () => {
  it('spans 25 hours on the autumn clock change and 23 on the spring one', () => {
    expect(localDayBounds('2026-10-25')).toEqual({ start: at('2026-10-24T22:00:00Z'), end: at('2026-10-25T23:00:00Z') })
    expect(localDayBounds('2026-03-29')).toEqual({ start: at('2026-03-28T23:00:00Z'), end: at('2026-03-29T22:00:00Z') })
    expect(localDayBounds('2026-10-17')).toEqual({ start: at('2026-10-16T22:00:00Z'), end: at('2026-10-17T22:00:00Z') })
    expect(localDate(at('2026-10-17T21:59:00Z'))).toBe('2026-10-17')
    expect(localDate(at('2026-10-17T22:00:00Z'))).toBe('2026-10-18')
  })
})

describe('hourly day aggregation', () => {
  it('applies the ECMWF day definitions to a 25-hour winter-time day', () => {
    const day = localDayBounds('2026-10-25')
    const values = aggregateHourlyDay(inputs({
      // Buiten de dag ligt het warmste en koudste uur; die tellen niet mee.
      temperature: hourly('2026-10-24T18:00:00Z', '2026-10-26T02:00:00Z', (epoch) =>
        epoch < day.start || epoch >= day.end ? (epoch < day.start ? 30 : -10) : epoch === at('2026-10-25T13:00:00Z') ? 14 : 8),
      rain: hourly('2026-10-24T18:00:00Z', '2026-10-26T02:00:00Z', () => 1),
      // 08–18 lokaal is na de wissel 07–17 UTC.
      cloud: hourly('2026-10-24T18:00:00Z', '2026-10-26T02:00:00Z', (epoch) => epoch >= at('2026-10-25T07:00:00Z') && epoch <= at('2026-10-25T17:00:00Z') ? 100 : 0),
      // 05 lokaal (04 UTC) en 22 lokaal (21 UTC) vallen buiten 06–21; 21 lokaal (20 UTC) telt, uit het westen.
      windU: hourly('2026-10-24T18:00:00Z', '2026-10-26T02:00:00Z', (epoch) =>
        epoch === at('2026-10-25T04:00:00Z') || epoch === at('2026-10-25T21:00:00Z') ? 30 : epoch === at('2026-10-25T20:00:00Z') ? 9 : 1),
      windV: hourly('2026-10-24T18:00:00Z', '2026-10-26T02:00:00Z', () => 0),
      gust: hourly('2026-10-24T18:00:00Z', '2026-10-26T02:00:00Z', (epoch) => epoch === at('2026-10-25T22:00:00Z') ? 21 : epoch === at('2026-10-25T23:00:00Z') ? 40 : 10),
    }), day)
    expect(values.tmax).toBe(14)
    expect(values.tmin).toBe(8)
    expect(values.precipMm).toBeCloseTo(25)
    expect(values.cloud).toBe(100)
    expect(values.windMs).toBe(9)
    expect(values.windFromDegrees).toBeCloseTo(270)
    expect(values.gustMs).toBe(21)
    expect(values.precipProb).toBeNull()
  })

  it('counts 23 hours of rain on the summer-time day', () => {
    const day = localDayBounds('2026-03-29')
    const values = aggregateHourlyDay(inputs({
      rain: hourly('2026-03-28T20:00:00Z', '2026-03-30T02:00:00Z', () => 1),
      // 08–18 lokaal is na de wissel 06–16 UTC.
      cloud: hourly('2026-03-28T20:00:00Z', '2026-03-30T02:00:00Z', (epoch) => epoch >= at('2026-03-29T06:00:00Z') && epoch <= at('2026-03-29T16:00:00Z') ? 40 : 90),
    }), day)
    expect(values.precipMm).toBeCloseTo(23)
    expect(values.cloud).toBe(40)
  })

  it('weighs five-minute radar frames by their own duration and treats missing frames as unknown', () => {
    const day = localDayBounds('2026-10-17')
    const radar = Array.from({ length: 12 }, (_, index) => ({ epoch: at('2026-10-17T08:00:00Z') + index * 300_000, value: 6 }))
    const model = hourly('2026-10-17T09:00:00Z', '2026-10-17T12:00:00Z', () => 0)
    expect(aggregateHourlyDay(inputs({ rain: [...radar, ...model] }), day).precipMm).toBeCloseTo(6)
    expect(aggregateHourlyDay(inputs({ rain: hourly('2026-10-17T08:00:00Z', '2026-10-17T12:00:00Z', () => null) }), day).precipMm).toBeNull()
    expect(aggregateHourlyDay(inputs({}), day)).toMatchObject({ tmax: null, tmin: null, windMs: null, cloud: null })
  })
})

const DAYS = ['2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26']
const section: EcmwfSection = {
  run: '2026-10-17T00:00:00Z',
  license: 'ECMWF IFS open data (CC BY 4.0), door motregen omgerekend naar dagwaarden',
  days: DAYS.map((date) => ({ date, start: new Date(localDayBounds(date).start).toISOString(), end: new Date(localDayBounds(date).end).toISOString() })),
}
// De waarde codeert de dag: index × 10 + 1, zodat een verschoven koppeling direct opvalt.
const byIndex = DAYS.map((_, index) => index * 10 + 1)
const values = { day_tmax_c: byIndex, day_tmin_c: byIndex, day_precip_mm: byIndex, day_precip_prob: byIndex, day_wind_ms: byIndex, day_wind_dir: byIndex, day_gust_ms: byIndex, day_cloud: byIndex }

function chunk(field: string, run = section.run, frames = DAYS.length): ManifestChunk {
  // Frametijden zijn lokale middag; de koppeling mag er niet op leunen.
  return { url: `chunks/${field}.mrf`, source: 'ecmwf', field: field as ManifestChunk['field'], run, header_len: 100, times: Array.from({ length: frames }, (_, index) => `2026-10-${18 + index}T10:00:00Z`) }
}

describe('day list', () => {
  const now = at('2026-10-17T11:00:00Z')
  const harmonie = inputs({ temperature: hourly('2026-10-17T03:00:00Z', '2026-10-19T07:00:00Z', (epoch) => epoch < at('2026-10-17T22:00:00Z') ? 15 : 12) })

  it('keeps only ECMWF chunks of the announced run with one frame per day', () => {
    const manifest: Pick<Manifest, 'chunks' | 'ecmwf'> = {
      ecmwf: section,
      chunks: [chunk('day_tmax_c'), chunk('day_tmin_c', '2026-10-16T12:00:00Z'), chunk('day_cloud', section.run, 8), { ...chunk('temp_c'), source: 'harmonie' }],
    }
    expect([...ecmwfDayChunks(manifest).keys()]).toEqual(['day_tmax_c'])
    expect(ecmwfDayChunks({ chunks: manifest.chunks }).size).toBe(0)
  })

  it('takes today and tomorrow from HARMONIE and couples later rows to ecmwf.days by date', () => {
    const rows = buildDayList(now, harmonie, { section, values })
    expect(rows.map((row) => row.date)).toEqual(['2026-10-17', ...DAYS])
    expect(rows.map((row) => row.label).slice(0, 4)).toEqual(['Vandaag', 'Morgen', 'ma 19', 'di 20'])
    expect(rows[0]).toMatchObject({ source: 'harmonie', tmax: 15, precipProb: null, pending: false })
    // Morgen: temperatuur uit HARMONIE, kans uit het eerste ECMWF-frame.
    expect(rows[1]).toMatchObject({ source: 'harmonie', tmax: 12, precipProb: 1, pending: false })
    expect(rows[2]).toMatchObject({ source: 'ecmwf', date: '2026-10-19', tmax: 11, precipProb: 11, windFromDegrees: 11 })
    expect(rows[9]).toMatchObject({ source: 'ecmwf', date: '2026-10-26', tmax: 81 })
  })

  it('skips days of an old run that are already over', () => {
    const rows = buildDayList(at('2026-10-20T11:00:00Z'), undefined, { section, values })
    expect(rows.map((row) => row.date)).toEqual(['2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25', '2026-10-26'])
    expect(rows[1]).toMatchObject({ label: 'Morgen', source: 'harmonie', precipProb: 31 })
    expect(rows[2]).toMatchObject({ source: 'ecmwf', tmax: 41 })
  })

  it('marks rows pending until their data is loaded and shows only today and tomorrow without ECMWF', () => {
    const loading = buildDayList(now, undefined, { section, values: undefined })
    expect(loading).toHaveLength(10)
    expect(loading.every((row) => row.pending && row.tmax === null)).toBe(true)
    const tomorrowWaitsForChance = buildDayList(now, harmonie, { section, values: undefined })
    expect(tomorrowWaitsForChance.map((row) => row.pending).slice(0, 3)).toEqual([false, true, true])
    expect(buildDayList(now, harmonie, undefined).map((row) => row.label)).toEqual(['Vandaag', 'Morgen'])
  })
})

describe('day icon', () => {
  it('always uses the day icon, with rain from half a millimetre and heavy rain from ten', () => {
    expect(deriveDayIcon(0.4, 10)).toMatchObject({ condition: 'clear', period: 'day' })
    expect(deriveDayIcon(0.5, 10)).toMatchObject({ condition: 'rain', period: 'day' })
    expect(deriveDayIcon(10, 90)).toMatchObject({ condition: 'heavy-rain', period: 'day' })
    expect(deriveDayIcon(null, 10)).toBeNull()
  })
})
