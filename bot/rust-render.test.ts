import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import * as rust from './rust-render.js'
import { FRAME_PIXELS } from './config.js'
import { sequencePlan } from './sequences.js'
import { cacheKey, STILL_HOURS, stillEpoch, type StillManifest } from './stills.js'
import { rustRenderer } from './native-settings.js'
import { NativeWeatherRenderer } from './native-render.js'
import { NativeModesRenderer } from './native-modes-render.js'
import { StillRenderer } from './render.js'

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

const manifest: StillManifest = { version: 0, generated: '2026-10-10T11:32:48Z', now: '2026-10-10T11:30:00Z', chunks: [] }

async function media(directory: string): Promise<rust.RustMedia> {
  const plan = sequencePlan('weather', manifest)
  const files: rust.RustMediaFile[] = [
    { file: 'weather-loop.mp4', kind: 'animation', epoch: Date.parse(manifest.now), bytes: 4, ...FRAME_PIXELS },
    ...STILL_HOURS.map((hour) => ({ file: `weather-${stillEpoch(manifest, hour)}.jpg`, kind: 'photo' as const, epoch: stillEpoch(manifest, hour), bytes: 4, ...FRAME_PIXELS })),
  ]
  await Promise.all(files.map((file) => writeFile(join(directory, file.file), 'data')))
  return { version: 1, mode: 'weather', generated: manifest.generated, now: manifest.now, ...FRAME_PIXELS,
    fps: plan.fps, frames: plan.loopFrames, hold_frames: plan.fps, loop_epochs: plan.epochs.slice(0, plan.loopFrames),
    render_ms: 8, encode_ms: 1, loop_ms: 5, total_ms: 10, files }
}

it('defaults to the existing renderer and separates cache identities only for rain', () => {
  expect(rustRenderer('weather', {})).toBe(false)
  expect(rustRenderer('weather', { MOTREGEN_RUST_RENDERER: 'weather' })).toBe(true)
  expect(rustRenderer('feels', { MOTREGEN_RUST_RENDERER: 'weather' })).toBe(false)
  expect(() => rustRenderer('weather', { MOTREGEN_RUST_RENDERER: 'wind' })).toThrow()
  vi.stubEnv('MOTREGEN_RUST_RENDERER', '')
  const oldRain = cacheKey({ mode: 'weather', hour: 0 }, manifest)
  const oldFeels = cacheKey({ mode: 'feels', hour: 0 }, manifest)
  vi.stubEnv('MOTREGEN_RUST_RENDERER', 'weather')
  expect(cacheKey({ mode: 'weather', hour: 0 }, manifest)).not.toBe(oldRain)
  expect(cacheKey({ mode: 'feels', hour: 0 }, manifest)).toBe(oldFeels)
})

it('imports all Rust JPEGs directly and reuses the complete cache without native preparation', async () => {
  vi.stubEnv('MOTREGEN_RUST_RENDERER', 'weather')
  const directory = await mkdtemp(join(tmpdir(), 'motregen-rust-cache-'))
  const renderer = new StillRenderer('https://fixture.test', directory)
  const weatherPrepare = vi.spyOn(NativeWeatherRenderer.prototype, 'prepareAssets').mockRejectedValue(new Error('Unexpected browser preparation'))
  const modesPrepare = vi.spyOn(NativeModesRenderer.prototype, 'prepareAssets').mockRejectedValue(new Error('Unexpected browser preparation'))
  const render = vi.spyOn(rust, 'runRustRenderer').mockImplementation((_manifest, directory) => media(directory))
  try {
    const first = await renderer.render({ mode: 'weather', hour: 12 }, manifest)
    expect(first).toMatchObject({ kind: 'photo', cached: false, epoch: stillEpoch(manifest, 12) })
    expect(await readFile(first.path, 'utf8')).toBe('data')
    const loop = await renderer.render({ mode: 'weather', hour: 'loop' }, manifest)
    expect(loop).toMatchObject({ backend: 'rust', cached: true, frames: 241, fps: 10 })
    expect(render).toHaveBeenCalledOnce()
    expect(weatherPrepare).not.toHaveBeenCalled()
    expect(modesPrepare).not.toHaveBeenCalled()
    const second = new StillRenderer('https://fixture.test', directory)
    try { expect(await second.render({ mode: 'weather', hour: 0 }, manifest)).toMatchObject({ cached: true }) } finally { await second.close() }
    expect(render).toHaveBeenCalledOnce()
  } finally { await renderer.close(); await rm(directory, { recursive: true, force: true }) }
})

it('rejects an incomplete, stale, duplicated or mistimed Rust receipt', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'motregen-rust-receipt-'))
  try {
    const valid = await media(directory)
    await rust.validateRustMedia(valid, manifest, directory)
    for (const mutation of [
      { generated: '2026-10-10T11:32:49Z' }, { files: valid.files.slice(1) },
      { files: [...valid.files.slice(0, -1), valid.files[0]!] }, { loop_epochs: valid.loop_epochs.slice(1) },
      { files: valid.files.map((file, index) => index === 0 ? { ...file, file: '../elsewhere.mp4' } : file) },
    ]) await expect(rust.validateRustMedia({ ...valid, ...mutation }, manifest, directory)).rejects.toThrow()
    await rm(join(directory, valid.files[1]!.file))
    await expect(rust.validateRustMedia(valid, manifest, directory)).rejects.toThrow()
  } finally { await rm(directory, { recursive: true, force: true }) }
})
