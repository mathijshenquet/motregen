import { describe, expect, it, vi } from 'vitest'
import { loadedWaterTiles, WaterTileCache, waterMaskNeedsRebuild } from './wind-water-mask'

describe('water mask rebuild', () => {
  const previous = { bounds: { west: 0.1, east: 0.9, north: 0.1, south: 0.9 }, zoom: 7, width: 1280, height: 720 }
  const current = { ...previous, bounds: { west: 0.2, east: 0.8, north: 0.2, south: 0.8 } }

  it('reuses the margin during small pans and zooms, including grid-clipped edges', () => {
    expect(waterMaskNeedsRebuild(previous, current, false)).toBe(false)
    expect(waterMaskNeedsRebuild(previous, { ...current, zoom: 7.24 }, false)).toBe(false)
    expect(waterMaskNeedsRebuild({ ...previous, bounds: { ...previous.bounds, west: 0 } }, { ...current, bounds: { ...current.bounds, west: 0 } }, false)).toBe(false)
  })

  it('rebuilds for first use, new tiles, resize, zoom threshold and exhausted margins', () => {
    expect(waterMaskNeedsRebuild(undefined, current, false)).toBe(true)
    expect(waterMaskNeedsRebuild(previous, current, true)).toBe(true)
    expect(waterMaskNeedsRebuild(previous, { ...current, height: 800 }, false)).toBe(true)
    expect(waterMaskNeedsRebuild(previous, { ...current, zoom: 7.25 }, false)).toBe(true)
    for (const bounds of [
      { ...current.bounds, west: 0.09 }, { ...current.bounds, east: 0.91 },
      { ...current.bounds, north: 0.09 }, { ...current.bounds, south: 0.91 },
    ]) expect(waterMaskNeedsRebuild(previous, { ...current, bounds }, false)).toBe(true)
  })
})

describe('water tile cache', () => {
  const tile = { z: 7, x: 65, y: 42 }

  it('decodes once per canonical tile even with fresh wrappers and overlapping feature ids', () => {
    const cache = new WaterTileCache<string>()
    const decode = vi.fn((feature: { name: string }) => [feature.name])
    expect(cache.collect([{ tile, name: 'sea' }, { tile, name: 'lake' }], decode)).toEqual(['sea', 'lake'])
    expect(cache.collect([{ tile: { ...tile }, name: 'fresh sea' }], decode)).toEqual(['sea', 'lake'])
    expect(decode).toHaveBeenCalledTimes(2)
    expect(cache.collect([{ tile, name: 'fresh sea' }, { tile: { ...tile, z: 8 }, name: 'zoomed' }], decode)).toEqual(['sea', 'lake', 'zoomed'])
    expect(decode).toHaveBeenCalledTimes(3)
  })

  it('evicts departed tiles, clears for a new source and handles features without tile metadata', () => {
    const cache = new WaterTileCache<string>()
    const decode = vi.fn(() => ['water'])
    cache.collect([{ tile }], decode)
    cache.collect([], decode)
    expect(cache.has(tile)).toBe(false)
    cache.collect([{ tile }], decode)
    expect(decode).toHaveBeenCalledTimes(2)
    cache.clear()
    expect(cache.has(tile)).toBe(false)
    expect(cache.collect([{}], decode)).toEqual(['water'])
  })
})

describe('MapLibre raw tile adapter', () => {
  it('deduplicates canonical tiles without reading feature geometry or detaching map buffers', () => {
    const data = new ArrayBuffer(8)
    const map = { style: { tileManagers: { basemap: {
      getRenderableIds: () => ['parent', 'overscaled', 'loading'],
      getTileByID: (id: string) => id === 'loading' ? undefined : {
        tileID: { canonical: { z: 7, x: 65, y: 42 } }, latestFeatureIndex: { rawTileData: data, encoding: 'mvt' },
      },
    } } } }
    expect(loadedWaterTiles(map, 'basemap')).toEqual([{ z: 7, x: 65, y: 42, data }])
    expect(data.byteLength).toBe(8)
    expect(loadedWaterTiles(map, 'other')).toBeUndefined()
  })

  it('routes unsupported internals and MLT encoding to the existing fallback', () => {
    expect(loadedWaterTiles({}, 'basemap')).toBeUndefined()
    expect(loadedWaterTiles({ style: { tileManagers: { basemap: {
      getRenderableIds: () => ['mlt'],
      getTileByID: () => ({ tileID: { canonical: { z: 7, x: 65, y: 42 } }, latestFeatureIndex: { rawTileData: new ArrayBuffer(8), encoding: 'mlt' } }),
    } } } }, 'basemap')).toBeUndefined()
  })
})
