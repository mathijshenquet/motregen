import { describe, expect, it } from 'vitest'
import { solarElevationSin } from './solar'
import { iconD2Weight, sunshineFraction, sunshineInputs, sunshineLabel, sunshineMinutes, sunshinePossibleShare, sunshineShare, type SunshineInputs } from './sunshine'

const HOUR = 3_600_000
const at = (longitude: number, latitude: number) => (epoch: number) => solarElevationSin(epoch, longitude, latitude)
const deBilt = at(5.18, 52.1)

/** One hour of HARMONIE global and/or ICON-D2 direct radiation; ICON-D2 covers `cover` hours either side. */
function hourInputs(end: number, sinElevation: (epoch: number) => number, global: number | null, direct?: number, cover = 24): SunshineInputs {
  return {
    globalAt: (epoch) => epoch === end ? global : undefined,
    direct: direct === undefined ? undefined : { at: (epoch) => epoch === end ? direct : undefined, first: end - cover * HOUR, last: end + cover * HOUR },
    sinElevation,
  }
}

describe('sunshineMinutes', () => {
  // Uit `uv run python s1_reference.py` in tools/zonneschijn: evaluate.py met 6 substappen en dezelfde parameters.
  const reference: Array<[string, number, number, number, number]> = [
    ['2026-06-21T12:00:00Z', 5.18, 52.10, 820, 59.1290],
    ['2026-06-21T12:00:00Z', 5.18, 52.10, 450, 20.6043],
    ['2026-06-21T12:00:00Z', 5.18, 52.10, 120, 0],
    ['2026-06-21T05:00:00Z', 5.18, 52.10, 150, 60],
    ['2026-06-21T20:00:00Z', 5.18, 52.10, 15, 7.3996],
    ['2026-12-21T09:00:00Z', 6.57, 53.22, 20, 15.0949],
    ['2026-12-21T12:00:00Z', 3.60, 51.45, 200, 56.2355],
    ['2026-10-18T07:00:00Z', 4.90, 52.37, 10, 4.0603],
    ['2026-10-18T22:00:00Z', 4.90, 52.37, 0, 0],
  ]

  it.each(reference)('S1 matches evaluate.py for the hour ending %s at %f, %f with %f W/m² global', (time, longitude, latitude, radiation, expected) => {
    const end = Date.parse(time)
    expect(sunshineMinutes(end, hourInputs(end, at(longitude, latitude), radiation))).toBeCloseTo(expected, 2)
  })

  // Idem voor D1 op de ICON-D2-directe straling (evaluate_icon_d2.py, MIP-39).
  const directReference: Array<[string, number, number, number, number]> = [
    ['2026-06-21T12:00:00Z', 5.18, 52.10, 650, 60],
    ['2026-06-21T12:00:00Z', 5.18, 52.10, 250, 29.3329],
    ['2026-06-21T12:00:00Z', 5.18, 52.10, 5, 0],
    ['2026-06-21T05:00:00Z', 5.18, 52.10, 60, 60],
    ['2026-06-21T20:00:00Z', 5.18, 52.10, 4, 17.7078],
    ['2026-12-21T09:00:00Z', 6.57, 53.22, 8, 30],
    ['2026-12-21T12:00:00Z', 3.60, 51.45, 120, 60],
    ['2026-10-18T13:00:00Z', 4.90, 52.37, 100, 26.9935],
    ['2026-10-18T22:00:00Z', 4.90, 52.37, 0, 0],
  ]

  it.each(directReference)('D1 matches evaluate_icon_d2.py for the hour ending %s at %f, %f with %f W/m² direct', (time, longitude, latitude, direct, expected) => {
    const end = Date.parse(time)
    // Midden in de ICON-D2-reeks telt alleen de directe straling, wat HARMONIE ook zegt.
    expect(sunshineMinutes(end, hourInputs(end, at(longitude, latitude), 0, direct))).toBeCloseTo(expected, 2)
    expect(sunshineMinutes(end, hourInputs(end, at(longitude, latitude), null, direct))).toBeCloseTo(expected, 2)
  })

  it('has no value without radiation from either source', () => {
    const end = Date.parse('2026-06-21T12:00:00Z')
    expect(sunshineMinutes(end, hourInputs(end, deBilt, null))).toBeNull()
    expect(sunshineMinutes(end, { globalAt: () => null, direct: { at: () => null, first: end, last: end }, sinElevation: deBilt })).toBeNull()
  })

  it('only counts the part of the hour with the sun above 4.2°', () => {
    expect(sunshinePossibleShare(Date.parse('2026-06-21T12:00:00Z'), deBilt)).toBe(1)
    expect(sunshinePossibleShare(Date.parse('2026-06-21T20:00:00Z'), deBilt)).toBeCloseTo(1 / 3)
    expect(sunshinePossibleShare(Date.parse('2026-06-21T23:00:00Z'), deBilt)).toBe(0)
  })
})

