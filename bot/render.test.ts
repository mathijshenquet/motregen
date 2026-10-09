import { execFile } from 'node:child_process'
import { mkdir, mkdtemp, readFile, readdir, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import { StillRenderer } from './render.js'
import { sequencePlan } from './sequences.js'
import { cacheKey, type StillManifest } from './stills.js'
import { STILL_CACHE_TTL } from './file-ids.js'
import { framePath } from './encode.js'

const run = promisify(execFile)

it('makes requested JPEGs beyond the rain loop horizon, shares concurrent conversion and prunes the PNG cache', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'motregen-png-cache-'))
  const renderer = new StillRenderer('https://motregen.nl', directory)
  try {
    const manifest: StillManifest = { version: 0, generated: '2026-10-07T12:00:00Z', now: '2026-10-07T12:00:00Z', chunks: [] }
    const key = cacheKey({ mode: 'weather', hour: 'loop' }, manifest)
    const frames = join(directory, `${key}.frames`)
    await mkdir(frames)
    await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i', 'color=red:size=32x48', '-frames:v', '1', '-threads', '1', framePath(frames, 0)])
    const png = await readFile(framePath(frames, 0))
    const plan = sequencePlan('weather', manifest)
    await Promise.all(plan.epochs.slice(1).map((_epoch, index) => writeFile(framePath(frames, index + 1), png)))
    await writeFile(join(directory, `${key}.mp4`), 'cached-loop')
    await writeFile(join(directory, `${key}.sequence.json`), JSON.stringify({ key, frames: plan.loopFrames, fps: plan.fps, bytes: 11, renderMs: 10, encodeMs: 10 }))
    expect((await readdir(directory)).filter((name) => name.endsWith('.jpg'))).toHaveLength(0)
    const selection = { mode: 'weather', hour: 12 } as const
    const [first, shared] = await Promise.all([renderer.render(selection, manifest), renderer.render(selection, manifest)])
    expect(first).toBe(shared)
    expect(first.cached).toBe(false)
    expect((await readFile(first.path)).subarray(0, 2)).toEqual(Buffer.from([0xff, 0xd8]))
    expect((await readdir(directory)).filter((name) => name.endsWith('.jpg'))).toHaveLength(1)
    expect(await renderer.render(selection, manifest)).toMatchObject({ cached: true, milliseconds: 0, path: first.path })
    expect((await readdir(frames))).toHaveLength(plan.epochs.length)
    expect(await renderer.render({ mode: 'weather', hour: 'loop' }, manifest)).toMatchObject({ cached: true })
    const ledger = join(directory, '.cache-posts-keep.json')
    await writeFile(ledger, 'post-register')
    await renderer.prune(Date.now() + STILL_CACHE_TTL + 1000)
    await expect(stat(frames)).rejects.toThrow()
    await expect(stat(first.path)).rejects.toThrow()
    expect(await readFile(ledger, 'utf8')).toBe('post-register')
  } finally {
    await renderer.close()
    await rm(directory, { recursive: true, force: true })
  }
}, 15_000)
