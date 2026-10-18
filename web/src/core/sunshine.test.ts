import { describe, expect, it } from 'vitest'
import { solarElevationSin } from './solar'
import { iconD2Weight, sunshineFraction, sunshineInputs, sunshineLabel, sunshineMinutes, sunshinePossibleShare, sunshineShare, type SunshineInputs } from './sunshine'

const HOUR = 3_600_000
const at = (longitude: number, latitude: number) => (epoch: number) => solarElevationSin(epoch, longitude, latitude)
const deBilt = at(5.18, 52.1)

/** One hour of HARMONIE global and/or ICON-D2 direct radiation; the ICON-D2 run is `lead` hours before `end`. */
function hourInputs(end: number, sinElevation: (epoch: number) => number, global: number | null, direct?: number, lead = 6): SunshineInputs {
  const run = end - lead * HOUR
  return {
    globalAt: (epoch) => epoch === end ? global : undefined,
    direct: direct === undefined ? undefined : { at: (epoch) => epoch === end ? direct : undefined, run, first: run + HOUR, last: run + 48 * HOUR },
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
    expect(sunshineMinutes(end, { globalAt: () => null, direct: { at: () => null, run: end - 6 * HOUR, first: end - 5 * HOUR, last: end + 42 * HOUR }, sinElevation: deBilt })).toBeNull()
  })

  it('only counts the part of the hour with the sun above 4.2°', () => {
    expect(sunshinePossibleShare(Date.parse('2026-06-21T12:00:00Z'), deBilt)).toBe(1)
    expect(sunshinePossibleShare(Date.parse('2026-06-21T20:00:00Z'), deBilt)).toBeCloseTo(1 / 3)
    expect(sunshinePossibleShare(Date.parse('2026-06-21T23:00:00Z'), deBilt)).toBe(0)
  })
})

describe('ICON-D2 and HARMONIE together (MIP-39)', () => {
  const run = Date.parse('2026-06-21T00:00:00Z')
  const run48 = { run, first: run + HOUR, last: run + 48 * HOUR }
  const weightAt = (lead: number) => iconD2Weight(run + lead * HOUR, run48)

  it('counts ICON-D2 fully up to +12 h, mixes linearly to HARMONIE and leaves it from +24 h (besluit 1)', () => {
    expect(weightAt(0)).toBe(0)
    expect([1, 2, 3].map(weightAt)).toEqual([0.25, 0.5, 0.75])
    expect([4, 8, 12].map(weightAt)).toEqual([1, 1, 1])
    expect(weightAt(13)).toBeCloseTo(11 / 12)
    expect(weightAt(18)).toBeCloseTo(0.5)
    expect(weightAt(23)).toBeCloseTo(1 / 12)
    expect([24, 30, 48, 49].map(weightAt)).toEqual([0, 0, 0, 0])
  })

  it('moves the curve in steps of at most a quarter at the start and a twelfth over +12…+24 h, without a jump', () => {
    // HARMONIE zegt de hele dag bewolkt (aandeel 0), ICON-D2 helder (aandeel 1): het aandeel is dan de weging.
    const inputs: SunshineInputs = { globalAt: () => 0, direct: { at: () => 1000, ...run48 }, sinElevation: () => 0.9 }
    const shares = Array.from({ length: 31 }, (_, lead) => sunshineShare(run + lead * HOUR, inputs)!)
    for (let lead = 1; lead <= 30; lead++) {
      const step = Math.abs(shares[lead]! - shares[lead - 1]!)
      expect(step).toBeLessThanOrEqual(lead <= 4 ? 0.25 + 1e-9 : 1 / 12 + 1e-9)
    }
    expect(shares[12]).toBe(1)
    expect(shares[24]).toBe(0)
  })

  it('blends the shares by that weight and falls back to whichever source has the hour', () => {
    const noon = Date.parse('2026-06-21T12:00:00Z')
    // HARMONIE zegt bewolkt (S1-aandeel 0), ICON-D2 helder (D1-aandeel 1).
    const cloudyHarmonie = 120
    const clearIcon = 650
    expect(sunshineShare(noon, hourInputs(noon, deBilt, cloudyHarmonie, clearIcon, 6))).toBe(1)
    expect(sunshineShare(noon, hourInputs(noon, deBilt, cloudyHarmonie, clearIcon, 18))).toBeCloseTo(0.5)
    expect(sunshineShare(noon, hourInputs(noon, deBilt, cloudyHarmonie, clearIcon, 30))).toBe(0)
    expect(sunshineShare(noon, hourInputs(noon, deBilt, cloudyHarmonie, clearIcon, 1))).toBeCloseTo(0.25)
    expect(sunshineShare(noon, hourInputs(noon, deBilt, cloudyHarmonie))).toBe(0)
    // Zonder HARMONIE (verleden, of nog aan het laden): tot +12 u ICON-D2 alleen, daarna geen waarde.
    expect(sunshineShare(noon, hourInputs(noon, deBilt, null, clearIcon, 1))).toBe(1)
    expect(sunshineShare(noon, hourInputs(noon, deBilt, null, clearIcon, 12))).toBe(1)
    expect(sunshineShare(noon, hourInputs(noon, deBilt, null, clearIcon, 13))).toBeNull()
    expect(sunshineShare(noon, hourInputs(noon, deBilt, null, clearIcon, 30))).toBeNull()
    const missingIcon: SunshineInputs = { ...hourInputs(noon, deBilt, cloudyHarmonie), direct: { at: () => null, run: noon - 6 * HOUR, first: noon - 5 * HOUR, last: noon + 42 * HOUR } }
    expect(sunshineShare(noon, missingIcon)).toBe(0)
  })

  it('builds the inputs from the point series, with the run time of the ICON-D2 chunk', () => {
    const noon = Date.parse('2026-06-21T12:00:00Z')
    const harmonie = [noon - HOUR, noon, noon + HOUR].map((epoch) => ({ epoch, run: '2026-06-21T09:00:00Z' }))
    const icon = Array.from({ length: 48 }, (_, index) => ({ epoch: noon + (index - 5) * HOUR, run: '2026-06-21T06:00:00Z' }))
    const inputs = sunshineInputs({ timeline: harmonie, values: [800, 820, 120] }, { timeline: icon, values: icon.map(() => 650) }, deBilt)
    expect(inputs.direct).toMatchObject({ run: noon - 6 * HOUR, first: noon - 5 * HOUR, last: noon + 42 * HOUR })
    expect(inputs.globalAt(noon)).toBe(820)
    expect(inputs.direct!.at(noon)).toBe(650)
    expect(sunshineShare(noon + HOUR, inputs)).toBe(1)
    expect(sunshineInputs({ timeline: harmonie, values: [800, 820, 120] }, { timeline: [], values: [] }, deBilt).direct).toBeUndefined()
    expect(sunshineInputs({ timeline: harmonie, values: [800, 820, 120] }, undefined, deBilt).direct).toBeUndefined()
  })

  it('interpolates the quarter-hour fraction from the blended hour shares', () => {
    const noon = Date.parse('2026-06-21T12:00:00Z')
    expect(sunshineFraction(noon, { globalAt: () => 120, direct: { at: () => 650, run: noon - 6 * HOUR, first: noon - 5 * HOUR, last: noon + 42 * HOUR }, sinElevation: deBilt })).toBeCloseTo(1)
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
