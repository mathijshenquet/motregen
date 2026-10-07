import { execFile } from 'node:child_process'
import { stat } from 'node:fs/promises'
import { join } from 'node:path'
import { promisify } from 'node:util'
import type { SequencePlan } from './sequences.js'

const run = promisify(execFile)
const MAX_LOOP_BYTES = 3_000_000

export function framePath(directory: string, index: number): string {
  return join(directory, `frame-${String(index).padStart(3, '0')}.png`)
}

export async function encodeStill(frame: string, destination: string): Promise<void> {
  await run('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', '-i', frame, '-frames:v', '1', '-q:v', '3', '-f', 'image2', destination])
}

export async function encodeLoop(directory: string, destination: string, plan: SequencePlan): Promise<{ milliseconds: number; bytes: number }> {
  const started = performance.now()
  const frames = plan.loopFrames + plan.fps
  const duration = frames / plan.fps
  const input = ['-hide_banner', '-loglevel', 'error', '-y', '-framerate', String(plan.fps), '-i', join(directory, 'frame-%03d.png')]
  const output = ['-vf', `trim=end_frame=${plan.loopFrames},setpts=PTS-STARTPTS,tpad=stop_mode=clone:stop_duration=1`, '-frames:v', String(frames), '-c:v', 'libx264', '-threads', '2', '-preset', 'veryfast', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', '-f', 'mp4', destination]
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
