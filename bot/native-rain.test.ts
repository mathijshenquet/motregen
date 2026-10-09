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
  expect((await data.frame(Date.parse(now))).left).toEqual(new Uint8Array(16).fill(100))
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
