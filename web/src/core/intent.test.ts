import { describe, expect, it } from 'vitest'
import { intentDirection, intentDistance, intentTarget, isIdleWork, type FrameTiming, type Intent } from './intent'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const noon = Date.UTC(2026, 9, 7, 12)

const rain = (minutes: number): FrameTiming => ({ epoch: noon + minutes * MINUTE, stepMs: 5 * MINUTE, field: 'rain_rate' })
const hourly = (field: string, hours: number): FrameTiming => ({ epoch: noon + hours * HOUR, stepMs: HOUR, field })
const intent = (overrides: Partial<Intent> = {}): Intent => ({
  cursorEpoch: noon,
  window: { start: noon - 3 * HOUR, end: noon + 5 * HOUR },
  playback: 0,
  scrubVelocity: 0,
  fields: new Set(['rain_rate', 'temp_c']),
  ...overrides,
})

describe('intentDistance', () => {
  it('is zero for the frames the cursor sits between, also for an hourly field', () => {
    const at = intent({ cursorEpoch: noon + 20 * MINUTE })
    expect(intentDistance(hourly('temp_c', 0), at)).toBe(0)
    expect(intentDistance(hourly('temp_c', 1), at)).toBe(0)
    expect(intentDistance(hourly('temp_c', 2), at)).toBe(40 * MINUTE)
    expect(intentDistance(rain(20), at)).toBe(0)
    expect(intentDistance(rain(40), at)).toBe(15 * MINUTE)
  })

  it('counts frames in the playback direction as closer', () => {
    expect(intentDistance(rain(65), intent({ playback: 1 }))).toBe(48 * MINUTE)
    expect(intentDistance(rain(-65), intent({ playback: 1 }))).toBe(60 * MINUTE)
    expect(intentDistance(rain(-65), intent({ playback: -1 }))).toBe(48 * MINUTE)
  })

  it('puts a frame without a known time last', () => {
    expect(intentDistance({ epoch: Number.NaN, stepMs: 0, field: 'rain_rate' }, intent())).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('scrubbing', () => {
  // Een uur tijdlijn per 100 ms slepen.
  const fastForward = HOUR / 100

  it('aims ahead of the cursor in the scrub direction', () => {
    expect(intentTarget(intent())).toBe(noon)
    expect(intentTarget(intent({ scrubVelocity: fastForward }))).toBe(noon + 4 * HOUR)
    expect(intentTarget(intent({ scrubVelocity: -fastForward / 4 }))).toBe(noon - HOUR)
    expect(intentDirection(intent({ scrubVelocity: -fastForward }))).toBe(-1)
  })

  it('never aims outside the visible window', () => {
    expect(intentTarget(intent({ scrubVelocity: 10 * fastForward }))).toBe(noon + 5 * HOUR)
    expect(intentTarget(intent({ scrubVelocity: -10 * fastForward }))).toBe(noon - 3 * HOUR)
  })

  it('lets playback decide the direction over a leftover scrub speed', () => {
    expect(intentDirection(intent({ playback: 1, scrubVelocity: -fastForward }))).toBe(1)
  })
})

describe('isIdleWork', () => {
  it('counts a frame as shown up to an hour outside the window, where the scrubber lines end', () => {
    expect(isIdleWork(hourly('temp_c', 5), intent())).toBe(false)
    expect(isIdleWork(hourly('temp_c', 6), intent())).toBe(false)
    expect(isIdleWork(hourly('temp_c', 7), intent())).toBe(true)
    expect(isIdleWork(rain(-240), intent())).toBe(false)
    expect(isIdleWork(rain(-245), intent())).toBe(true)
  })

  it('counts a field the mode does not show as idle work, wherever it is', () => {
    expect(isIdleWork(hourly('rel_humidity', 0), intent())).toBe(true)
  })
})
