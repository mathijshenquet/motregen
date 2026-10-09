import { describe, expect, it } from 'vitest'
import { sequencePlan } from './sequences.js'
import { cacheKey, LOOP_MODES, PREWARM_HOURS, type StillManifest } from './stills.js'

const manifest: StillManifest = { version: 0, generated: '2026-10-07T12:00:00Z', now: '2026-10-07T12:00:00Z', chunks: [] }
const now = Date.parse(manifest.now)

describe('one frame sequence per mode', () => {
  it('runs five-minute loops from one hour ago through two hours ahead for rain and twelve for temperature and wind', () => {
    for (const definition of LOOP_MODES) {
      const plan = sequencePlan(definition.mode, manifest)
      const rain = definition.mode === 'weather'
      expect(plan).toMatchObject({ fps: 10, loopFrames: rain ? 37 : 169 })
      expect(plan.epochs).toHaveLength(rain ? 103 : 169)
      const loopEpochs = plan.epochs.slice(0, plan.loopFrames)
      expect(loopEpochs[0]).toBe(now - (rain ? 1 : 2) * 3_600_000)
      expect(loopEpochs.at(-1)).toBe(now + (rain ? 2 : 12) * 3_600_000)
      for (const [index, epoch] of loopEpochs.entries()) {
        expect(epoch).toBe(now + ((rain ? -60 : -120) + index * 5) * 60_000)
      }
      expect(new Set(plan.epochs).size).toBe(plan.epochs.length)
    }
  })

  it('reuses loop frames through the loop horizon and renders later rain stills only every ten minutes', () => {
    for (const mode of ['weather', 'feels'] as const) {
      const plan = sequencePlan(mode, manifest)
      expect(plan.stillFrames).toHaveLength(85)
      for (const frame of plan.stillFrames) {
        expect(plan.epochs[frame.index]).toBe(now + Math.round(frame.hour * 3_600_000))
        expect(frame.index).toBeGreaterThanOrEqual(0)
        const inLoop = mode === 'feels' ? true : frame.hour >= -1 && frame.hour <= 2
        if (inLoop) {
          expect(frame.index).toBe(Math.round(frame.hour * 12) + (mode === 'feels' ? 24 : 12))
          expect(frame.index).toBeLessThan(plan.loopFrames)
        } else {
          expect(frame.index).toBeGreaterThanOrEqual(plan.loopFrames)
        }
      }
      expect(plan.stillFrames.find((frame) => frame.hour === 0)?.index).toBe(mode === 'weather' ? 12 : 24)
      expect(plan.stillFrames.find((frame) => frame.hour === 12)?.index).toBe(mode === 'weather' ? 102 : 168)
    }
    const rain = sequencePlan('weather', manifest)
    expect(rain.stillFrames.filter((frame) => frame.index < rain.loopFrames)).toHaveLength(19)
    // Buiten de loop: eerst −2 u…−1 u 10 min (6), dan +2 u 10 min…+12 u (60), in STILL_HOURS-volgorde.
    const outside = [...Array.from({ length: 6 }, (_, index) => -120 + index * 10), ...Array.from({ length: 60 }, (_, index) => 130 + index * 10)]
    expect(rain.epochs.slice(rain.loopFrames)).toEqual(outside.map((minute) => now + minute * 60_000))
    expect(sequencePlan('wind', manifest).stillFrames).toEqual([])
  })

  it('isolates loop ids from still ids and all 173 artifacts from a new generation', () => {
    const keys = new Set<string>()
    for (const definition of LOOP_MODES) {
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
    for (const definition of LOOP_MODES) {
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
