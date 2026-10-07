/// <reference lib="webworker" />
import { waterTileKey, type WaterMaskRequest, type WaterMaskReply } from './wind-water-mask'
import { waterTilePolygons } from './wind-water-geometry'

const tiles = new Map<string, Path2D[]>()
let canvas: OffscreenCanvas | undefined

self.onmessage = ({ data }: MessageEvent<WaterMaskRequest>) => {
  try {
    const loaded = new Set(data.tileKeys)
    for (const key of tiles.keys()) if (!loaded.has(key)) tiles.delete(key)
    for (const tile of data.tiles) {
      const paths = waterTilePolygons(tile, data.grid).map((polygon) => {
        const path = new Path2D()
        for (const ring of polygon) {
          for (const [index, point] of ring.entries()) {
            if (index === 0) path.moveTo(point[0], point[1])
            else path.lineTo(point[0], point[1])
          }
          path.closePath()
        }
        return path
      })
      tiles.set(waterTileKey(tile), paths)
    }
    canvas ??= new OffscreenCanvas(data.columns, data.rows)
    canvas.width = data.columns
    canvas.height = data.rows
    const context = canvas.getContext('2d', { willReadFrequently: true })
    if (!context) throw new Error('OffscreenCanvas 2d ontbreekt')
    context.fillStyle = '#fff'
    const bounds = data.view.bounds
    const scaleX = data.columns / (bounds.east - bounds.west)
    const scaleY = data.rows / (bounds.south - bounds.north)
    context.setTransform(scaleX, 0, 0, scaleY, -bounds.west * scaleX, -bounds.north * scaleY)
    for (const paths of tiles.values()) for (const path of paths) context.fill(path, 'evenodd')
    const pixels = context.getImageData(0, 0, data.columns, data.rows).data
    const mask = new Uint8Array(data.columns * data.rows)
    for (let index = 0; index < mask.length; index++) mask[index] = pixels[index * 4 + 3]!
    const reply: WaterMaskReply = { id: data.id, mask, view: data.view, columns: data.columns, rows: data.rows }
    self.postMessage(reply, [mask.buffer])
  } catch (error) {
    const reply: WaterMaskReply = { id: data.id, error: error instanceof Error ? error.message : String(error) }
    self.postMessage(reply)
  }
}
