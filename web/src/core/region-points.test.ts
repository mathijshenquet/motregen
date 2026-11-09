import { describe, expect, it, vi } from 'vitest'
import { ZstdCodec } from 'zstd-codec'
import type { Manifest, MotionField, MrfHeader, RegionsSection } from './contract'
import { pointValue, pointValueBilinear } from './point-value'
import { motionAtPatch, rainPatch } from './rain-point-detail'
import { parseRegionFile, RegionPoints, regionOf, type RegionChunkEntry, type RegionWindow } from './region-points'

const zstd = await new Promise<{ compress(data: Uint8Array, level?: number): Uint8Array }>((done) => ZstdCodec.run((codec) => done(new codec.Simple())))

// 60 × 60 cellen van 1 km, drie frames; regen-quant (0 = droog, 255 = no-data).
const grid = { crs: 'EPSG:3857' as const, x0: 0, y0: 60_000, dx: 1_000, dy: -1_000, width: 60, height: 60 }
const quant = [...Array.from({ length: 255 }, (_, index) => index / 10), null]
const header = { version: 0, field: 'rain_rate', grid, quant, source: 'rtcor', run: 'r', frames: [], dict: null } as unknown as MrfHeader
const frames = [0, 1, 2].map((frame) => Uint8Array.from({ length: 3_600 }, (_, cell) => (cell * 7 + frame * 31) % 250))
// Bewegingsgrid van 10 × 10 blokken (6 × 6 cellen), alleen frames 1 en 2.
const motions: Array<MotionField | undefined> = [undefined, ...[1, 2].map((frame) => ({
  width: 10, height: 10, vectors: Uint8Array.from({ length: 200 }, (_, index) => ((index * 13 + frame * 5) % 200) - 100 & 0xff),
}))]

function regionFile(window: RegionWindow, motionWindow: RegionWindow, frameIndexes?: number[]): Uint8Array {
  const kept = frameIndexes ?? [0, 1, 2]
  const payload: number[] = []
  for (let row = window.row; row < window.row + window.height; row++) {
    for (let column = window.column; column < window.column + window.width; column++) {
      for (const frame of kept) payload.push(frames[frame]![row * grid.width + column]!)
    }
  }
  const motionOffset = payload.length
  for (const frame of [1, 2]) {
    for (let row = motionWindow.row; row < motionWindow.row + motionWindow.height; row++) {
      for (let column = motionWindow.column; column < motionWindow.column + motionWindow.width; column++) {
        const at = (row * 10 + column) * 2
        payload.push(motions[frame]!.vectors[at]!, motions[frame]!.vectors[at + 1]!)
      }
    }
  }
  const entry: RegionChunkEntry = {
    url: 'chunks/rtcor.mrf', source: 'rtcor', field: 'rain_rate', run: 'r', table: 't1', window, frames: kept.length,
    ...frameIndexes ? { frame_indexes: frameIndexes } : {},
    offset: 0, motion: { grid: { bw: 10, bh: 10 }, window: motionWindow, frames: [1, 2], offset: motionOffset },
  }
  const json = new TextEncoder().encode(JSON.stringify({ version: 1, group: 'radar', region: 0, chunks: [entry] }))
  const raw = new Uint8Array(4 + json.length + payload.length)
  new DataView(raw.buffer).setUint32(0, json.length, true)
  raw.set(json, 4)
  raw.set(payload, 4 + json.length)
  const compressed = zstd.compress(raw, 3)
  const bytes = new Uint8Array(4 + compressed.length)
  bytes.set(new TextEncoder().encode('mrr1'))
  bytes.set(compressed, 4)
  return bytes
}

// Eén regio van 20 × 20 km midden in het raster; de marge van 17 cellen raakt de rand niet.
const section: RegionsSection = {
  version: 1, crs: 'EPSG:3857', west: 20_000, east: 40_000, north: 40_000, south: 20_000, columns: 1, rows: 1, present: [0],
  tables: 'regions/tables-x.json', groups: [{ name: 'radar', url: 'regions/radar-x/', chunks: ['chunks/rtcor.mrf'] }],
}
const manifest = { version: 0, generated: '', now: '', chunks: [], regions: section } as unknown as Manifest
const fullWindow = { column: 3, row: 3, width: 54, height: 54 }
const fullMotion = { column: 0, row: 0, width: 10, height: 10 }
const tables = new TextEncoder().encode(JSON.stringify({ version: 1, tables: { t1: { grid, quant } } }))

