import type { Grid } from './contract'

export interface WaterMaskView {
  bounds: { west: number; east: number; north: number; south: number }
  zoom: number
  width: number
  height: number
}

export interface WaterTile {
  z: number
  x: number
  y: number
}

export interface WaterTileData extends WaterTile {
  data: ArrayBuffer
}

export interface WaterMaskRequest {
  id: number
  grid: Grid
  view: WaterMaskView
  columns: number
  rows: number
  tileKeys: string[]
  tiles: WaterTileData[]
}

export type WaterMaskReply = {
  id: number
  mask: Uint8Array
  view: WaterMaskView
  columns: number
  rows: number
} | { id: number; error: string }

interface TileManagerMap {
  style?: { tileManagers?: Record<string, {
    getRenderableIds(): string[]
    getTileByID(id: string): {
      tileID: { canonical: WaterTile }
      latestFeatureIndex?: { rawTileData?: ArrayBuffer; encoding?: string }
    } | undefined
  }> }
}

export function loadedWaterTiles(map: unknown, sourceId: string): WaterTileData[] | undefined {
  // MapLibre 5.24 houdt de MVT-bytes hier; de geometry-getter zou ze op de hoofddraad decoderen.
  const manager = (map as TileManagerMap).style?.tileManagers?.[sourceId]
  if (!manager || typeof manager.getRenderableIds !== 'function' || typeof manager.getTileByID !== 'function') return undefined
  const tiles = new Map<string, WaterTileData>()
  for (const id of manager.getRenderableIds()) {
    const tile = manager.getTileByID(id)
    if (!tile?.latestFeatureIndex?.rawTileData) continue
    if (tile.latestFeatureIndex.encoding === 'mlt' || !(tile.latestFeatureIndex.rawTileData instanceof ArrayBuffer)) return undefined
    const canonical = tile.tileID?.canonical
    if (!canonical) return undefined
    tiles.set(waterTileKey(canonical), { ...canonical, data: tile.latestFeatureIndex.rawTileData })
  }
  return [...tiles.values()]
}

export function waterTileKey(tile: WaterTile): string {
  return `${tile.z}/${tile.x}/${tile.y}`
}

export function waterMaskNeedsRebuild(previous: WaterMaskView | undefined, current: WaterMaskView, tilesChanged: boolean): boolean {
  if (!previous || tilesChanged) return true
  if (previous.width !== current.width || previous.height !== current.height) return true
  if (Math.abs(previous.zoom - current.zoom) >= 0.25) return true
  return current.bounds.west < previous.bounds.west || current.bounds.east > previous.bounds.east
    || current.bounds.north < previous.bounds.north || current.bounds.south > previous.bounds.south
}

export class WaterTileCache<Decoded> {
  private readonly tiles = new Map<string, Decoded[]>()

  has(tile: WaterTile): boolean {
    return this.tiles.has(waterTileKey(tile))
  }

  clear(): void {
    this.tiles.clear()
  }

  collect<Feature extends { tile?: WaterTile }>(features: readonly Feature[], decode: (feature: Feature) => Decoded[]): Decoded[] {
    const loaded = new Map<string, Feature[]>()
    const decoded: Decoded[] = []
    for (const feature of features) {
      if (!feature.tile) {
        decoded.push(...decode(feature))
        continue
      }
      const key = waterTileKey(feature.tile)
      const group = loaded.get(key) ?? []
      group.push(feature)
      loaded.set(key, group)
    }
    for (const key of this.tiles.keys()) if (!loaded.has(key)) this.tiles.delete(key)
    for (const [key, group] of loaded) {
      let polygons = this.tiles.get(key)
      if (!polygons) {
        polygons = group.flatMap(decode)
        this.tiles.set(key, polygons)
      }
      decoded.push(...polygons)
    }
    return decoded
  }
}
