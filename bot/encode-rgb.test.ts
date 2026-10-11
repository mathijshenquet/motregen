import { execFile } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { afterEach, expect, it, vi } from 'vitest'
import { encodeRgbLoop } from './encode.js'

const run = promisify(execFile)
afterEach(() => vi.unstubAllEnvs())
it('streams RGB with the correct dimensions, clock and end hold', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'motregen-rgb-'))
  try {
    const path = join(directory, 'loop.mp4')
    const plan = { epochs: [0, 1, 2], loopFrames: 3, fps: 10, stillFrames: [] }
    async function* frames() {
      for (let index = 0; index < 3; index++) yield new Uint8Array(32 * 48 * 3).fill(index * 80)
    }
    const encoded = await encodeRgbLoop(frames(), path, plan, { width: 32, height: 48 })
    expect(encoded.bytes).toBeGreaterThan(0)
    const probe = await run('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', path])
    expect(JSON.parse(probe.stdout).streams[0]).toMatchObject({ profile: 'High', width: 32, height: 48, nb_frames: '13', duration: '1.300000', pix_fmt: 'yuv420p' })
    vi.stubEnv('MOTREGEN_VIDEO_MAX_BYTES', '1')
    await expect(encodeRgbLoop(frames(), path, plan, { width: 32, height: 48 })).rejects.toThrow('veiligheidsgrens van 1 bytes')
    vi.unstubAllEnvs()
    async function* incomplete() { yield new Uint8Array(32 * 48 * 3) }
    await expect(encodeRgbLoop(incomplete(), path, plan, { width: 32, height: 48 })).rejects.toThrow('verwacht 3')
    async function* manyFrames() {
      for (let index = 0; index < 1000; index++) yield new Uint8Array(32 * 48 * 3)
    }
    await expect(encodeRgbLoop(manyFrames(), join(directory, 'missing', 'loop.mp4'), { ...plan, loopFrames: 1000 }, { width: 32, height: 48 })).rejects.toThrow()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