function points(file: Uint8Array) {
  const fetchBytes = vi.fn(async (url: string) => url.endsWith('.json') ? tables : url.endsWith('/radar-x/0.mrr') ? file : undefined)
  return { fetchBytes, reader: new RegionPoints('https://example.test/data/manifest.json', fetchBytes) }
}

const places = [[20_000.5, 39_999.5], [30_400, 30_600], [39_999, 20_001], [25_123, 33_877]] as const

describe('region points', () => {
  it('reads the same values, patches and motion as the raster', async () => {
    const { reader } = points(regionFile(fullWindow, fullMotion))
    for (const [x, y] of places) {
      const chunk = (await reader.chunk(manifest, 'chunks/rtcor.mrf', x, y))!
      expect(chunk).toBeDefined()
      for (const frame of [0, 1, 2]) {
        expect(chunk.value(frame, x, y)).toBe(pointValue(header, frames[frame]!, x, y))
        expect(chunk.bilinear(frame, x, y)).toBe(pointValueBilinear(header, frames[frame]!, x, y))
        const patch = chunk.patch(frame, x, y)!
        expect(patch).toEqual(rainPatch(header, frames[frame]!, x, y))
        if (frame > 0) expect(motionAtPatch(chunk.motion(frame, x, y)!, patch)).toEqual(motionAtPatch(motions[frame]!, patch))
      }
      expect(chunk.hasMotion(0)).toBe(false)
      expect(chunk.motion(0, x, y)).toBeUndefined()
    }
  })

  it('says undefined where a smaller file lacks a cell, frame or motion block, so the raster is read', async () => {
    const { reader } = points(regionFile({ column: 18, row: 18, width: 24, height: 24 }, { column: 3, row: 3, width: 4, height: 4 }, [0, 2]))
    const chunk = (await reader.chunk(manifest, 'chunks/rtcor.mrf', 30_400, 30_600))!
    expect(chunk.value(0, 30_400, 30_600)).toBe(pointValue(header, frames[0]!, 30_400, 30_600))
    expect(chunk.value(2, 30_400, 30_600)).toBe(pointValue(header, frames[2]!, 30_400, 30_600))
    expect(chunk.value(1, 30_400, 30_600)).toBeUndefined()
    expect(chunk.patch(0, 30_400, 30_600)).toBeUndefined()
    expect(chunk.motion(2, 39_999, 20_001)).toBeUndefined()
    expect(chunk.motion(2, 30_400, 30_600)).toBeDefined()
  })

  it('falls back outside the frame, for absent regions, unknown chunks and missing files', async () => {
    const { reader, fetchBytes } = points(regionFile(fullWindow, fullMotion))
    expect(await reader.chunk(manifest, 'chunks/rtcor.mrf', 19_999, 30_000)).toBeUndefined()
    expect(await reader.chunk(manifest, 'chunks/harmonie.mrf', 30_000, 30_000)).toBeUndefined()
    expect(await reader.chunk({ ...manifest, regions: undefined }, 'chunks/rtcor.mrf', 30_000, 30_000)).toBeUndefined()
    const missing = { ...manifest, regions: { ...section, groups: [{ ...section.groups[0]!, url: 'regions/radar-gone/' }] } }
    expect(await reader.chunk(missing, 'chunks/rtcor.mrf', 30_000, 30_000)).toBeUndefined()
    await reader.chunk(manifest, 'chunks/rtcor.mrf', 30_000, 30_000)
    await reader.chunk(manifest, 'chunks/rtcor.mrf', 31_000, 31_000)
    expect(fetchBytes.mock.calls.filter(([url]) => url === 'https://example.test/data/regions/radar-x/0.mrr')).toHaveLength(1)
  })

  it('finds the region of a point like the ingest does', () => {
    const grid14 = { ...section, west: 258_000, east: 834_000, north: 7_132_000, south: 6_502_000, columns: 14, rows: 15, present: [0, 209] }
    expect(regionOf(grid14, 258_000, 7_132_000)).toBe(0)
    expect(regionOf(grid14, 833_999, 6_502_001)).toBe(209)
    expect(regionOf(grid14, 834_000, 7_000_000)).toBeUndefined()
    expect(regionOf(grid14, 300_000, 6_502_000)).toBeUndefined()
    expect(regionOf(grid14, 300_000, 7_000_000)).toBeUndefined()
  })

  it('rejects files of another format', () => {
    expect(() => parseRegionFile(new TextEncoder().encode('mrf0abcd'))).toThrow()
  })
})
