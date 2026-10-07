import { classifyRings, VectorTile } from '@mapbox/vector-tile'
import Protobuf from 'pbf'
import type { Grid } from './contract'
import type { WaterTileData } from './wind-water-mask'

export type WaterPolygon = Array<Array<[number, number]>>

export function waterTilePolygons(tile: WaterTileData, grid: Grid): WaterPolygon[] {
  const layer = new VectorTile(new Protobuf(tile.data)).layers.water
  if (!layer) return []
  const polygons: WaterPolygon[] = []
  const tileCount = 2 ** tile.z
  const worldMeters = 2 * Math.PI * 6_378_137
  for (let index = 0; index < layer.length; index++) {
    const feature = layer.feature(index)
    if (feature.type !== 3) continue
    for (const polygon of classifyRings(feature.loadGeometry())) {
      polygons.push(polygon.map((ring) => ring.map((point): [number, number] => {
        const projectedX = ((tile.x + point.x / feature.extent) / tileCount - 0.5) * worldMeters
        const projectedY = (0.5 - (tile.y + point.y / feature.extent) / tileCount) * worldMeters
        return [(projectedX - grid.x0) / (grid.dx * grid.width), (projectedY - grid.y0) / (grid.dy * grid.height)]
      })))
    }
  }
  return polygons
}
