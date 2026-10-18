import { describe, expect, it } from 'vitest'
import { fpsFraction, holdFrames, LOOP_TIMING, sequencePlan } from './sequences.js'
import { cacheKey, enabledLoopModes, LOOP_MODES, PREWARM_HOURS, type StillManifest } from './stills.js'

const manifest: StillManifest = { version: 0, generated: '2026-10-07T12:00:00Z', now: '2026-10-07T12:00:00Z', chunks: [] }
const now = Date.parse(manifest.now)

describe('one frame sequence per mode', () => {
  it('uses one app tempo for rain, temperature and air, and the shorter wind and air windows', () => {
    const expected = {
      weather: { fps: 5.6, stepSeconds: 100, loopFrames: 109, epochs: 175, startHours: -1, endHours: 2 },
      wind: { fps: 7.5, stepSeconds: 75, loopFrames: 193, epochs: 193, startHours: -1, endHours: 3 },
      feels: { fps: 5.6, stepSeconds: 100, loopFrames: 217, epochs: 265, startHours: -1, endHours: 5 },
      air: { fps: 5.6, stepSeconds: 100, loopFrames: 145, epochs: 205, startHours: -1, endHours: 3 },
    }
    for (const definition of LOOP_MODES) {
      const plan = sequencePlan(definition.mode, manifest)
      const mode = expected[definition.mode]
      expect(plan).toMatchObject({ fps: mode.fps, loopFrames: mode.loopFrames })
      expect(plan.epochs).toHaveLength(mode.epochs)
      const loopEpochs = plan.epochs.slice(0, plan.loopFrames)
      expect(loopEpochs[0]).toBe(now + mode.startHours * 3_600_000)
      expect(loopEpochs.at(-1)).toBe(now + mode.endHours * 3_600_000)
      for (const [index, epoch] of loopEpochs.entries()) {
        expect(epoch).toBe(now + (mode.startHours * 3600 + index * mode.stepSeconds) * 1000)
      }
      expect(new Set(plan.epochs).size).toBe(plan.epochs.length)
    }
  })

  it('reuses shared loop frames and retains all earlier and later stills through twelve hours', () => {
    for (const mode of ['weather', 'feels'] as const) {
      const plan = sequencePlan(mode, manifest)
      expect(plan.stillFrames).toHaveLength(85)
      for (const frame of plan.stillFrames) {
        expect(plan.epochs[frame.index]).toBe(now + Math.round(frame.hour * 3_600_000))
        expect(frame.index).toBeGreaterThanOrEqual(0)
        const inLoop = frame.hour >= -1 && frame.hour <= (mode === 'weather' ? 2 : 5)
        if (inLoop) {
          expect(frame.index).toBe(Math.round((frame.hour + 1) * 36))
          expect(frame.index).toBeLessThan(plan.loopFrames)
        } else {
          expect(frame.index).toBeGreaterThanOrEqual(plan.loopFrames)
        }
      }
      expect(plan.stillFrames.find((frame) => frame.hour === 0)?.index).toBe(36)
      expect(plan.stillFrames.find((frame) => frame.hour === 12)?.index).toBe(mode === 'weather' ? 174 : 264)
      const endMinutes = mode === 'weather' ? 120 : 300
      const outside = Array.from({ length: 85 }, (_, index) => -120 + index * 10).filter((minute) => minute < -60 || minute > endMinutes)
      expect(plan.epochs.slice(plan.loopFrames)).toEqual(outside.map((minute) => now + minute * 60_000))
      expect(plan.stillFrames.filter((frame) => frame.index < plan.loopFrames)).toHaveLength(mode === 'weather' ? 19 : 37)
    }
    const rain = sequencePlan('weather', manifest)
    expect(rain.stillFrames.filter((frame) => frame.index < rain.loopFrames)).toHaveLength(19)
    // Buiten de loop, in STILL_HOURS-volgorde: −2 u…−1 u (6), dan +2 u 10 min…+12 u (60).
    const outside = Array.from({ length: 85 }, (_, index) => -120 + index * 10).filter((minute) => minute < -60 || minute > 120)
    expect(rain.epochs.slice(rain.loopFrames)).toEqual(outside.map((minute) => now + minute * 60_000))
    expect(sequencePlan('wind', manifest).stillFrames).toEqual([])
    expect(holdFrames(rain)).toBe(6)
    expect(holdFrames(sequencePlan('feels', manifest))).toBe(6)
    expect(holdFrames(sequencePlan('wind', manifest))).toBe(8)
    expect(fpsFraction(sequencePlan('wind', manifest).fps)).toEqual({ numerator: 15, denominator: 2 })
    expect((75 * sequencePlan('wind', manifest).fps) / 60).toBe(9.375)
    expect(fpsFraction(rain.fps)).toEqual({ numerator: 28, denominator: 5 })
    expect((100 * rain.fps) / 60).toBeCloseTo(9.333333)
  })

  it('invalidates only affected films when timing changes and preserves every still cache', () => {
    const wind = cacheKey({ mode: 'wind', hour: 'loop' }, manifest)
    const feels = cacheKey({ mode: 'feels', hour: 'loop' }, manifest)
    const still = cacheKey({ mode: 'feels', hour: 12 }, manifest)
    const end = LOOP_TIMING.wind.endMinutes
    try {
      LOOP_TIMING.wind.endMinutes = 720
      expect(cacheKey({ mode: 'wind', hour: 'loop' }, manifest)).not.toBe(wind)
      expect(cacheKey({ mode: 'feels', hour: 'loop' }, manifest)).toBe(feels)
      expect(cacheKey({ mode: 'feels', hour: 12 }, manifest)).toBe(still)
    } finally { LOOP_TIMING.wind.endMinutes = end }
  })

  it('isolates loop ids from still ids and all 173 artifacts from a new generation', () => {
    const keys = new Set<string>()
    for (const definition of enabledLoopModes()) {
      const plan = sequencePlan(definition.mode, manifest)
      const selections = definition.mode === 'wind' ? [{ mode: definition.mode, hour: 'loop' } as const] : [
        { mode: definition.mode, hour: 'loop' } as const,
        ...plan.stillFrames.map((frame) => ({ mode: definition.mode, hour: frame.hour })),
      ]
      for (const selection of selections) {
        const key = cacheKey(selection, manifest)
        keys.add(key)
        expect(cacheKey(selection, { ...manifest, generated: '2026-10-07T12:05:00Z' })).not.toBe(key)
      }
    }
    expect(keys.size).toBe(173)
  })

  it('prewarms 13 media while retaining all delta frames for lazy stills', () => {
    const keys = new Set<string>()
    for (const definition of enabledLoopModes()) {
      keys.add(cacheKey({ mode: definition.mode, hour: 'loop' }, manifest))
      if (definition.mode === 'wind') continue
      const plan = sequencePlan(definition.mode, manifest)
      for (const hour of PREWARM_HOURS) {
        expect(plan.stillFrames.some((frame) => frame.hour === hour)).toBe(true)
        keys.add(cacheKey({ mode: definition.mode, hour }, manifest))
      }
      expect(plan.stillFrames).toHaveLength(85)
    }
    expect(keys.size).toBe(13)
  })
})

describe('clock on loop frames', () => {
  it('shows the nearest five minutes, so each time stays for three rain frames', async () => {
    const { clockEpoch } = await import('./native-overlay.js')
    const plan = sequencePlan('weather', manifest)
    const minutes = plan.epochs.slice(0, 7).map((epoch) => (clockEpoch(epoch) - plan.epochs[0]!) / 60_000)
    expect(minutes).toEqual([0, 0, 5, 5, 5, 10, 10])
    const wind = sequencePlan('wind', manifest)
    expect(wind.epochs.slice(0, 8).map((epoch) => (clockEpoch(epoch) - wind.epochs[0]!) / 60_000)).toEqual([0, 0, 5, 5, 5, 5, 10, 10])
    // Stills liggen op tientallen minuten en houden dus hun eigen tijd.
    for (const hour of [-2, 0, 0.5, 12]) expect(clockEpoch(now + hour * 3_600_000)).toBe(now + hour * 3_600_000)
  })
})
