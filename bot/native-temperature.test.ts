import { afterEach, expect, it, vi } from 'vitest'
import { NativeTemperatureData } from './native-temperature.js'
import { NativeRainData } from './native-rain.js'
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
  for (const value of (await data.slice(Date.parse(now) + 1800000)).field.values) expect(value).toBeCloseTo(25, 5)
  expect((await data.slice(Date.parse(times[0]!) - 1200000)).opacity).toBe(0)
})
