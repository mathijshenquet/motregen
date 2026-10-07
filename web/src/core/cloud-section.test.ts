import { describe, expect, it } from 'vitest'
import { CLOSED_FRACTION, cloudBand, cloudExtents, cloudSpanInSlot, valueNoise } from './cloud-section'
import type { ManifestChunk, TimelineFrame } from './contract'

const hour = 3_600_000
const start = Date.parse('2026-08-28T12:00:00Z')
const chunk = { url: 'chunks/cloud_low.mrf', source: 'harmonie', field: 'cloud_low', run: '2026-08-28T12:00:00Z', header_len: 0, times: [] } as ManifestChunk

function frames(count: number): TimelineFrame[] {
  return Array.from({ length: count }, (_, index) => ({
    time: new Date(start + index * hour).toISOString(), epoch: start + index * hour, source: 'harmonie', run: chunk.run, chunk, frameIndex: index,
  }))
}

describe('cloudSpanInSlot', () => {
  it('draws nothing for clear sky or missing data', () => {
    for (const fraction of [0, -0.05, Number.NaN]) expect(cloudSpanInSlot(fraction, 3, 'low')).toBeNull()
  })

  it('closes the layer from CLOSED_FRACTION up', () => {
    expect(cloudSpanInSlot(CLOSED_FRACTION, 3, 'mid')).toEqual({ from: 0, to: 1, closed: true })
    expect(cloudSpanInSlot(1, 3, 'mid')).toEqual({ from: 0, to: 1, closed: true })
    expect(cloudSpanInSlot(CLOSED_FRACTION - 0.01, 3, 'mid')?.closed).not.toBe(true)
  })

  it('covers the fraction on average and always leaves air on both sides of a loose cloud', () => {
    const slots = 4_000
    for (const layer of ['high', 'mid', 'low'] as const) {
      for (const fraction of [0.1, 0.25, 0.5, 0.7, 0.85]) {
        let covered = 0
        for (let slot = 0; slot < slots; slot++) {
          const span = cloudSpanInSlot(fraction, slot, layer)
          if (!span) continue
          expect(span.from).toBeGreaterThan(0)
          expect(span.to).toBeLessThan(1)
          covered += span.to - span.from
        }
        expect(Math.abs(covered / slots - fraction)).toBeLessThan(0.03)
      }
    }
  })

  it('makes sparse cloud rarer instead of smaller', () => {
    const lengths = Array.from({ length: 200 }, (_, slot) => cloudSpanInSlot(0.1, slot, 'low')).flatMap((span) => span ? [span.to - span.from] : [])
    expect(lengths.length).toBeGreaterThan(30)
    expect(lengths.length).toBeLessThan(110)
    expect(Math.min(...lengths)).toBeGreaterThan(0.25)
  })
})

describe('cloudExtents', () => {
  it('merges neighbouring closed slots into one band and keeps loose clouds apart', () => {
    const closed = cloudExtents(frames(9), new Array(9).fill(100), 'mid', start, start + 8 * hour, hour)
    expect(closed).toHaveLength(1)
    expect(closed[0]!.to - closed[0]!.from).toBeGreaterThanOrEqual(8 * hour)
    const broken = cloudExtents(frames(9), new Array(9).fill(50), 'low', start, start + 8 * hour, hour)
    expect(broken.length).toBeGreaterThan(4)
    for (let index = 1; index < broken.length; index++) expect(broken[index]!.from).toBeGreaterThan(broken[index - 1]!.to)
  })
})

describe('cloudBand', () => {
  const geometry = { width: 300, top: 10, height: 30, start, end: start + 8 * hour }

  it('is empty under a clear sky', () => {
    expect(cloudBand(frames(9), new Array(9).fill(0), 'low', geometry).paths).toEqual([])
  })

  it('draws broken cloud as separate shapes and overcast as one band, inside its strip', () => {
    for (const layer of ['high', 'mid', 'low'] as const) {
      const broken = cloudBand(frames(9), new Array(9).fill(50), layer, geometry)
      expect(broken.paths.length).toBeGreaterThan(2)
      const overcast = cloudBand(frames(9), new Array(9).fill(100), layer, geometry)
      // Cirrus is ook gesloten een bundel losse vegen; laag en midden sluiten tot één vorm.
      if (layer === 'high') expect(overcast.paths.length).toBeGreaterThan(broken.paths.length)
      else expect(overcast.paths).toHaveLength(1)
      const ys = [...broken.paths, ...overcast.paths].join(' ').match(/-?\d+(\.\d+)?/g)!.map(Number).filter((_, index) => index % 2 === 1)
      expect(Math.min(...ys)).toBeGreaterThanOrEqual(geometry.top)
      expect(Math.max(...ys)).toBeLessThanOrEqual(geometry.top + geometry.height)
    }
  })

  it('renders deterministically', () => {
    const values = [0, 25, 50, 75, 100, 75, 50, 25, 0]
    expect(cloudBand(frames(9), values, 'high', geometry)).toEqual(cloudBand(frames(9), values, 'high', geometry))
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

describe('low cloud base', () => {
  it('keeps air between the flat base and the bottom of the strip', () => {
    const geometry = { width: 300, top: 10, height: 30, start, end: start + 8 * hour }
    for (const percent of [50, 100]) {
      const band = cloudBand(frames(9), new Array(9).fill(percent), 'low', geometry)
      const ys = band.paths.join(' ').match(/-?\d+(\.\d+)?/g)!.map(Number).filter((_, index) => index % 2 === 1)
      expect(Math.max(...ys)).toBeLessThan(geometry.top + geometry.height * 0.8)
      expect(Math.min(...ys)).toBeGreaterThan(geometry.top)
    }
  })
})
