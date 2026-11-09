import { afterEach, expect, it, vi } from 'vitest'
import { NativeTemperatureData } from './native-temperature.js'
import { NativeRainData } from './native-rain.js'
import { ISOLINE_RING_KM } from '../web/src/core/isolines.js'
import { shortRings } from '../web/src/core/isoline-contours.js'
import type { Grid, MrfHeader } from '../web/src/core/contract.js'
import type { StillManifest } from './stills.js'

const grid: Grid = { crs: 'EPSG:3857', x0: 250000, y0: 7300000, dx: 150000, dy: -150000, width: 4, height: 4 }
const times = Array.from({ length: 5 }, (_, index) => `2026-10-09T${String(10 + index).padStart(2, '0')}:00:00Z`)
const now = times[2]!
const header = { grid, quant: Array.from({ length: 256 }, (_, index) => index === 255 ? null : index * 10) } as MrfHeader
const manifest = { version: 0, now, generated: now, chunks: [{ url: 'feels.mrf', field: 'feels_like_c', source: 'harmonie', run: times[0], times }] } as StillManifest

afterEach(() => vi.restoreAllMocks())

it('uses the right raster at an exact hour and applies the app’s temporal spline between hours', async () => {
  vi.spyOn(NativeRainData.prototype, 'frame').mockImplementation(async (epoch) => {
    const index = times.findIndex((time) => Date.parse(time) === epoch)
    if (index < 0) throw new Error('Fixture verwacht een exact uur')
    return { grid, left: new Uint8Array(16).fill(Math.max(0, index - 1)), right: new Uint8Array(16).fill(index), mix: index === 0 ? 0 : 1, leftHeader: header, rightHeader: header, intervalMinutes: 60 }
  })
  const data = new NativeTemperatureData('https://fixture.test', manifest)
  await data.prepare()
  expect(Array.from((await data.slice(Date.parse(now))).field.values)).toEqual(new Array(16).fill(20))
  const epoch = Date.parse(now) + 1800000
  const eager = await data.slice(epoch)
  for (const value of eager.field.values) expect(value).toBeCloseTo(25, 5)
  const compact = await data.slice(epoch, { rasterizeRings: false })
  const deferred = await data.rasterSlice(epoch, { grid: compact.grid, kind: compact.kind, segments: compact.segments, opacity: compact.opacity, rings: shortRings(compact.contours, ISOLINE_RING_KM) })
  expect(deferred).toMatchObject({ field: eager.field, rings: eager.rings, colors: eager.colors, segments: eager.segments, opacity: eager.opacity })
  expect((await data.slice(Date.parse(times[0]!) - 1200000)).opacity).toBe(0)
})

it('turns u and v into the continuous Beaufort field and colours band k as Beaufort class k', async () => {
  const windManifest = { ...manifest, chunks: ['wind_u_ms', 'wind_v_ms'].map((field) => ({ ...manifest.chunks[0]!, url: `${field}.mrf`, field })) } as StillManifest
  // u = 6, v = 8: 10 m/s, in 5 Bft (8,0–10,8 m/s).
  const windHeader = { ...header, quant: Array.from({ length: 256 }, (_, index) => index === 255 ? null : index) }
  vi.spyOn(NativeRainData.prototype, 'frame').mockImplementation(async function (this: NativeRainData) {
    const value = this.timeline[0]!.chunk.url.startsWith('wind_u') ? 6 : 8
    return { grid, left: new Uint8Array(16).fill(value), right: new Uint8Array(16).fill(value), mix: 1, leftHeader: windHeader, rightHeader: windHeader, intervalMinutes: 60 }
  })
  const data = new NativeTemperatureData('https://fixture.test', windManifest, 'wind')
  await data.prepare()
  const slice = await data.slice(Date.parse(now))
  expect(slice.kind).toBe('wind')
  expect(slice.labelLines).toBeUndefined()
  for (const value of slice.field.values) expect(value).toBeCloseTo(5 + (10 - 8) / (10.8 - 8), 1)
  expect([...slice.colors.subarray((128 + 5) * 3, (128 + 5) * 3 + 3)].map((channel) => Math.round(channel * 255))).toEqual([0x5a, 0xa5, 0x47])
})
