import { execFile, spawn } from 'node:child_process'
import { once } from 'node:events'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { availableParallelism } from 'node:os'
import { promisify } from 'node:util'
import type { SequencePlan } from './sequences.js'

const run = promisify(execFile)
const MAX_LOOP_BYTES = 3_000_000

export function framePath(directory: string, index: number): string {
  return join(directory, `frame-${String(index).padStart(3, '0')}.png`)
}

export async function encodeStill(frame: string, destination: string): Promise<void> {
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', frame, '-frames:v', '1', '-threads', '2', '-q:v', '3', '-f', 'image2', destination])
}

export async function encodeLoop(directory: string, destination: string, plan: SequencePlan): Promise<{ milliseconds: number; bytes: number }> {
  const started = performance.now()
  const frames = plan.loopFrames + plan.fps
  const duration = frames / plan.fps
  const input = ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(plan.fps), '-i', join(directory, 'frame-%03d.png')]
  const output = ['-vf', `trim=end_frame=${plan.loopFrames},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=1,setsar=1`, '-frames:v', String(frames), '-c:v', 'libx264', '-threads', '2', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', '-f', 'mp4', destination]
  await run('ffmpeg', [...input, '-crf', '25', ...output])
  let bytes = (await stat(destination)).size
  if (bytes > MAX_LOOP_BYTES) {
    const bitrate = Math.floor(2_500_000 * 8 / duration)
    await run('ffmpeg', [...input, '-b:v', String(bitrate), '-maxrate', String(bitrate), '-bufsize', String(bitrate), ...output])
    bytes = (await stat(destination)).size
  }
  if (bytes > MAX_LOOP_BYTES) throw new Error('Loop blijft groter dan 3 MB')
  return { milliseconds: Math.round(performance.now() - started), bytes }
}

export async function encodeRgbLoop(
  frames: AsyncIterable<Uint8Array>, destination: string, plan: SequencePlan,
  size: { width: number; height: number },
): Promise<{ milliseconds: number; bytes: number }> {
  const started = performance.now()
  const duration = (plan.loopFrames + plan.fps) / plan.fps
  const bitrate = Math.floor(2_500_000 * 8 / duration)
  const encoder = spawn('ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-y', '-filter_threads', '1', '-f', 'rawvideo', '-pixel_format', 'rgb24',
    '-video_size', `${size.width}x${size.height}`, '-framerate', String(plan.fps), '-i', 'pipe:0',
    '-vf', `tpad=stop_mode=clone:stop_duration=1,setsar=1`, '-frames:v', String(plan.loopFrames + plan.fps),
    '-c:v', 'libx264', '-threads', availableParallelism() <= 2 ? '1' : '2', '-preset', 'superfast', '-crf', '25',
    '-maxrate', String(bitrate), '-bufsize', String(bitrate), '-pix_fmt', 'yuv420p',
    '-movflags', '+faststart', '-an', '-f', 'mp4', destination,
  ], { stdio: ['pipe', 'ignore', 'pipe'] })
  let diagnostic = ''
  encoder.stderr.on('data', (bytes: Buffer) => { diagnostic = (diagnostic + bytes.toString()).slice(-4000) })
  encoder.stdin.on('error', () => undefined)
  const completed = new Promise<void>((resolve, reject) => {
    encoder.once('error', reject)
    encoder.once('close', (code) => code === 0 ? resolve() : reject(new Error(`RGB-encoder mislukt (${code}): ${diagnostic}`)))
  })
  void completed.catch(() => undefined)
  let count = 0
  try {
    for await (const frame of frames) {
      if (frame.length !== size.width * size.height * 3) throw new Error('Ongeldige RGB-framemaat')
      if (!encoder.stdin.write(frame)) await Promise.race([once(encoder.stdin, 'drain'), completed.then(() => { throw new Error('RGB-encoder vroegtijdig gesloten') })])
      count++
    }
    if (count !== plan.loopFrames) throw new Error(`RGB-reeks heeft ${count} frames; verwacht ${plan.loopFrames}`)
    encoder.stdin.end()
    await completed
  } catch (error) {
    encoder.kill('SIGKILL')
    await completed.catch(() => undefined)
    throw error
  }
  const bytes = (await stat(destination)).size
  if (bytes > MAX_LOOP_BYTES) throw new Error('Loop blijft groter dan 3 MB')
  return { milliseconds: Math.round(performance.now() - started), bytes }
}