describe('ICON-D2 and HARMONIE together (MIP-39)', () => {
  const noon = Date.parse('2026-06-21T12:00:00Z')

  it('ramps the ICON-D2 weight over three hours at both edges of its run', () => {
    const first = noon
    const last = noon + 47 * HOUR
    expect(iconD2Weight(first - HOUR, first, last)).toBe(0)
    expect([0, 1, 2, 3, 20].map((hours) => iconD2Weight(first + hours * HOUR, first, last))).toEqual([0.25, 0.5, 0.75, 1, 1])
    expect([3, 2, 1, 0].map((hours) => iconD2Weight(last - hours * HOUR, first, last))).toEqual([1, 0.75, 0.5, 0.25])
    expect(iconD2Weight(last + HOUR, first, last)).toBe(0)
  })

  it('blends the shares by that weight and falls back to whichever source has the hour', () => {
    // HARMONIE zegt bewolkt (S1-aandeel 0), ICON-D2 helder (D1-aandeel 1).
    const cloudyHarmonie = 120
    const clearIcon = 650
    expect(sunshineShare(noon, hourInputs(noon, deBilt, cloudyHarmonie, clearIcon))).toBe(1)
    expect(sunshineShare(noon, hourInputs(noon, deBilt, cloudyHarmonie, clearIcon, 0))).toBeCloseTo(0.25)
    expect(sunshineShare(noon, hourInputs(noon, deBilt, cloudyHarmonie, clearIcon, 1))).toBeCloseTo(0.5)
    expect(sunshineShare(noon, hourInputs(noon, deBilt, cloudyHarmonie))).toBe(0)
    const missingIcon: SunshineInputs = { ...hourInputs(noon, deBilt, cloudyHarmonie), direct: { at: () => null, first: noon - HOUR, last: noon + HOUR } }
    expect(sunshineShare(noon, missingIcon)).toBe(0)
  })

  it('builds the inputs from the point series, without ICON-D2 when its run is absent', () => {
    const timeline = [noon - HOUR, noon, noon + HOUR].map((epoch) => ({ epoch }))
    const inputs = sunshineInputs({ timeline, values: [800, 820, 120] }, { timeline, values: [650, 650, 650] }, deBilt)
    expect(inputs.direct).toMatchObject({ first: noon - HOUR, last: noon + HOUR })
    expect(inputs.globalAt(noon)).toBe(820)
    expect(inputs.direct!.at(noon)).toBe(650)
    // Rand van de run: een kwart ICON-D2 (aandeel 1), driekwart HARMONIE (aandeel 0).
    expect(sunshineShare(noon + HOUR, inputs)).toBeCloseTo(0.25)
    expect(sunshineInputs({ timeline, values: [800, 820, 120] }, { timeline: [], values: [] }, deBilt).direct).toBeUndefined()
    expect(sunshineInputs({ timeline, values: [800, 820, 120] }, undefined, deBilt).direct).toBeUndefined()
  })

  it('interpolates the quarter-hour fraction from the blended hour shares', () => {
    const timeline = [noon, noon + HOUR].map((epoch) => ({ epoch }))
    const inputs = sunshineInputs({ timeline, values: [120, 120] }, { timeline: [{ epoch: noon - 10 * HOUR }, ...timeline, { epoch: noon + 10 * HOUR }], values: [null, 650, 650, null] }, deBilt)
    expect(sunshineFraction(noon, inputs)).toBeCloseTo(1)
  })
})

describe('sunshineLabel', () => {
  it('rounds to the given step', () => {
    expect(sunshineLabel(34, 10)).toBe('30 min zon')
    expect(sunshineLabel(35, 10)).toBe('40 min zon')
    expect(sunshineLabel(59.1, 10)).toBe('60 min zon')
    expect(sunshineLabel(4, 10)).toBe('geen zon')
    expect(sunshineLabel(33, 5)).toBe('35 min zon')
  })
})
