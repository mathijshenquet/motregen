import { describe, expect, it } from 'vitest'
import Protobuf from 'pbf'
import { waterTilePolygons } from './wind-water-geometry'
import type { Grid } from './contract'

function tileBytes(layerName: string) {
  const geometry: number[] = []
  let cursorX = 0
  let cursorY = 0
  const zigzag = (value: number) => value < 0 ? -value * 2 - 1 : value * 2
  for (const ring of [
    [[0, 0], [4096, 0], [4096, 4096], [0, 4096]],
    [[1024, 1024], [1024, 3072], [3072, 3072], [3072, 1024]],
  ]) {
    for (const [index, point] of ring.entries()) {
      if (index === 0) geometry.push(9)
      if (index === 1) geometry.push(26)
      geometry.push(zigzag(point[0]! - cursorX), zigzag(point[1]! - cursorY))
      cursorX = point[0]!
      cursorY = point[1]!
    }
    geometry.push(15)
  }
  const tile = new Protobuf()
  tile.writeMessage(3, (_value, layer: Protobuf) => {
    layer.writeStringField(1, layerName)
    layer.writeVarintField(5, 4096)
    layer.writeVarintField(15, 2)
    layer.writeMessage(2, (_feature, encoded: Protobuf) => {
      encoded.writeVarintField(3, 3)
      encoded.writePackedVarint(4, geometry)
    }, undefined)
  }, undefined)
  return new Uint8Array(tile.finish()).buffer
}

describe('water MVT decode in the worker', () => {
  const world = 2 * Math.PI * 6_378_137
  const grid: Grid = { crs: 'EPSG:3857', x0: -world / 2, y0: world / 2, dx: world / 1000, dy: -world / 1000, width: 1000, height: 1000 }

  it('projects canonical tile coordinates into grid fractions and preserves polygon holes', () => {
    const polygons = waterTilePolygons({ z: 1, x: 1, y: 0, data: tileBytes('water') }, grid)
    expect(polygons).toHaveLength(1)
    expect(polygons[0]).toHaveLength(2)
    const expected = [
      [[0.5, 0], [1, 0], [1, 0.5], [0.5, 0.5], [0.5, 0]],
      [[0.625, 0.125], [0.625, 0.375], [0.875, 0.375], [0.875, 0.125], [0.625, 0.125]],
    ]
    for (const [ringIndex, ring] of expected.entries()) {
      expect(polygons[0]![ringIndex]).toHaveLength(ring.length)
      for (const [pointIndex, point] of ring.entries()) {
        expect(polygons[0]![ringIndex]![pointIndex]![0]).toBeCloseTo(point[0]!, 12)
        expect(polygons[0]![ringIndex]![pointIndex]![1]).toBeCloseTo(point[1]!, 12)
      }
    }
  })

  it('treats tiles without a water layer as land', () => {
    expect(waterTilePolygons({ z: 1, x: 1, y: 0, data: tileBytes('landcover') }, grid)).toEqual([])
  })
})
