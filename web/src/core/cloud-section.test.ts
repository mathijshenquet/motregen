import { describe, expect, it } from 'vitest'
import { cloudBand, cloudDrawParams, valueNoise } from './cloud-section'
import type { ManifestChunk, TimelineFrame } from './contract'

const hour = 3_600_000
const start = Date.parse('2026-08-28T12:00:00Z')
const chunk = { url: 'chunks/cloud_low.mrf', source: 'harmonie', field: 'cloud_low', run: '2026-08-28T12:00:00Z', header_len: 0, times: [] } as ManifestChunk

function frames(count: number): TimelineFrame[] {
  return Array.from({ length: count }, (_, index) => ({
    time: new Date(start + index * hour).toISOString(), epoch: start + index * hour, source: 'harmonie', run: chunk.run, chunk, frameIndex: index,
  }))
}

describe('cloudDrawParams', () => {
  it('draws nothing for clear sky or missing data', () => {
    for (const percent of [0, null, undefined, Number.NaN, -5]) expect(cloudDrawParams(percent)).toEqual({ opacity: 0, thickness: 0, ragged: 0 })
  })

  it('grows opacity and thickness monotonically with the fraction', () => {
    let previous = cloudDrawParams(0)
    for (let percent = 5; percent <= 100; percent += 5) {
      const params = cloudDrawParams(percent)
      expect(params.opacity).toBeGreaterThan(previous.opacity)
      expect(params.thickness).toBeGreaterThan(previous.thickness)
      previous = params
    }
    expect(cloudDrawParams(100)).toEqual({ opacity: 0.9, thickness: 1, ragged: 0 })
    expect(cloudDrawParams(140)).toEqual(cloudDrawParams(100))
  })

  it('keeps a wisp visible and frays broken cloud the most', () => {
    expect(cloudDrawParams(5).thickness).toBeGreaterThan(0.3)
    expect(cloudDrawParams(50).ragged).toBe(1)
    expect(cloudDrawParams(20).ragged).toBeLessThan(cloudDrawParams(50).ragged)
    expect(cloudDrawParams(90).ragged).toBeLessThan(cloudDrawParams(50).ragged)
  })
})

describe('cloudBand', () => {
  const geometry = { width: 300, top: 10, height: 30, start, end: start + 8 * hour }

  it('is empty under a clear sky', () => {
    const band = cloudBand(frames(9), new Array(9).fill(0), 'low', geometry)
    expect(band.paths).toEqual([])
    expect(band.stops.every((stop) => stop.opacity === 0)).toBe(true)
  })

  it('splits into separate shapes around a clear gap and stays inside its strip', () => {
    const values = [80, 80, 80, 0, 0, 0, 60, 60, 60]
    const band = cloudBand(frames(9), values, 'mid', geometry)
    expect(band.paths).toHaveLength(2)
    const ys = band.paths.join(' ').match(/-?\d+(\.\d+)?/g)!.map(Number).filter((_, index) => index % 2 === 1)
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(geometry.top)
    expect(Math.max(...ys)).toBeLessThanOrEqual(geometry.top + geometry.height)
  })

  it('carries the hourly cover in the opacity gradient and renders deterministically', () => {
    const values = [0, 25, 50, 75, 100, 75, 50, 25, 0]
    const band = cloudBand(frames(9), values, 'high', geometry)
    expect(band.stops.map((stop) => stop.offset)).toEqual([0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1])
    expect(band.stops[4]!.opacity).toBe(0.9)
    expect(band.stops[2]!.opacity).toBe(0.45)
    expect(cloudBand(frames(9), values, 'high', geometry)).toEqual(band)
  })
})

describe('valueNoise', () => {
  it('is smooth and bounded', () => {
    for (let x = 0; x < 50; x += 0.07) {
      expect(Math.abs(valueNoise(x))).toBeLessThanOrEqual(1)
      expect(Math.abs(valueNoise(x + 0.01) - valueNoise(x))).toBeLessThan(0.1)
    }
  })
})
