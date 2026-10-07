import { describe, expect, it } from 'vitest'
import { sequencePlan } from './sequences.js'
import { cacheKey, LOOP_MODES, type StillManifest } from './stills.js'

const manifest: StillManifest = { version: 0, generated: '2026-10-07T12:00:00Z', now: '2026-10-07T12:00:00Z', chunks: [] }
const now = Date.parse(manifest.now)

describe('one frame sequence per mode', () => {
  it('uses two radar hours and two nowcast hours, plus future still frames outside the loop', () => {
    const plan = sequencePlan('weather', manifest)
    expect(plan.fps).toBe(10)
    expect(plan.loopFrames).toBe(49)
    expect(plan.epochs).toHaveLength(52)
    expect(plan.epochs[0]).toBe(now - 2 * 3_600_000)
    expect(plan.epochs[plan.loopFrames - 1]).toBe(now + 2 * 3_600_000)
    expect(new Set(plan.epochs).size).toBe(plan.epochs.length)
    for (const frame of plan.stillFrames) expect(plan.epochs[frame.index]).toBe(now + frame.hour * 3_600_000)
    expect(plan.stillFrames.map((frame) => frame.index)).toEqual([24, 49, 50, 51])
  })

  it('keeps hourly still frames inside the air and feels loops and never renders wind stills', () => {
    for (const mode of ['air', 'feels'] as const) {
      const plan = sequencePlan(mode, manifest)
      expect(plan).toMatchObject({ fps: 4, loopFrames: 13 })
      expect(plan.stillFrames.map((frame) => frame.index)).toEqual([0, 3, 6, 12])
    }
    const wind = sequencePlan('wind', manifest)
    expect(wind).toMatchObject({ fps: 4, loopFrames: 49, stillFrames: [] })
    expect(wind.epochs.at(-1)).toBe(now + 12 * 3_600_000)
    expect(wind.epochs[1] - wind.epochs[0]).toBe(15 * 60_000)
  })

  it('isolates loop ids from still ids and all sixteen artifacts from a new generation', () => {
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
    expect(keys.size).toBe(16)
  })
})
