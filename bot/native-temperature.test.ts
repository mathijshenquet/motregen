import { afterEach, expect, it, vi } from 'vitest'
import { NativeTemperatureData } from './native-temperature.js'
import { NativeRainData } from './native-rain.js'
import { prepareField } from '../web/src/core/isoline-field.js'
import { adaptiveIsobarStep, ISOLINE_RING_KM } from '../web/src/core/isolines.js'
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
  await data.prepare([Date.parse(now), Date.parse(now) + 1800000])
  expect(Array.from((await data.slice(Date.parse(now))).field.values)).toEqual(new Array(16).fill(20))
  const epoch = Date.parse(now) + 1800000
  const eager = await data.slice(epoch)
  for (const value of eager.field.values) expect(value).toBeCloseTo(25, 5)
  const compact = await data.slice(epoch, false)
  const deferred = await data.rasterSlice(epoch, { grid: compact.grid, kind: compact.kind, segments: compact.segments, opacity: compact.opacity, rings: shortRings(compact.contours, ISOLINE_RING_KM) })
  expect(deferred).toMatchObject({ field: eager.field, rings: eager.rings, colors: eager.colors, segments: eager.segments, opacity: eager.opacity })
  expect((await data.slice(Date.parse(times[0]!) - 1200000)).opacity).toBe(0)
})

it('starts pressure hysteresis at the app’s four-hPa step', async () => {
  const pressureManifest = { ...manifest, chunks: [{ ...manifest.chunks[0]!, field: 'pressure_hpa' }] } as StillManifest
  const pressureHeader = { ...header, quant: [1001, 1005, 1009, 1013] }
  const codes = Uint8Array.from({ length: 16 }, (_, index) => index % 4)
  vi.spyOn(NativeRainData.prototype, 'frame').mockResolvedValue({ grid, left: codes, right: codes, mix: 1, leftHeader: pressureHeader, rightHeader: pressureHeader, intervalMinutes: 60 })
  const data = new NativeTemperatureData('https://fixture.test', pressureManifest, 'pressure')
  vi.spyOn(data, 'field').mockResolvedValue(prepareField({ width: 4, height: 4, values: Float32Array.from(codes, (code) => pressureHeader.quant[code]!) }))
  expect(adaptiveIsobarStep(1001, 1013)).toBe(2)
  expect(adaptiveIsobarStep(1001, 1013, 4)).toBe(4)
  await data.prepare([Date.parse(now)])
  expect((await data.slice(Date.parse(now))).step).toBe(4)
})
