import { describe, expect, it } from 'vitest'
import { cloudBand, cloudExtents, layerTransmission, lightDarkness, skyAt, skyDarkness, skyStars, skyStops, skyStrokes, sunCrossings, valueNoise } from './cloud-section'
import type { ManifestChunk, TimelineFrame } from './contract'

const hour = 3_600_000
const start = Date.parse('2026-08-28T12:00:00Z')
const chunk = { url: 'chunks/cloud_low.mrf', source: 'harmonie', field: 'cloud_low', run: '2026-08-28T12:00:00Z', header_len: 0, times: [] } as ManifestChunk

function frames(count: number): TimelineFrame[] {
  return Array.from({ length: count }, (_, index) => ({
    time: new Date(start + index * hour).toISOString(), epoch: start + index * hour, source: 'harmonie', run: chunk.run, chunk, frameIndex: index,
  }))
}

describe('cloudExtents', () => {
  const span = 96 * hour
  const period = 2 * hour
  const constant = (percent: number) => cloudExtents(frames(97), new Array(97).fill(percent), 'low', start, start + span, period)
  const covered = (extents: ReturnType<typeof constant>) => extents.reduce((sum, extent) => sum + Math.min(start + span, extent.to) - Math.max(start, extent.from), 0) / span

  it('draws nothing for clear sky or missing data', () => {
    expect(constant(0)).toEqual([])
  })

  it('grows in number, not in size, up to half cover, and covers the fraction there (PO 2026-10-16)', () => {
    const counts = [10, 25, 50].map((percent) => constant(percent).filter((extent) => extent.row === 0).length)
    expect(counts[0]!).toBeLessThan(counts[1]!)
    expect(counts[1]!).toBeLessThan(counts[2]!)
    for (const percent of [10, 25, 50]) {
      const front = constant(percent).filter((extent) => extent.row === 0)
      expect(Math.abs(covered(front) - percent / 100)).toBeLessThan(0.05)
      expect(Math.min(...front.map((extent) => extent.to - extent.from))).toBeGreaterThanOrEqual(0.4 * period - 1)
      expect(constant(percent).some((extent) => extent.row === 1)).toBe(false)
    }
  })

  it('leaves no long empty stretch where the cover is high: clouds follow the percentage, not a lottery per slot', () => {
    for (const percent of [50, 70, 85]) {
      const front = constant(percent).filter((extent) => extent.row === 0).sort((left, right) => left.from - right.from)
      for (let index = 1; index < front.length; index++) expect(front[index]!.from - front[index - 1]!.to).toBeLessThanOrEqual(0.65 * period)
    }
  })

  it('stacks a second row behind the first above half cover and closes it into a deck from CLOSED_FRACTION up', () => {
    const backCounts = [60, 75, 85].map((percent) => constant(percent).filter((extent) => extent.row === 1).length)
    expect(backCounts[0]!).toBeGreaterThan(0)
    expect(backCounts[0]!).toBeLessThan(backCounts[1]!)
    expect(backCounts[1]!).toBeLessThan(backCounts[2]!)
    const overcast = constant(100)
    expect(overcast.filter((extent) => extent.closed)).toHaveLength(1)
    expect(overcast.find((extent) => extent.closed)!.row).toBe(1)
    expect(overcast.filter((extent) => extent.row === 0).length).toBeGreaterThan(0)
  })

  it('keeps the same clouds when the view scrolls', () => {
    const values = new Array(97).fill(40)
    const early = cloudExtents(frames(97), values, 'low', start, start + 48 * hour, period)
    const later = cloudExtents(frames(97), values, 'low', start + 5 * hour, start + 53 * hour, period)
    const inBoth = (extent: { from: number; to: number }) => extent.from >= start + 6 * hour && extent.to <= start + 47 * hour
    expect(later.filter(inBoth)).toEqual(early.filter(inBoth))
  })
})

describe('cloudBand', () => {
  const geometry = { width: 300, top: 10, height: 30, start, end: start + 8 * hour }

  it('is empty under a clear sky', () => {
    expect(cloudBand(frames(9), new Array(9).fill(0), 'low', geometry)).toEqual({ paths: [], back: [] })
  })

  it('draws broken cloud as separate shapes and overcast as one band, inside its strip', () => {
    // Zestien uur: midden heeft een periode van 5 uur (PO 2026-10-16: meer ruimte tussen de wolken).
    const wide = { ...geometry, width: 600, end: start + 16 * hour }
    for (const layer of ['high', 'mid', 'low'] as const) {
      const broken = cloudBand(frames(17), new Array(17).fill(50), layer, wide)
      expect(broken.paths.length).toBeGreaterThan(1)
      const overcast = cloudBand(frames(17), new Array(17).fill(100), layer, wide)
      // Bewolkt: een dek achter plus een volle rij wolken ervoor; half bewolkt nog geen achterste rij.
      expect(overcast.back.length).toBeGreaterThan(0)
      expect(broken.back).toEqual([])
      const ys = [...broken.paths, ...overcast.paths, ...overcast.back].join(' ').match(/-?\d+(\.\d+)?/g)!.map(Number).filter((_, index) => index % 2 === 1)
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
      const ys = [...band.paths, ...band.back].join(' ').match(/-?\d+(\.\d+)?/g)!.map(Number).filter((_, index) => index % 2 === 1)
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
    expect(skyDarkness(1)).toBe(0)
    expect(skyDarkness(0.8)).toBe(0)
    expect(skyDarkness(0)).toBe(1)
    expect(skyDarkness(0.05)).toBe(1)
    let previous = 0
    for (const light of [0.7, 0.5, 0.35, 0.25, 0.15]) {
      const darkness = skyDarkness(light)
      expect(darkness).toBeGreaterThan(previous)
      previous = darkness
    }
    // Elke halvering van het licht telt even zwaar.
    expect(skyDarkness(0.25) - skyDarkness(0.5)).toBeCloseTo(skyDarkness(0.125) - skyDarkness(0.25))
    // De tabel (U42) gebruikt de schaal zonder mooi-weermarge.
    expect(lightDarkness(1)).toBe(0)
    expect(lightDarkness(0.5)).toBeCloseTo(1 / 3)
    expect(lightDarkness(0.25)).toBeCloseTo(2 / 3)
    expect(lightDarkness(0.125)).toBe(1)
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

  it('blends the darkness over time instead of jumping per hour', () => {
    // Om het uur afwisselend heldere en loodgrijze lucht: de uurstops gaven daar harde banen.
    const stops = skyStops(noon - 6 * hour, noon + 6 * hour, {
      lightAt: (epoch) => Math.floor(epoch / hour) % 2 === 0 ? 1 : 0.125,
      coverAt: () => clear,
      sinElevation,
    })
    expect(stops.length).toBeGreaterThan(24)
    const darkness = stops.map((stop) => stop.darkness)
    const steps = darkness.slice(1).map((value, index) => Math.abs(value - darkness[index]!))
    expect(Math.max(...steps)).toBeLessThan(0.15)
    const bends = darkness.slice(2).map((value, index) => Math.abs(value - 2 * darkness[index + 1]! + darkness[index]!))
    expect(Math.max(...bends)).toBeLessThan(0.08)
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
