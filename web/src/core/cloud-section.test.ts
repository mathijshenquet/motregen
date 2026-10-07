import { describe, expect, it } from 'vitest'
import { CLOSED_FRACTION, cloudBand, cloudExtents, cloudSpanInSlot, layerTransmission, lightDarkness, skyAt, skyStars, skyStops, skyStrokes, sunCrossings, valueNoise } from './cloud-section'
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

describe('light and sky', () => {
  const noon = Date.parse('2026-08-28T12:00:00Z')
  const clear = { high: 0, mid: 0, low: 0 }
  const overcast = { high: 1, mid: 1, low: 1 }
  // Zon op om 06:00, onder om 18:00 UTC.
  const sinElevation = (epoch: number) => Math.sin((epoch - noon) / (24 * hour) * 2 * Math.PI + Math.PI / 2)

  it('lets a closed cirrus deck pass most light and a closed low deck about a quarter', () => {
    expect(layerTransmission(clear)).toBe(1)
    expect(layerTransmission({ ...clear, high: 1 })).toBeCloseTo(0.75)
    expect(layerTransmission({ ...clear, low: 1 })).toBeCloseTo(0.25)
    expect(layerTransmission(overcast)).toBeLessThan(0.1)
    expect(layerTransmission({ high: 4, mid: -1, low: 0 })).toBeCloseTo(0.75)
  })

  it('maps light to darkness on a logarithmic scale and keeps fair weather bright', () => {
    expect(lightDarkness(1)).toBe(0)
    expect(lightDarkness(0.8)).toBe(0)
    expect(lightDarkness(0)).toBe(1)
    expect(lightDarkness(0.05)).toBe(1)
    let previous = 0
    for (const light of [0.7, 0.5, 0.35, 0.25, 0.15]) {
      const darkness = lightDarkness(light)
      expect(darkness).toBeGreaterThan(previous)
      previous = darkness
    }
    // Elke halvering van het licht telt even zwaar.
    expect(lightDarkness(0.25) - lightDarkness(0.5)).toBeCloseTo(lightDarkness(0.125) - lightDarkness(0.25))
  })

  it('builds hourly stops from radiation by day and from the layers at night', () => {
    const stops = skyStops(noon - 12 * hour, noon + 12 * hour, {
      lightAt: (epoch) => sinElevation(epoch) > 0.2 ? 0.2 : null,
      coverAt: () => clear,
      sinElevation,
    })
    expect(stops[0]!.offset).toBe(0)
    expect(stops.at(-1)!.offset).toBe(1)
    const midday = skyAt(stops, 0.5)
    const midnight = skyAt(stops, 0)
    expect(midday.daylight).toBe(1)
    expect(midday.darkness).toBeGreaterThan(0.6)
    expect(midnight.daylight).toBe(0)
    expect(midnight.darkness).toBe(0)
    // Gloed alleen rond de schemering.
    expect(midday.glow).toBe(0)
    expect(midnight.glow).toBe(0)
    expect(Math.max(...stops.map((stop) => stop.glow))).toBeGreaterThan(0.5)
  })

  it('finds sunrise and sunset', () => {
    const crossings = sunCrossings(noon - 12 * hour, noon + 12 * hour, sinElevation)
    expect(crossings.map((crossing) => crossing.rising)).toEqual([true, false])
    expect(Math.abs(crossings[0]!.epoch - (noon - 6 * hour))).toBeLessThan(60_000)
    expect(Math.abs(crossings[1]!.epoch - (noon + 6 * hour))).toBeLessThan(60_000)
  })

  it('shows stars only in a clear night and strokes only by day', () => {
    const sky = (cover: typeof clear) => skyStops(noon - 12 * hour, noon + 12 * hour, { lightAt: () => null, coverAt: () => cover, sinElevation })
    const width = 2_400
    const stars = skyStars(width, 160, 100, sky(clear))
    expect(stars.length).toBeGreaterThan(10)
    // Dag loopt van een kwart tot driekwart van de breedte.
    for (const star of stars) expect(star.x < width * 0.3 || star.x > width * 0.7).toBe(true)
    expect(skyStars(width, 160, 100, sky(overcast))).toEqual([])
    const strokes = skyStrokes(width, 160, 100, sky(clear))
    expect(strokes.length).toBeGreaterThan(10)
    for (const stroke of strokes) {
      expect(stroke.path).not.toContain('NaN')
      const firstX = Number(stroke.path.slice(1).split(' ')[0])
      expect(firstX).toBeGreaterThan(width * 0.1)
      expect(firstX).toBeLessThan(width * 0.8)
    }
  })
})
