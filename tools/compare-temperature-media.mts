import { readFile, writeFile } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import assert from 'node:assert/strict'

const sharp = createRequire(new URL('../bot/package.json', import.meta.url))('sharp')
if (!process.argv[2] || !process.argv[3] || !process.argv[4]) {
  throw new Error('Gebruik: tsx tools/compare-temperature-media.mts /pad/baseline /pad/proef /pad/bewijs.json')
}
const left = resolve(process.argv[2]), right = resolve(process.argv[3])
const a = JSON.parse(await readFile(resolve(left, 'media.json'), 'utf8'))
const b = JSON.parse(await readFile(resolve(right, 'media.json'), 'utf8'))
for (const key of ['generated', 'now', 'width', 'height', 'frames', 'hold_frames', 'fps', 'clock_variant']) assert.equal(a[key], b[key], key)
assert.equal(a.mode, 'feels'); assert.equal(b.mode, 'feels')
assert.deepEqual(a.loop_epochs, b.loop_epochs)
const frameBytes = a.width * a.height * 3
function decoder(file: string) {
  const child = spawn('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-threads', '1', '-i', file,
    '-pix_fmt', 'rgb24', '-f', 'rawvideo', '-threads', '1', 'pipe:1'], { stdio: ['ignore', 'pipe', 'pipe'] })
  let stderr = ''
  child.stderr.on('data', data => stderr += data)
  const done = new Promise<void>((ok, fail) => {
    child.once('error', fail)
    child.once('close', code => code === 0 ? ok() : fail(new Error(stderr)))
  })
  async function* frames() {
    let frame = Buffer.allocUnsafe(frameBytes), used = 0
    for await (const part of child.stdout) {
      const chunk = part as Buffer
      let offset = 0
      while (offset < chunk.length) {
        const count = Math.min(frameBytes - used, chunk.length - offset)
        chunk.copy(frame, used, offset, offset + count)
        offset += count; used += count
        if (used === frameBytes) {
          yield frame
          frame = Buffer.allocUnsafe(frameBytes); used = 0
        }
      }
    }
    assert.equal(used, 0, 'Afgebroken RGB-frame')
    await done
  }
  return frames()
}
function delta(a: Buffer, b: Buffer) {
  assert.equal(a.length, b.length)
  if (a.equals(b)) return { max: 0, bytes: 0 }
  let max = 0, bytes = 0
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i])
    if (d) { bytes++; max = Math.max(max, d) }
  }
  return { max, bytes }
}
const ad = decoder(resolve(left, 'feels-loop.mp4')), bd = decoder(resolve(right, 'feels-loop.mp4'))
let frames = 0, differentFrames = 0, frameMax = 0, frameDifferentBytes = 0
while (true) {
  const [af, bf] = await Promise.all([ad.next(), bd.next()])
  assert.equal(af.done, bf.done, 'Ongelijke filmlengte')
  if (af.done) break
  const d = delta(af.value!, bf.value!)
  frames++; if (d.bytes) differentFrames++
  frameMax = Math.max(frameMax, d.max); frameDifferentBytes += d.bytes
}
assert.equal(frames, a.frames + a.hold_frames)
const photos = a.files.filter((f: any) => f.kind === 'photo')
assert.equal(photos.length, 85)
assert.deepEqual(photos.map((f: any) => f.file), b.files.filter((f: any) => f.kind === 'photo').map((f: any) => f.file))
let differentJpegs = 0, jpegMax = 0, jpegDifferentBytes = 0
for (const photo of photos) {
  const [ap, bp] = await Promise.all([
    sharp(resolve(left, photo.file)).removeAlpha().raw().toBuffer(),
    sharp(resolve(right, photo.file)).removeAlpha().raw().toBuffer(),
  ])
  assert.equal(ap.length, frameBytes)
  const d = delta(ap, bp)
  if (d.bytes) differentJpegs++
  jpegMax = Math.max(jpegMax, d.max); jpegDifferentBytes += d.bytes
}
const proof = { left, right, generated: a.generated, frames, differentFrames, frameMax,
  frameDifferentBytes, jpegs: photos.length, differentJpegs, jpegMax, jpegDifferentBytes,
  decodedRgbBytes: (frames + photos.length) * frameBytes, maxAllowed: 1 }
await writeFile(resolve(process.argv[4]), JSON.stringify(proof, null, 2) + '\n')
console.log(JSON.stringify(proof))
assert.ok(frameMax <= 1 && jpegMax <= 1, 'Verschil groter dan 1 byte')
