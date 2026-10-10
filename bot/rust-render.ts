import { spawn } from 'node:child_process'
import { readFile, stat, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { FRAME_PIXELS } from './config.js'
import { sequencePlan } from './sequences.js'
import { STILL_HOURS, stillEpoch, type StillManifest } from './stills.js'

export interface RustMediaFile { file: string; kind: 'photo' | 'animation'; epoch: number; bytes: number; width: number; height: number }
export interface RustMedia {
  version: number; mode: string; generated: string; now: string; width: number; height: number
  fps: number; frames: number; hold_frames: number; loop_epochs: number[]
  render_ms: number; encode_ms: number; loop_ms: number; total_ms: number; files: RustMediaFile[]
}

export async function runRustRenderer(manifest: StillManifest, directory: string): Promise<RustMedia> {
  const dataDirectory = process.env.MOTREGEN_DATA_DIR
  const basemapDirectory = process.env.MOTREGEN_RUST_BASEMAP_DIR
  if (!dataDirectory || !basemapDirectory) throw new Error('Rust-renderer vereist MOTREGEN_DATA_DIR en MOTREGEN_RUST_BASEMAP_DIR')
  const snapshot = join(directory, 'manifest.json')
  await writeFile(snapshot, JSON.stringify(manifest))
  const child = spawn(process.env.MOTREGEN_RENDER_BIN ?? 'motregen-render', [
    '--data-dir', dataDirectory, '--basemap-dir', basemapDirectory, '--mode', 'weather', '--out-dir', directory, '--manifest', snapshot,
  ], { stdio: ['ignore', 'ignore', 'pipe'] })
  let diagnostic = ''
  child.stderr.on('data', (bytes: Buffer) => { diagnostic = (diagnostic + bytes.toString()).slice(-4000) })
  await new Promise<void>((resolve, reject) => {
    child.once('error', reject)
    child.once('close', (code) => code === 0 ? resolve() : reject(new Error(`Rust-renderer mislukt (${code}): ${diagnostic}`)))
  })
  const media = JSON.parse(await readFile(join(directory, 'media.json'), 'utf8')) as RustMedia
  await validateRustMedia(media, manifest, directory)
  return media
}

export async function validateRustMedia(media: RustMedia, manifest: StillManifest, directory: string): Promise<void> {
  const plan = sequencePlan('weather', manifest)
  if (media.version !== 1 || media.mode !== 'weather' || media.generated !== manifest.generated || media.now !== manifest.now ||
      media.width !== FRAME_PIXELS.width || media.height !== FRAME_PIXELS.height || media.frames !== plan.loopFrames || media.fps !== plan.fps ||
      media.hold_frames !== plan.fps || JSON.stringify(media.loop_epochs) !== JSON.stringify(plan.epochs.slice(0, plan.loopFrames)) ||
      ![media.render_ms, media.encode_ms, media.loop_ms, media.total_ms].every((value) => Number.isFinite(value) && value >= 0)) throw new Error('Rust-media wijkt af van manifest of loopplan')
  const expected = [{ file: 'weather-loop.mp4', kind: 'animation', epoch: Date.parse(manifest.now) },
    ...STILL_HOURS.map((hour) => ({ file: `weather-${stillEpoch(manifest, hour)}.jpg`, kind: 'photo', epoch: stillEpoch(manifest, hour) }))]
  if (!Array.isArray(media.files) || media.files.length !== expected.length) throw new Error('Onvolledige Rust-mediamatrix')
  for (const entry of expected) {
    const matches = media.files.filter((candidate) => candidate.file === entry.file)
    const file = matches[0]
    if (matches.length !== 1 || !file || file.kind !== entry.kind || file.epoch !== entry.epoch || file.width !== FRAME_PIXELS.width || file.height !== FRAME_PIXELS.height ||
        !Number.isFinite(file.bytes) || file.bytes <= 0 || (await stat(join(directory, entry.file))).size !== file.bytes) throw new Error('Ongeldig Rust-mediabestand')
  }
}
