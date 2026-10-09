import { afterEach, expect, it, vi } from 'vitest'
import { NativeRainData, RainCompositor, rainTheme, type RainFrame } from './native-rain.js'
import { rainRenderer } from './native-settings.js'
import type { Grid, MrfHeader } from '../web/src/core/contract.js'
import { NATIVE_VIEW } from './native-view.js'
import { cacheKey, type StillManifest } from './stills.js'

const now = '2026-10-09T12:00:00Z'
const metersPerPixel = 2 * Math.PI * 6378137 / (512 * 2 ** NATIVE_VIEW.zoom * (4 / 640))
const centerX = NATIVE_VIEW.lng * Math.PI / 180 * 6378137
const centerY = Math.log(Math.tan(Math.PI / 4 + NATIVE_VIEW.lat * Math.PI / 360)) * 6378137
const grid: Grid = { crs: 'EPSG:3857', x0: centerX - metersPerPixel * 2, y0: centerY + metersPerPixel * 2, dx: metersPerPixel, dy: -metersPerPixel, width: 4, height: 4 }
const header: MrfHeader = { version: 0, grid, quant: Array.from({ length: 256 }, (_, index) => index === 255 ? null : index), source: 'rtcor', run: now, dict: null, frames: [{ time: now, offset: 0, len: 25 }] }
function frame(left: Uint8Array, right = left, mix = 0): RainFrame { return { grid, left, right, mix, leftHeader: header, rightHeader: header, intervalMinutes: 5 } }
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })

it('keeps dry/no-data cells transparent and follows the app’s premultiplied canvas blending', () => {
  const compositor = new RainCompositor(grid, { width: 4, height: 4 })
  const base = new Uint8Array(48).fill(100)
  expect(compositor.compose(base, frame(new Uint8Array(16)), false)).toEqual(Buffer.from(base))
  expect(compositor.compose(base, frame(new Uint8Array(16).fill(255)), false)).toEqual(Buffer.from(base))
  const wet = compositor.compose(base, frame(new Uint8Array(16).fill(100)), false)
  expect([...wet.subarray(15, 18)]).toEqual([81, 202, 184])
  expect(compositor.compose(base, frame(new Uint8Array(16), new Uint8Array(16).fill(100), 0.5), false)).toEqual(compositor.compose(base, frame(new Uint8Array(16).fill(50)), false))
})

it('fetches each pinned chunk once, uses the shared decoder and rejects mismatched frame times', async () => {
  const json = Buffer.from(JSON.stringify(header))
  const prefix = Buffer.alloc(8); prefix.write('mrf0'); prefix.writeUInt32LE(json.length, 4)
  const rawZstd = Uint8Array.from([0x28, 0xb5, 0x2f, 0xfd, 0x20, 16, 0x81, 0, 0, ...new Uint8Array(16).fill(100)])
  const payload = Buffer.concat([prefix, json, rawZstd])
  const fetchMock = vi.fn(async () => new Response(payload))
  vi.stubGlobal('fetch', fetchMock)
  const manifest: StillManifest = { version: 0, generated: now, now, chunks: [{ url: 'chunks/rain.mrf', field: 'rain_rate', times: [now], ...{ source: 'rtcor', run: now, header_len: prefix.length + json.length } }] }
  const data = new NativeRainData('https://motregen.nl', manifest)
  await data.prefetch([Date.parse(now), Date.parse(now)])
  expect(Array.from((await data.frame(Date.parse(now))).left)).toEqual(Array(16).fill(100))
  await data.frame(Date.parse(now))
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(fetchMock.mock.calls[0]?.[0]).toBeInstanceOf(URL)
  await expect(data.frame(Date.parse(now) - 1)).rejects.toThrow('buiten')
  const mismatch = new NativeRainData('https://motregen.nl', { ...manifest, chunks: [{ ...manifest.chunks[0]!, times: ['2026-10-09T12:05:00Z'] }] })
  await expect(mismatch.frame(Date.parse('2026-10-09T12:05:00Z'))).rejects.toThrow('wijkt af')
})

