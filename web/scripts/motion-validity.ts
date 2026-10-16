// Kaart van geldige (letter) en ongeldige (.) bewegingsblokken voor één frame, met regen per blok (cijfer 0-9).
// Gebruik: tsx scripts/motion-validity.ts <snapshotmap> <bron> <frame-ISO>
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { decodeFrame, parseMrfHeader } from '../src/core/mrf-codec.js'

// fzstd geeft een view in een grotere buffer: altijd met byteOffset lezen.
const signedView = (bytes: Uint8Array) => new Int8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength)

const [snapshot, source, time] = process.argv.slice(2)
const manifest = JSON.parse(readFileSync(join(snapshot!, 'manifest.json'), 'utf8'))
const chunk = manifest.chunks.find((candidate: { source: string; field: string }) => candidate.source === source && candidate.field === 'rain_rate')
const bytes = new Uint8Array(readFileSync(join(snapshot!, chunk.url)))
const header = parseMrfHeader(bytes.subarray(0, chunk.header_len))
const payload = bytes.subarray(chunk.header_len)
const index = header.frames.findIndex((frame) => frame.time === time)
const frame = header.frames[index]!
const { width, height } = header.grid
const grid = header.motion_grid!
const cells = decodeFrame(payload.subarray(frame.offset, frame.offset + frame.len), width * height)
const vectors = signedView(decodeFrame(payload.subarray(frame.motion!.offset, frame.motion!.offset + frame.motion!.len), grid.bw * grid.bh * 2))
const blockWidth = width / grid.bw, blockHeight = height / grid.bh
console.log(`${source} ${time}: blok ${blockWidth.toFixed(1)}×${blockHeight.toFixed(1)} cellen; letter = geldige vector, . = ongeldig; cijfer = regencellen in een ongeldig blok (log)`)
let validWithRain = 0, invalidWithRain = 0
for (let row = 0; row < grid.bh; row++) {
  let line = ''
  for (let column = 0; column < grid.bw; column++) {
    let rain = 0
    for (let y = Math.floor(row * blockHeight); y < Math.floor((row + 1) * blockHeight); y++) {
      for (let x = Math.floor(column * blockWidth); x < Math.floor((column + 1) * blockWidth); x++) {
        const level = cells[y * width + x]!
        if (level !== 255 && (header.quant[level] ?? 0) > 0) rain++
      }
    }
    const u = vectors[(row * grid.bw + column) * 2]!, v = vectors[(row * grid.bw + column) * 2 + 1]!
    const valid = u !== -128 && v !== -128
    if (rain > 0) valid ? validWithRain++ : invalidWithRain++
    line += valid ? (rain > 0 ? 'R' : 'v') : (rain > 0 ? String(Math.min(9, Math.ceil(Math.log10(rain + 1) * 3))) : '.')
  }
  console.log(String(row).padStart(2), line)
}
console.log(`blokken met regen: ${validWithRain} met geldige vector, ${invalidWithRain} zonder`)
