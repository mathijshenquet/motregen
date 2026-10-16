import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { beforeAfter, comparisonFilter, comparisonVideoFilter, sameCamera } from '../../tools/before-after'

describe('before/after tooling', () => {
  it('rejects invalid arguments before launching a browser or making requests', async () => {
    await expect(beforeAfter([])).rejects.toThrow('Gebruik')
    await expect(beforeAfter(['http://localhost:1', 'http://localhost:2', '/weer', 'out.mp4', '--time', '2026-10-16T08:00:00Z'])).rejects.toThrow('.webp')
    await expect(beforeAfter(['http://localhost:1', 'http://localhost:2', '/weer', 'out.mp4', '--time', '2026-10-16T08:00:00Z', '--duration', '13'])).rejects.toThrow('duur')
  })

  it('compares effective cameras after the app applies its geographic constraints', () => {
    const camera = { longitude: 4.865, latitude: 52.146, zoom: 6.596 }
    expect(sameCamera(camera, { ...camera })).toBe(true)
    expect(sameCamera(camera, { ...camera, longitude: 5.3 })).toBe(false)
    expect(sameCamera(camera, { ...camera, zoom: 7 })).toBe(false)
  })

  it('really renders a labelled side-by-side WebP using ffmpeg', () => {
    const scratch = mkdtempSync(resolve(tmpdir(), 'motregen-comparison-test-'))
    try {
      const output = resolve(scratch, 'comparison.webp')
      execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=1280x800', '-f', 'lavfi', '-i', 'color=c=green:s=1280x800', '-filter_complex', comparisonFilter(), '-map', '[out]', '-frames:v', '1', '-c:v', 'libwebp', output], { stdio: 'pipe' })
      const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_streams', '-of', 'json', output], { encoding: 'utf8' })) as { streams: { width: number; height: number }[] }
      expect(info.streams[0]).toMatchObject({ width: 1280, height: 400 })
      expect(statSync(output).size).toBeGreaterThan(0)
    } finally { rmSync(scratch, { recursive: true, force: true }) }
  })

  it('really renders a short sequential H.264 clip with before followed by after', () => {
    const scratch = mkdtempSync(resolve(tmpdir(), 'motregen-comparison-video-test-'))
    try {
      const output = resolve(scratch, 'comparison.mp4')
      execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'color=c=blue:s=1280x800:r=12:d=1', '-f', 'lavfi', '-i', 'color=c=green:s=1280x800:r=12:d=1', '-filter_complex', comparisonVideoFilter(2), '-map', '[out]', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', output], { stdio: 'pipe' })
      const info = JSON.parse(execFileSync('ffprobe', ['-v', 'error', '-show_format', '-show_streams', '-of', 'json', output], { encoding: 'utf8' })) as { streams: { width: number; height: number; codec_name: string }[]; format: { duration: string } }
      expect(info.streams[0]).toMatchObject({ codec_name: 'h264', width: 960, height: 600 })
      expect(Number(info.format.duration)).toBe(2)
      const sample = (time: string) => execFileSync('ffmpeg', ['-v', 'error', '-ss', time, '-i', output, '-vf', 'format=rgb24,crop=1:1:480:300', '-frames:v', '1', '-f', 'rawvideo', 'pipe:1'])
      const before = sample('0.5')
      const after = sample('1.5')
      expect(before[2]).toBeGreaterThan(before[1]!)
      expect(after[1]).toBeGreaterThan(after[2]!)
      expect(statSync(output).size).toBeLessThan(2_000_000)
    } finally { rmSync(scratch, { recursive: true, force: true }) }
  })
})
