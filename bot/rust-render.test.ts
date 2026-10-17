import { mkdtemp, readFile, readdir, rm, truncate, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect, it, vi } from 'vitest'
import * as rust from './rust-render.js'
import { FRAME_PIXELS } from './config.js'
import { holdFrames, sequencePlan } from './sequences.js'
import { cacheKey, enabledLoopModes, STILL_HOURS, stillEpoch, type LoopMode, type StillManifest } from './stills.js'
import { rustRenderer } from './native-settings.js'
import { NativeWeatherRenderer } from './native-render.js'
import { NativeModesRenderer } from './native-modes-render.js'
import { StillRenderer } from './render.js'

afterEach(() => { vi.unstubAllEnvs(); vi.restoreAllMocks() })

const manifest: StillManifest = { version: 0, generated: '2026-10-10T11:32:48Z', now: '2026-10-10T11:30:00Z', chunks: [] }

async function media(directory: string, mode: LoopMode = 'weather'): Promise<rust.RustMedia> {
  const plan = sequencePlan(mode, manifest)
  const files: rust.RustMediaFile[] = [
    { file: `${mode}-loop.mp4`, kind: 'animation', epoch: Date.parse(manifest.now), bytes: 4, ...FRAME_PIXELS },
    ...(mode === 'wind' ? [] : STILL_HOURS.map((hour) => ({ file: `${mode}-${stillEpoch(manifest, hour)}.jpg`, kind: 'photo' as const, epoch: stillEpoch(manifest, hour), bytes: 4, ...FRAME_PIXELS }))),
  ]
  await Promise.all(files.map((file) => writeFile(join(directory, file.file), 'data')))
  return { version: 1, mode, generated: manifest.generated, now: manifest.now, ...FRAME_PIXELS,
    fps: plan.fps, frames: plan.loopFrames, hold_frames: holdFrames(plan), loop_epochs: plan.epochs.slice(0, plan.loopFrames),
    render_ms: 18, encode_ms: 1, loop_ms: 5, total_ms: 10, files }
}

async function generation(directory: string): Promise<rust.RustGeneration> {
  const modes: Partial<Record<LoopMode, rust.RustMedia>> = {}
  for (const { mode } of enabledLoopModes()) modes[mode] = await media(directory, mode)
  return { version: 1, mode: 'all', generated: manifest.generated, now: manifest.now, ...FRAME_PIXELS, total_ms: 12, shared_raster_hits: 8, modes }
}

it('shares one complete Rust generation across concurrent modes and persists all caches', async () => {
  vi.stubEnv('MOTREGEN_RUST_RENDERER', 'weather,feels,wind')
  const directory = await mkdtemp(join(tmpdir(), 'motregen-rust-all-'))
  const renderer = new StillRenderer('https://fixture.test', directory)
  const single = vi.spyOn(rust, 'runRustRenderer').mockRejectedValue(new Error('Unexpected single-mode render'))
  const all = vi.spyOn(rust, 'runRustGeneration').mockImplementation((_manifest, directory) => generation(directory))
  const weatherPrepare = vi.spyOn(NativeWeatherRenderer.prototype, 'prepareAssets').mockRejectedValue(new Error('Unexpected browser preparation'))
  const modesPrepare = vi.spyOn(NativeModesRenderer.prototype, 'prepareAssets').mockRejectedValue(new Error('Unexpected browser preparation'))
  try {
    const loops = await Promise.all(enabledLoopModes().map(({ mode }) => renderer.render({ mode, hour: 'loop' }, manifest)))
    expect(loops).toHaveLength(3)
    for (const loop of loops) expect(loop).toMatchObject({ backend: 'rust', cached: false })
    expect(all).toHaveBeenCalledOnce()
    expect(single).not.toHaveBeenCalled()
    expect(weatherPrepare).not.toHaveBeenCalled()
    expect(modesPrepare).not.toHaveBeenCalled()
    const second = new StillRenderer('https://fixture.test', directory)
    try {
      for (const { mode } of enabledLoopModes()) {
        expect(await second.render({ mode, hour: 'loop' }, manifest)).toMatchObject({ backend: 'rust', cached: true })
        if (mode !== 'wind') for (const hour of STILL_HOURS) expect(await second.render({ mode, hour }, manifest)).toMatchObject({ kind: 'photo', cached: true })
      }
    } finally { await second.close() }
    expect(all).toHaveBeenCalledOnce()
  } finally { await renderer.close(); await rm(directory, { recursive: true, force: true }) }
})

