import { spawn } from 'node:child_process'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { FRAME_PIXELS } from './config.js'
import { holdFrames, sequencePlan } from './sequences.js'
import { LOOP_MODES, STILL_HOURS, stillEpoch, type LoopMode, type StillManifest } from './stills.js'
import { validateLoopBytes } from './video-settings.js'

export interface RustFrameCacheReport {
  reused_frames: number; rendered_frames: number; uncacheable_frames: number; mismatches: number
  written_bytes: number; read_bytes: number; removed_files: number; resumed_chain: boolean
}
export interface RustMediaFile { file: string; kind: 'photo' | 'animation'; epoch: number; bytes: number; width: number; height: number }
export interface RustMedia {
  version: number; mode: string; generated: string; now: string; width: number; height: number
  fps: number; frames: number; hold_frames: number; loop_epochs: number[]
  render_ms: number; encode_ms: number; loop_ms: number; total_ms: number; files: RustMediaFile[]
  cache?: RustFrameCacheReport
}
export interface RustGeneration {
  version: number; mode: 'all'; generated: string; now: string; width: number; height: number
  total_ms: number; shared_raster_hits: number; modes: Record<LoopMode, RustMedia>
}

async function runRustProcess(manifest: StillManifest, directory: string, mode: LoopMode | 'all'): Promise<unknown> {
  const dataDirectory = process.env.MOTREGEN_DATA_DIR
  const basemapDirectory = process.env.MOTREGEN_RUST_BASEMAP_DIR
  if (!dataDirectory || !basemapDirectory) throw new Error('Rust-renderer vereist MOTREGEN_DATA_DIR en MOTREGEN_RUST_BASEMAP_DIR')
  const snapshot = join(directory, 'manifest.json')
  await writeFile(snapshot, JSON.stringify(manifest))
  const frameCache = process.env.MOTREGEN_FRAME_CACHE
  const child = spawn(process.env.MOTREGEN_RENDER_BIN ?? 'motregen-render', [
    '--data-dir', dataDirectory, '--basemap-dir', basemapDirectory, '--mode', mode, '--out-dir', directory, '--manifest', snapshot,
    ...(frameCache ? ['--frame-cache', frameCache] : []),
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  let diagnostic = ''
  child.stderr.on('data', (bytes: Buffer) => { diagnostic = (diagnostic + bytes.toString()).slice(-4000) })
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`Rust-renderer mislukt (${code}): ${diagnostic}`)))
  })
  return JSON.parse(await readFile(join(directory, 'media.json'), 'utf8'))
}

export async function runRustRenderer(manifest: StillManifest, directory: string, mode: LoopMode = 'weather'): Promise<RustMedia> {
  const media = await runRustProcess(manifest, directory, mode) as RustMedia
  await validateRustMedia(media, manifest, directory, mode)
  return media
}

export async function runRustGeneration(manifest: StillManifest, directory: string): Promise<RustGeneration> {
  const generation = await runRustProcess(manifest, directory, 'all') as RustGeneration
  await validateRustGeneration(generation, manifest, directory)
  return generation
}

export async function validateRustGeneration(generation: RustGeneration, manifest: StillManifest, directory: string): Promise<void> {
  if (generation.version !== 1 || generation.mode !== 'all' || generation.generated !== manifest.generated || generation.now !== manifest.now ||
      generation.width !== FRAME_PIXELS.width || generation.height !== FRAME_PIXELS.height ||
      !Number.isFinite(generation.total_ms) || generation.total_ms < 0 || !Number.isSafeInteger(generation.shared_raster_hits) || generation.shared_raster_hits < 0 ||
      !generation.modes || Object.keys(generation.modes).length !== LOOP_MODES.length) throw new Error('Rust-generatie wijkt af van manifest of mediamatrix')
  for (const { mode } of LOOP_MODES) await validateRustMedia(generation.modes[mode], manifest, directory, mode)
}

export async function validateRustMedia(media: RustMedia, manifest: StillManifest, directory: string, mode: LoopMode = 'weather'): Promise<void> {
  const plan = sequencePlan(mode, manifest)
  if (media.version !== 1 || media.mode !== mode || media.generated !== manifest.generated || media.now !== manifest.now ||
      media.width !== FRAME_PIXELS.width || media.height !== FRAME_PIXELS.height || media.frames !== plan.loopFrames || media.fps !== plan.fps ||
      media.hold_frames !== holdFrames(plan) || JSON.stringify(media.loop_epochs) !== JSON.stringify(plan.epochs.slice(0, plan.loopFrames)) ||
      ![media.render_ms, media.encode_ms, media.loop_ms, media.total_ms].every((value) => Number.isFinite(value) && value >= 0)) throw new Error('Rust-media wijkt af van manifest of loopplan')
  const expected = [{ file: `${mode}-loop.mp4`, kind: 'animation', epoch: Date.parse(manifest.now) },
    ...(mode === 'wind' ? [] : STILL_HOURS.map((hour) => ({ file: `${mode}-${stillEpoch(manifest, hour)}.jpg`, kind: 'photo', epoch: stillEpoch(manifest, hour) })))]
  if (!Array.isArray(media.files) || media.files.length !== expected.length) throw new Error('Onvolledige Rust-mediamatrix')
  for (const entry of expected) {
    const matches = media.files.filter((candidate) => candidate.file === entry.file)
    const file = matches[0]
    if (matches.length !== 1 || !file || file.kind !== entry.kind || file.epoch !== entry.epoch || file.width !== FRAME_PIXELS.width || file.height !== FRAME_PIXELS.height ||
        !Number.isFinite(file.bytes) || file.bytes <= 0 || (await stat(join(directory, entry.file))).size !== file.bytes) throw new Error('Ongeldig Rust-mediabestand')
    if (file.kind === 'animation') validateLoopBytes(file.bytes)
  }
}
