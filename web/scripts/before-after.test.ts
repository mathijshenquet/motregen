import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { beforeAfter, comparisonFilter, sameCamera } from '../../tools/before-after'

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
})