it('retries a failed shared generation without publishing incomplete sequence receipts', async () => {
  vi.stubEnv('MOTREGEN_RUST_RENDERER', 'weather,feels,wind')
  const directory = await mkdtemp(join(tmpdir(), 'motregen-rust-retry-'))
  const renderer = new StillRenderer('https://fixture.test', directory)
  const all = vi.spyOn(rust, 'runRustGeneration').mockRejectedValueOnce(new Error('Incomplete matrix')).mockImplementation((_manifest, directory) => generation(directory))
  try {
    const failed = await Promise.allSettled(enabledLoopModes().map(({ mode }) => renderer.render({ mode, hour: 'loop' }, manifest)))
    expect(failed.every((result) => result.status === 'rejected')).toBe(true)
    expect(await readdir(directory)).toEqual([])
    for (const loop of await Promise.all(enabledLoopModes().map(({ mode }) => renderer.render({ mode, hour: 'loop' }, manifest)))) expect(loop.backend).toBe('rust')
    expect(all).toHaveBeenCalledTimes(2)
  } finally { await renderer.close(); await rm(directory, { recursive: true, force: true }) }
})

it('includes Lucht in the shared generation only when air is a Rust mode', async () => {
  vi.stubEnv('MOTREGEN_RUST_RENDERER', 'weather,feels,wind')
  const directory = await mkdtemp(join(tmpdir(), 'motregen-rust-air-'))
  try {
    const withoutAir = await generation(directory)
    expect(Object.keys(withoutAir.modes)).toEqual(['weather', 'feels', 'wind'])
    vi.stubEnv('MOTREGEN_RUST_RENDERER', 'weather,feels,wind,air')
    await expect(rust.validateRustGeneration(withoutAir, manifest, directory)).rejects.toThrow()
    const withAir = await generation(directory)
    expect(Object.keys(withAir.modes)).toEqual(['weather', 'air', 'feels', 'wind'])
    await rust.validateRustGeneration(withAir, manifest, directory)
    expect(withAir.modes.air!.files[0]!.file).toBe('air-loop.mp4')
  } finally { await rm(directory, { recursive: true, force: true }) }
})

it('validates every mode before accepting a shared Rust generation', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'motregen-rust-all-receipt-'))
  try {
    const valid = await generation(directory)
    await rust.validateRustGeneration(valid, manifest, directory)
    for (const mutation of [{ generated: 'stale' }, { now: 'stale' }, { mode: 'weather' }, { total_ms: -1 }, { shared_raster_hits: 0.5 }, { width: 1 },
      { modes: { weather: valid.modes.weather, feels: valid.modes.feels } },
      { modes: { ...valid.modes, wind: { ...valid.modes.wind, frames: 1 } } },
    ]) await expect(rust.validateRustGeneration({ ...valid, ...mutation } as rust.RustGeneration, manifest, directory)).rejects.toThrow()
    await rm(join(directory, valid.modes.feels.files[1]!.file))
    await expect(rust.validateRustGeneration(valid, manifest, directory)).rejects.toThrow()
  } finally { await rm(directory, { recursive: true, force: true }) }
})

it('accepts Rust films above the former cap and refuses a complete file above the safety limit', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'motregen-rust-size-'))
  try {
    const valid = await media(directory, 'wind')
    const loop = valid.files[0]!
    loop.bytes = 3_000_001
    await truncate(join(directory, loop.file), loop.bytes)
    await rust.validateRustMedia(valid, manifest, directory, 'wind')
    loop.bytes = 20_000_001
    await truncate(join(directory, loop.file), loop.bytes)
    await expect(rust.validateRustMedia(valid, manifest, directory, 'wind')).rejects.toThrow('veiligheidsgrens')
  } finally { await rm(directory, { recursive: true, force: true }) }
})

it('changes the loop cache identity with encoding settings and preserves still identities', () => {
  const loop = cacheKey({ mode: 'wind', hour: 'loop' }, manifest)
  const still = cacheKey({ mode: 'feels', hour: 0 }, manifest)
  vi.stubEnv('MOTREGEN_VIDEO_CRF', '16')
  expect(cacheKey({ mode: 'wind', hour: 'loop' }, manifest)).not.toBe(loop)
  expect(cacheKey({ mode: 'feels', hour: 0 }, manifest)).toBe(still)
})

it('invalidates cached Rust films and stills with former clock layouts', () => {
  vi.stubEnv('MOTREGEN_RUST_RENDERER', 'weather,feels,wind')
  vi.stubEnv('MOTREGEN_VIDEO_PRESET', 'veryfast')
  vi.stubEnv('MOTREGEN_VIDEO_CRF', '18')
  vi.stubEnv('MOTREGEN_VIDEO_MAX_BYTES', '20000000')
  // Cache-identiteiten van renderer 30, vastgelegd vóór MIP-32 op hetzelfde manifest.
  const previous = [
    ['weather', 'loop', 'weather-loop-8294c9292436debbdb0811a9'],
    ['feels', 'loop', 'feels-loop-850c0c2cb01d57db5ace4586'],
    ['wind', 'loop', 'wind-loop-ebdca9858eea4e62cff70b39'],
    ['weather', 0, 'weather-1791631800000-65bd469368e992c2794b1fe7'],
    ['feels', 0, 'feels-1791631800000-961dd269e8e40e8bb07899bb'],
  ] as const
  for (const [mode, hour, key] of previous) expect(cacheKey({ mode, hour }, manifest)).not.toBe(key)
  expect(cacheKey({ mode: 'feels', hour: 'loop' }, manifest)).not.toBe('feels-loop-5510442a93e40fee55a7de0b')
  expect(cacheKey({ mode: 'feels', hour: 0 }, manifest)).not.toBe('feels-1791631800000-364b127fadd7f7048813fe43')
})

