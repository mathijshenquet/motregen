// CPU-simulatie van de regenwarp uit rain-layer.ts (zelfde formule: links vooruit, rechts terug, kruisfade) voor
// één drijver. Lineaire beweging = zwaartepunt eenparig en massa constant; een zaagtand of puls is een artefact.
// Gebruik: tsx scripts/rain-warp-sim.ts <snapshotmap> <bron> <lng> <lat> [geen-warp|omgekeerd|omgekeerd-y]
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decodeFrame, parseMrfHeader } from '../src/core/mrf-codec.js'

// fzstd geeft een view in een grotere buffer: altijd met byteOffset lezen.
const signedView = (bytes: Uint8Array) => new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)
import { motionWarpStrength } from '../src/core/rain-motion.js'

const [snapshot, source, lngText, latText, mode] = process.argv.slice(2)
const manifest = JSON.parse(readFileSync(join(snapshot!, 'manifest.json'), 'utf8'))
const chunk = manifest.chunks.find((candidate: { source: string; field: string }) => candidate.source === source && candidate.field === 'rain_rate')
const bytes = new Uint8Array(readFileSync(join(snapshot!, chunk.url)))
const header = parseMrfHeader(bytes.subarray(0, chunk.header_len))
const payload = bytes.subarray(chunk.header_len)
const { width, height } = header.grid
const grid = header.motion_grid!
const startColumn = (Number(lngText) * Math.PI / 180 * 6378137 - header.grid.x0) / header.grid.dx
const startRow = (Math.log(Math.tan(Math.PI / 4 + Number(latText) * Math.PI / 360)) * 6378137 - header.grid.y0) / header.grid.dy

function rain(index: number): Float32Array {
  const frame = header.frames[index]!
  const cells = decodeFrame(payload.subarray(frame.offset, frame.offset + frame.len), width * height)
  const values = new Float32Array(width * height)
  for (let cell = 0; cell < values.length; cell++) values[cell] = cells[cell] === 255 ? 0 : (header.quant[cells[cell]!] ?? 0)
  return values
}

function motion(index: number): Int8Array {
  const frame = header.frames[index]!.motion!
  return signedView(decodeFrame(payload.subarray(frame.offset, frame.offset + frame.len), grid.bw * grid.bh * 2))
}

function bilinear(values: Float32Array, column: number, row: number): number {
  const x = Math.min(width - 1.001, Math.max(0, column - 0.5)), y = Math.min(height - 1.001, Math.max(0, row - 0.5))
  const x0 = Math.floor(x), y0 = Math.floor(y), fx = x - x0, fy = y - y0
  const at = (cx: number, cy: number) => values[cy * width + cx]!
  return (at(x0, y0) * (1 - fx) + at(x0 + 1, y0) * fx) * (1 - fy) + (at(x0, y0 + 1) * (1 - fx) + at(x0 + 1, y0 + 1) * fx) * fy
}

const firstFrame = header.frames.findIndex((frame) => frame.time === '2026-10-16T06:15:00Z')
const radius = 25
let previousCentre: [number, number] | undefined
for (let index = firstFrame; index < firstFrame + 5; index++) {
  const left = rain(index), right = rain(index + 1), vectors = motion(index + 1)
  const minutes = (Date.parse(header.frames[index + 1]!.time) - Date.parse(header.frames[index]!.time)) / 60_000
  for (let step = 0; step < 10; step++) {
    const weight = step / 10
    const elapsed = (index - firstFrame) * minutes + weight * minutes
    // meebewegend venster met 1,0 / -0,6 cel per minuut (oost / noord = rij omlaag)
    const centreColumn = startColumn + elapsed * 1.0, centreRow = startRow - elapsed * 0.6
    let mass = 0, sumX = 0, sumY = 0
    for (let dy = -radius; dy <= radius; dy += 0.5) {
      for (let dx = -radius; dx <= radius; dx += 0.5) {
        const column = centreColumn + dx, row = centreRow + dy
        const block = (Math.min(grid.bh - 1, Math.floor(row / height * grid.bh)) * grid.bw + Math.min(grid.bw - 1, Math.floor(column / width * grid.bw))) * 2
        const signX = mode === 'omgekeerd' ? -1 : 1, signY = mode === 'omgekeerd' || mode === 'omgekeerd-y' ? -1 : 1
        const u = signX * vectors[block]! * 0.1 * minutes, v = signY * vectors[block + 1]! * 0.1 * minutes
        const strength = mode === 'geen-warp' ? 0 : motionWarpStrength(Math.hypot(u, v))
        const value = (1 - weight) * bilinear(left, column - u * weight * strength, row - v * weight * strength)
          + weight * bilinear(right, column + u * (1 - weight) * strength, row + v * (1 - weight) * strength)
        const visible = Math.max(0, value - 0.05)
        mass += visible; sumX += visible * dx; sumY += visible * dy
      }
    }
    const centre: [number, number] = [sumX / mass, sumY / mass]
    const local = new Date(Date.parse(header.frames[index]!.time) + (2 * 60 + weight * minutes) * 60_000).toISOString().slice(11, 19)
    console.log(`${local}  zwaartepunt ${centre[0].toFixed(2).padStart(6)} oost ${(-centre[1]).toFixed(2).padStart(6)} noord (cellen)  massa ${(mass / 4).toFixed(1).padStart(6)}${step === 0 ? '  ← KNMI-frame' : ''}`)
    previousCentre = centre
  }
}
void previousCentre
