import { describe, expect, it } from 'vitest'
import { sequencePlan } from './sequences.js'
import { cacheKey, LOOP_MODES, PREWARM_HOURS, type StillManifest } from './stills.js'

const manifest: StillManifest = { version: 0, generated: '2026-10-07T12:00:00Z', now: '2026-10-07T12:00:00Z', chunks: [] }
const now = Date.parse(manifest.now)

describe('one frame sequence per mode', () => {
  it('runs every loop on the same five-minute clock from two hours ago through twelve hours ahead', () => {
    const weather = sequencePlan('weather', manifest)
    for (const definition of LOOP_MODES) {
      const plan = sequencePlan(definition.mode, manifest)
      expect(plan).toMatchObject({ fps: 10, loopFrames: 169 })
      expect(plan.epochs).toHaveLength(plan.loopFrames)
      expect(plan.epochs).toEqual(weather.epochs)
      expect(plan.epochs[0]).toBe(now - 2 * 3_600_000)
      expect(plan.epochs.at(-1)).toBe(now + 12 * 3_600_000)
      for (const [index, epoch] of plan.epochs.entries()) {
        expect(epoch).toBe(now + (-120 + index * 5) * 60_000)
      }
      expect(new Set(plan.epochs).size).toBe(plan.epochs.length)
    }
  })

  it('reuses the loop frames for all ten-minute stills without making wind stills', () => {
    for (const mode of ['weather', 'feels'] as const) {
      const plan = sequencePlan(mode, manifest)
      expect(plan.stillFrames).toHaveLength(85)
      for (const frame of plan.stillFrames) {
        expect(plan.epochs[frame.index]).toBe(now + Math.round(frame.hour * 3_600_000))
        expect(frame.index).toBe(Math.round(frame.hour * 12) + 24)
      }
      expect(plan.stillFrames.find((frame) => frame.hour === 0)?.index).toBe(24)
      expect(plan.stillFrames.find((frame) => frame.hour === 12)?.index).toBe(168)
    }
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
