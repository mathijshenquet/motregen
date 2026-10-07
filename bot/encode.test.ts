import { execFile } from 'node:child_process'
import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import { encodeLoop, encodeStill, framePath } from './encode.js'

const run = promisify(execFile)

it('encodes a silent H.264 loop with exact dimensions, fps and one-second hold; stills use the same PNGs', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'motregen-encode-'))
  try {
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'testsrc=size=32x48:rate=4:duration=1', '-threads', '1', '-start_number', '0', join(directory, 'frame-%03d.png')])
    const loop = join(directory, 'loop.mp4')
    const result = await encodeLoop(directory, loop, { epochs: [0, 1, 2, 3], loopFrames: 3, fps: 4, stillFrames: [{ hour: 3, index: 3 }] })
    expect(result.bytes).toBeLessThanOrEqual(3_000_000)
    const probe = await run('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', loop])
    const metadata = JSON.parse(probe.stdout)
    expect(metadata.streams).toHaveLength(1)
    expect(metadata.streams[0]).toMatchObject({ codec_name: 'h264', codec_type: 'video', width: 32, height: 48, avg_frame_rate: '4/1', nb_frames: '7', pix_fmt: 'yuv420p' })
    expect(Number(metadata.format.duration)).toBeCloseTo(1.75, 2)
    const still = join(directory, 'still.jpg')
    await encodeStill(framePath(directory, 3), still)
    expect((await readFile(still)).subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]))
    const stillProbe = await run('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', still])
    expect(JSON.parse(stillProbe.stdout).streams[0]).toMatchObject({ codec_name: 'mjpeg', width: 32, height: 48 })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
}, 15_000)
