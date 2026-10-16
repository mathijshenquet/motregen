// Vergelijkt per framepaar de meegeleverde bewegingsvectoren met de werkelijke verschuiving van de regen in een
// uitsnede. Wijken ze af, dan warpt de shader de regen een eind mee en kruisfadet hij de rest: stop-en-ga.
// Gebruik: tsx scripts/motion-vs-displacement.ts <snapshotmap> <bron> <west> <zuid> <oost> <noord>
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decodeFrame, parseMrfHeader } from '../src/core/mrf-codec.js'

// fzstd geeft een view in een grotere buffer: altijd met byteOffset lezen.
const signedView = (bytes: Uint8Array) => new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)

const [snapshot, source, ...bounds] = process.argv.slice(2)
const [west, south, east, north] = bounds.map(Number) as [number, number, number, number]
const manifest = JSON.parse(readFileSync(join(snapshot!, 'manifest.json'), 'utf8'))
const chunk = manifest.chunks.find((candidate: { source: string; field: string }) => candidate.source === source && candidate.field === 'rain_rate')
const bytes = new Uint8Array(readFileSync(join(snapshot!, chunk.url)))
const header = parseMrfHeader(bytes.subarray(0, chunk.header_len))
const payload = bytes.subarray(chunk.header_len)
const { width, height, x0, y0, dx, dy } = header.grid
const mercatorX = (lon: number) => lon * Math.PI / 180 * 6378137
const mercatorY = (lat: number) => Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * 6378137
const columns = [Math.floor((mercatorX(west) - x0) / dx), Math.ceil((mercatorX(east) - x0) / dx)] as const
const rows = [Math.floor((mercatorY(north) - y0) / dy), Math.ceil((mercatorY(south) - y0) / dy)] as const
const regionWidth = columns[1] - columns[0]
const regionHeight = rows[1] - rows[0]
const motionGrid = header.motion_grid!

function rainRegion(index: number): Float64Array {
  const frame = header.frames[index]!
  const cells = decodeFrame(payload.subarray(frame.offset, frame.offset + frame.len), width * height)
  const region = new Float64Array(regionWidth * regionHeight)
  for (let row = 0; row < regionHeight; row++) {
    for (let column = 0; column < regionWidth; column++) {
      const level = cells[(rows[0] + row) * width + columns[0] + column]!
      region[row * regionWidth + column] = level === 255 ? 0 : (header.quant[level] ?? 0)
    }
  }
  return region
}

// Brute-force verschuiving met maximale correlatie (genoeg voor ±15 cellen per vijf minuten).
function bestShift(before: Float64Array, after: Float64Array, reach = 15): { x: number; y: number; score: number } {
  let best = { x: 0, y: 0, score: -Infinity }
  for (let shiftY = -reach; shiftY <= reach; shiftY++) {
    for (let shiftX = -reach; shiftX <= reach; shiftX++) {
      let score = 0
      for (let row = reach; row < regionHeight - reach; row++) {
        for (let column = reach; column < regionWidth - reach; column++) {
          score += before[row * regionWidth + column]! * after[(row + shiftY) * regionWidth + column + shiftX]!
        }
      }
      if (score > best.score) best = { x: shiftX, y: shiftY, score }
    }
  }
  return best
}

function meanMotion(index: number, weights: Float64Array): { x: number; y: number; cells: number } | undefined {
  const motion = header.frames[index]!.motion
  if (!motion) return undefined
  const vectors = signedView(decodeFrame(payload.subarray(motion.offset, motion.offset + motion.len), motionGrid.bw * motionGrid.bh * 2))
  let sumX = 0, sumY = 0, total = 0, cells = 0
  for (let row = 0; row < regionHeight; row++) {
    for (let column = 0; column < regionWidth; column++) {
      const weight = weights[row * regionWidth + column]!
      if (weight <= 0) continue
      const blockColumn = Math.min(motionGrid.bw - 1, Math.floor((columns[0] + column) / width * motionGrid.bw))
      const blockRow = Math.min(motionGrid.bh - 1, Math.floor((rows[0] + row) / height * motionGrid.bh))
      const u = vectors[(blockRow * motionGrid.bw + blockColumn) * 2]!, v = vectors[(blockRow * motionGrid.bw + blockColumn) * 2 + 1]!
      if (u === -128 || v === -128) continue
      sumX += u * 0.1 * weight; sumY += v * 0.1 * weight; total += weight; cells++
    }
  }
  return total > 0 ? { x: sumX / total, y: sumY / total, cells } : { x: NaN, y: NaN, cells: 0 }
}

console.log(`${source}: uitsnede ${regionWidth}×${regionHeight} cellen; verschuiving in cellen (km) per framepaar`)
let previous = rainRegion(0)
for (let index = 1; index < header.frames.length; index++) {
  const current = rainRegion(index)
  const minutes = (Date.parse(header.frames[index]!.time) - Date.parse(header.frames[index - 1]!.time)) / 60_000
  const actual = bestShift(previous, current)
  const motion = meanMotion(index, current)
  const vector = motion ? `vector ${(motion.x * minutes).toFixed(1).padStart(5)} ${(motion.y * minutes).toFixed(1).padStart(5)} (${motion.cells} cellen)` : 'geen vector'
  const local = new Date(Date.parse(header.frames[index]!.time) + 2 * 3_600_000).toISOString().slice(11, 16)
  console.log(`${local}  werkelijk ${String(actual.x).padStart(3)} ${String(actual.y).padStart(3)}  ${vector}`)
  previous = current
}
