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
      expect(plan).toMatchObject({ fps: 10, loopFrames: rain ? 241 : 169 })
      expect(plan.epochs).toHaveLength(rain ? 319 : 169)
      const loopEpochs = plan.epochs.slice(0, plan.loopFrames)
      expect(loopEpochs[0]).toBe(now - (rain ? 1 : 2) * 3_600_000)
      expect(loopEpochs.at(-1)).toBe(now + (rain ? 2 : 12) * 3_600_000)
      for (const [index, epoch] of loopEpochs.entries()) {
        expect(epoch).toBe(now + ((rain ? -60 : -120) + index * (rain ? 0.75 : 5)) * 60_000)
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
        // Regen: alleen stills binnen −1…+2 u die op het 45-secondenraster vallen (veelvouden van 30 min) delen een loopframe.
        const inLoop = mode === 'feels' ? true : frame.hour >= -1 && frame.hour <= 2 && Number.isInteger(frame.hour * 2)
        if (inLoop) {
          expect(frame.index).toBe(mode === 'feels' ? Math.round(frame.hour * 12) + 24 : Math.round((frame.hour + 1) * 80))
          expect(frame.index).toBeLessThan(plan.loopFrames)
        } else {
          expect(frame.index).toBeGreaterThanOrEqual(plan.loopFrames)
        }
      }
      expect(plan.stillFrames.find((frame) => frame.hour === 0)?.index).toBe(mode === 'weather' ? 80 : 24)
      expect(plan.stillFrames.find((frame) => frame.hour === 12)?.index).toBe(mode === 'weather' ? 318 : 168)
    }
    const rain = sequencePlan('weather', manifest)
    expect(rain.stillFrames.filter((frame) => frame.index < rain.loopFrames)).toHaveLength(7)
    // Buiten de loop, in STILL_HOURS-volgorde: −2 u…−1 u (6), de 10-minutenstills binnen de loop die niet op het 45-s-raster
    // vallen (12), dan +2 u 10 min…+12 u (60).
    const outside = Array.from({ length: 85 }, (_, index) => -120 + index * 10).filter((minute) => minute < -60 || minute > 120 || minute % 30 !== 0)
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