it('defaults to the existing renderer and selects Rust independently per mode', () => {
  expect(rustRenderer('weather', {})).toBe(false)
  expect(rustRenderer('weather', { MOTREGEN_RUST_RENDERER: 'weather' })).toBe(true)
  expect(rustRenderer('feels', { MOTREGEN_RUST_RENDERER: 'weather' })).toBe(false)
  expect(rustRenderer('wind', { MOTREGEN_RUST_RENDERER: 'wind' })).toBe(true)
  for (const value of ['unknown', 'weather,weather', 'weather,', 'all']) expect(() => rustRenderer('weather', { MOTREGEN_RUST_RENDERER: value })).toThrow()
  vi.stubEnv('MOTREGEN_RUST_RENDERER', '')
  const oldRain = cacheKey({ mode: 'weather', hour: 0 }, manifest)
  const oldFeels = cacheKey({ mode: 'feels', hour: 0 }, manifest)
  vi.stubEnv('MOTREGEN_RUST_RENDERER', 'weather')
  expect(cacheKey({ mode: 'weather', hour: 0 }, manifest)).not.toBe(oldRain)
  expect(cacheKey({ mode: 'feels', hour: 0 }, manifest)).toBe(oldFeels)
  vi.stubEnv('MOTREGEN_RUST_RENDERER', 'weather,feels,wind')
  expect(cacheKey({ mode: 'feels', hour: 0 }, manifest)).not.toBe(oldFeels)
})

it.each(['feels', 'wind'] as const)('imports the %s matrix and reuses its cache without native preparation', async (mode) => {
  vi.stubEnv('MOTREGEN_RUST_RENDERER', mode)
  const directory = await mkdtemp(join(tmpdir(), 'motregen-rust-mode-'))
  const renderer = new StillRenderer('https://fixture.test', directory)
  const prepare = vi.spyOn(NativeModesRenderer.prototype, 'prepareAssets').mockRejectedValue(new Error('Unexpected browser preparation'))
  const render = vi.spyOn(rust, 'runRustRenderer').mockImplementation((_manifest, directory, mode) => media(directory, mode))
  try {
    const first = await renderer.render({ mode, hour: 'loop' }, manifest)
    expect(first).toMatchObject({ backend: 'rust', cached: false, frames: mode === 'wind' ? 289 : 217, fps: mode === 'wind' ? 7.5 : 5.6 })
    expect(await readFile(first.path, 'utf8')).toBe('data')
    expect(await renderer.render({ mode, hour: 'loop' }, manifest)).toMatchObject({ cached: true })
    if (mode === 'feels') expect(await renderer.render({ mode, hour: 6 }, manifest)).toMatchObject({ cached: true, kind: 'photo' })
    expect(render).toHaveBeenCalledOnce()
    expect(render.mock.calls[0]![2]).toBe(mode)
    expect(prepare).not.toHaveBeenCalled()
    const receipt = await media(directory, mode)
    await rust.validateRustMedia(receipt, manifest, directory, mode)
    await expect(rust.validateRustMedia(receipt, manifest, directory, mode === 'wind' ? 'feels' : 'wind')).rejects.toThrow()
  } finally { await renderer.close(); await rm(directory, { recursive: true, force: true }) }
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
    expect(first).toMatchObject({ kind: 'photo', cached: false, epoch: stillEpoch(manifest, 12), milliseconds: 10 })
    expect(await readFile(first.path, 'utf8')).toBe('data')
    const loop = await renderer.render({ mode: 'weather', hour: 'loop' }, manifest)
    expect(loop).toMatchObject({ backend: 'rust', cached: true, frames: 109, fps: 5.6, renderMs: 18, encodeMs: 1, totalMs: 10, milliseconds: 0 })
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
      { hold_frames: 4.5 }, { fps: 10 }, { frames: 241 },
      { files: [...valid.files.slice(0, -1), valid.files[0]!] }, { loop_epochs: valid.loop_epochs.slice(1) },
      { files: valid.files.map((file, index) => index === 0 ? { ...file, file: '../elsewhere.mp4' } : file) },
    ]) await expect(rust.validateRustMedia({ ...valid, ...mutation }, manifest, directory)).rejects.toThrow()
    await rm(join(directory, valid.files[1]!.file))
    await expect(rust.validateRustMedia(valid, manifest, directory)).rejects.toThrow()
  } finally { await rm(directory, { recursive: true, force: true }) }
})
