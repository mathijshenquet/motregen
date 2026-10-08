import { readFileSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { gzipSync } from 'node:zlib'
import { PMTiles } from 'pmtiles'
import { VectorTile } from '@mapbox/vector-tile'
import Pbf from 'pbf'

process.chdir(fileURLToPath(new URL('../..', import.meta.url)))

interface Point { x: number; y: number }

function simplify(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points
  const first = points[0]!
  const last = points.at(-1)!
  const spanX = last.x - first.x
  const spanY = last.y - first.y
  const squaredLength = spanX * spanX + spanY * spanY
  let farthest = 0
  let maxDistance = 0
  for (let index = 1; index < points.length - 1; index++) {
    const point = points[index]!
    const along = squaredLength
      ? Math.max(0, Math.min(1, ((point.x - first.x) * spanX + (point.y - first.y) * spanY) / squaredLength))
      : 0
    const distance = Math.hypot(point.x - first.x - along * spanX, point.y - first.y - along * spanY)
    if (distance > maxDistance) {
      maxDistance = distance
      farthest = index
    }
  }
  if (maxDistance <= tolerance) return [first, last]
  return [
    ...simplify(points.slice(0, farthest + 1), tolerance).slice(0, -1),
    ...simplify(points.slice(farthest), tolerance),
  ]
}

function clip(points: Point[]): Point[] {
  let result = points
  for (const [axis, limit, lower] of [['x', -30, true], ['x', 450, false], ['y', 100, true], ['y', 450, false]] as const) {
    const input = result
    result = []
    for (let index = 0; index < input.length; index++) {
      const current = input[index]!
      const previous = input[(index + input.length - 1) % input.length]!
      const currentInside = lower ? current[axis] >= limit : current[axis] <= limit
      const previousInside = lower ? previous[axis] >= limit : previous[axis] <= limit
      if (currentInside !== previousInside) {
        const fraction = (limit - previous[axis]) / (current[axis] - previous[axis])
        result.push({
          x: previous.x + fraction * (current.x - previous.x),
          y: previous.y + fraction * (current.y - previous.y),
        })
      }
      if (currentInside) result.push(current)
    }
  }
  return result
}

function polygonArea(points: Point[]): number {
  return Math.abs(points.reduce((sum, point, index) => {
    const next = points[(index + 1) % points.length]!
    return sum + point.x * next.y - next.x * point.y
  }, 0) / 2)
}

const { filename } = JSON.parse(readFileSync('tools/basemap/tiles/manifest.json', 'utf8')) as { filename: string }
const file = readFileSync(`tools/basemap/tiles/${filename}`)
const archive = new PMTiles({
  getKey: () => filename,
  getBytes: async (offset, length) => ({ data: file.buffer.slice(file.byteOffset + offset, file.byteOffset + offset + length) }),
})
const inline: Record<string, string> = {}
const paths: Record<string, string[]> = { water: [], boundary: [] }
for (const tileX of [7, 8]) {
  const result = await archive.getZxy(4, tileX, 5)
  if (!result) throw new Error('z4-tegel ontbreekt')
  inline[`4/${tileX}/5`] = gzipSync(new Uint8Array(result.data)).toString('base64')
  const tile = new VectorTile(new Pbf(new Uint8Array(result.data)))
  for (const layerName of ['water', 'boundary']) {
    const layer = tile.layers[layerName]
    if (!layer) continue
    for (let featureIndex = 0; featureIndex < layer.length; featureIndex++) {
      const feature = layer.feature(featureIndex)
      if (layerName === 'boundary' && feature.properties.maritime === 1) continue
      const featurePaths: string[] = []
      for (const ring of feature.loadGeometry()) {
        const points = ring.map((point) => ({
          x: Math.round((point.x + (tileX - 8) * layer.extent) / 4),
          y: Math.round(point.y / 4),
        }))
        const clipped = layerName === 'water' ? clip(points) : points
        const selected = simplify(clipped, 1.5).map((point) => ({ x: Math.round(point.x), y: Math.round(point.y) }))
        const unique = selected.filter((point, index) => index === 0 || point.x !== selected[index - 1]!.x || point.y !== selected[index - 1]!.y)
        if (unique.length < 3 || (layerName === 'water' && polygonArea(unique) < 4)) continue
        featurePaths.push(unique.map((point, index) => `${index === 0 ? 'M' : 'L'}${point.x},${point.y}`).join('') + (feature.type === 3 ? 'Z' : ''))
      }
      paths[layerName]!.push(featurePaths.join(''))
    }
  }
}
const water = paths.water!.map((path) => `<path d="${path}"/>`).join('')
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="70 130 280 300" aria-hidden="true"><rect x="-1024" y="0" width="2048" height="1024" fill="var(--start-land,#f8f4f0)"/><g fill="var(--start-water,rgb(158,189,255))" fill-rule="evenodd">${water}</g><path d="${paths.boundary!.join('')}" fill="none" stroke="var(--start-border,#68676a)" stroke-width="1" vector-effect="non-scaling-stroke"/></svg>`
const tiles = JSON.stringify({ archive: filename, tiles: inline })
writeFileSync('web/src/assets/map-start/netherlands.svg', svg)
writeFileSync('web/src/assets/map-start/tiles.json', tiles)
console.log(`SVG ${svg.length} B / gzip ${gzipSync(svg).length} B; inline tegels ${tiles.length} B / gzip ${gzipSync(tiles).length} B`)