it('chooses the map time’s day/night theme and isolates the fallback cache', () => {
  expect(rainTheme(Date.parse(now))).toBe('light')
  expect(rainTheme(Date.parse('2026-10-09T22:00:00Z'))).toBe('dark')
  const manifest: StillManifest = { version: 0, generated: now, now, chunks: [] }
  const native = cacheKey({ mode: 'weather', hour: 'loop' }, manifest)
  vi.stubEnv('MOTREGEN_RAIN_RENDERER', 'playwright')
  expect(rainRenderer()).toBe('playwright')
  expect(cacheKey({ mode: 'weather', hour: 'loop' }, manifest)).not.toBe(native)
  vi.stubEnv('MOTREGEN_RAIN_RENDERER', 'invalid')
  expect(() => rainRenderer()).toThrow('native of playwright')
})


it('matches the scalar compositor with native bilinear projection, including no-data and fractional times', async () => {
  const compositor = new RainCompositor(grid, { width: 64, height: 64 })
  const base = new Uint8Array(64 * 64 * 3).fill(100)
  const left = Uint8Array.from([0, 0, 0, 0, 0, 80, 100, 140, 0, 100, 255, 190, 0, 140, 190, 220])
  const right = new Uint8Array(16).fill(80)
  await expect(compositor.composeFast(base, { ...frame(left), grid: { ...grid, dx: grid.dx * 2 } }, false)).rejects.toThrow('rooster wisselt')
  await expect(compositor.composeFast(base, frame(new Uint8Array(15)), false)).rejects.toThrow('framemaat')
  for (const mix of [0, 0.25, 0.5, 1]) {
    const input = frame(left, right, mix)
    const expected = compositor.compose(base, input, false), actual = await compositor.composeFast(base, input, false)
    expect([...actual].every((value, index) => Math.abs(value - expected[index]!) <= 1)).toBe(true)
    input.motion = { width: 2, height: 2, vectors: new Int8Array([1, 2, -128, -128, 20, 30, 100, 120]) }
    const warped = await compositor.composeFast(base, input, false)
    expect(warped).toEqual(compositor.compose(base, input, false))
  }
  await compositor.close()
})

it('prefilters a source-blur impulse in two quantized R8 passes and reuses the filtered frame', async () => {
  const compositor = new RainCompositor(grid, { width: 64, height: 64 })
  try {
    const base = new Uint8Array(64 * 64 * 3).fill(100)
    const impulse = new Uint8Array(16)
    impulse[5] = 200
    const input = { ...frame(impulse), leftSampling: { kernel: 'source-blur' as const, sourceCellWidth: 1, blurSigma: 1 } }
    const filtered = Uint8Array.from([12, 19, 12, 3, 20, 32, 20, 4, 12, 19, 12, 3, 3, 4, 3, 1])
    const expected = compositor.compose(base, frame(filtered), false)
    const actual = await compositor.composeFast(base, input, false)
    expect([...actual].every((value, index) => Math.abs(value - expected[index]!) <= 1)).toBe(true)
    expect(await compositor.composeFast(base, input, false)).toEqual(actual)
  } finally { await compositor.close() }
})

it('reuses a projected motion field across fractions and invalidates it when vectors or interval change', async () => {
  const compositor = new RainCompositor(grid, { width: 64, height: 64 })
  const base = new Uint8Array(64 * 64 * 3).fill(100)
  const left = Uint8Array.from({ length: 16 }, (_, index) => index * 13)
  const right = Uint8Array.from({ length: 16 }, (_, index) => 220 - index * 7)
  try {
    for (const [mix, intervalMinutes, direction] of [[0.25, 5, 1], [0.5, 5, 1], [0.75, 5, -1], [0.5, 3, -1], [0.5, 5, 1]]) {
      const input = { ...frame(left, right, mix), intervalMinutes: intervalMinutes!, motion: { width: 2, height: 2, vectors: Int8Array.from([1, 2, 3, 4, 2, 1, 4, 3], (value) => value * direction!) } }
      expect(await compositor.composeFast(base, input, false)).toEqual(compositor.compose(base, input, false))
    }
  } finally { await compositor.close() }
})
