import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { WindLayer } from './wind-layer'
import type { Grid } from './contract'
import type { WaterMaskReply, WaterMaskRequest } from './wind-water-mask'

class FakeWorker {
  static instances: FakeWorker[] = []
  onmessage?: (event: { data: WaterMaskReply }) => void
  onerror?: () => void
  postMessage = vi.fn()
  terminate = vi.fn()
  constructor() { FakeWorker.instances.push(this) }
}

interface Internals {
  map: unknown
  simBounds: { west: number; east: number; north: number; south: number }
  viewBounds: { west: number; east: number; north: number; south: number }
  waterMask?: Uint8Array
  waterTilesChanged: boolean
  waterWorkerFailed: boolean
  scheduleWaterMask(): void
  tilesChanged(event: unknown): void
}

function harness() {
  const grid: Grid = { crs: 'EPSG:3857', x0: 0, y0: 0, dx: 1000, dy: -1000, width: 2, height: 2 }
  let source = {}
  let data = new ArrayBuffer(8)
  const canonical = { z: 7, x: 65, y: 42 }
  const tile = () => ({ tileID: { canonical }, latestFeatureIndex: { rawTileData: data, encoding: 'mvt' } })
  const map = {
    style: { tileManagers: { basemap: { getRenderableIds: () => ['tile'], getTileByID: tile } } },
    getStyle: () => ({ layers: [{ source: 'basemap', 'source-layer': 'water' }] }),
    getSource: () => source,
    getCanvas: () => ({ clientWidth: 1280, clientHeight: 720 }),
    getZoom: () => 7,
    querySourceFeatures: vi.fn(),
  }
  const wind = new WindLayer(grid, 'light') as unknown as Internals
  wind.map = map
  wind.simBounds = { west: 0.1, east: 0.9, north: 0.1, south: 0.9 }
  wind.viewBounds = { west: 0.2, east: 0.8, north: 0.2, south: 0.8 }
  wind.scheduleWaterMask()
  vi.advanceTimersByTime(200)
  const worker = FakeWorker.instances[0]!
  return { wind, map, worker, tile, data, reloadTile: () => { data = new ArrayBuffer(8) }, replaceSource: () => { source = {} } }
}

describe('wind water worker lifecycle', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    FakeWorker.instances = []
    vi.stubGlobal('Worker', FakeWorker)
    vi.stubGlobal('OffscreenCanvas', class {})
    vi.stubGlobal('document', {})
  })
  afterEach(() => { vi.clearAllTimers(); vi.useRealTimers(); vi.unstubAllGlobals() })

  it('copies raw tile buffers, skips known content and unrelated events, and resends changed bytes', () => {
    const { wind, map, worker, tile, data, reloadTile } = harness()
    const request = worker.postMessage.mock.calls[0]![0] as WaterMaskRequest
    expect(request.tiles[0]!.data).not.toBe(data)
    expect(request.tiles[0]!.data.byteLength).toBe(8)
    expect(data.byteLength).toBe(8)
    expect(map.querySourceFeatures).not.toHaveBeenCalled()
    for (const event of [
      { sourceId: 'other', sourceDataType: 'content', tile: tile() },
      { sourceId: 'basemap', sourceDataType: 'metadata', tile: tile() },
      { sourceId: 'basemap', sourceDataType: 'content' },
      { sourceId: 'basemap', sourceDataType: 'content', tile: tile() },
    ]) wind.tilesChanged(event)
    wind.scheduleWaterMask()
    vi.advanceTimersByTime(200)
    expect(worker.postMessage).toHaveBeenCalledTimes(1)
    reloadTile()
    wind.tilesChanged({ sourceId: 'basemap', sourceDataType: 'content', tile: tile() })
    vi.advanceTimersByTime(200)
    expect((worker.postMessage.mock.calls[1]![0] as WaterMaskRequest).tiles).toHaveLength(1)
    wind.tilesChanged({ sourceId: 'basemap', sourceDataType: 'content', sourceDataChanged: true, tile: tile() })
    vi.advanceTimersByTime(200)
    expect((worker.postMessage.mock.calls[2]![0] as WaterMaskRequest).tiles).toHaveLength(1)
  })

  it('ignores older masks and replies from a replaced source', () => {
    const { wind, worker, replaceSource } = harness()
    const first = worker.postMessage.mock.calls[0]![0] as WaterMaskRequest
    wind.waterTilesChanged = true
    wind.scheduleWaterMask()
    vi.advanceTimersByTime(200)
    const second = worker.postMessage.mock.calls[1]![0] as WaterMaskRequest
    const latest = new Uint8Array([255])
    worker.onmessage?.({ data: { ...second, mask: latest } })
    worker.onmessage?.({ data: { ...first, mask: new Uint8Array([0]) } })
    expect(wind.waterMask).toBe(latest)
    replaceSource()
    wind.scheduleWaterMask()
    expect(worker.terminate).toHaveBeenCalledOnce()
    worker.onmessage?.({ data: { ...second, mask: new Uint8Array([0]) } })
    expect(wind.waterMask).toBe(latest)
  })

  it('keeps the previous mask while scheduling a fallback after a worker error', () => {
    const { wind, worker } = harness()
    const previous = wind.waterMask = new Uint8Array([255])
    worker.onerror?.()
    expect(worker.terminate).toHaveBeenCalledOnce()
    expect(wind.waterWorkerFailed).toBe(true)
    expect(wind.waterMask).toBe(previous)
    expect(vi.getTimerCount()).toBe(1)
  })
})
