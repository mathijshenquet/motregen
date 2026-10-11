import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const [directory, basemapMetadata] = process.argv.slice(2)
const rainGrid = JSON.parse(readFileSync(basemapMetadata, 'utf8')).grid
const fieldGrid = { ...rainGrid, width: 32, height: 32, dx: rainGrid.dx * rainGrid.width / 32, dy: rainGrid.dy * rainGrid.height / 32 }
const times = ['2026-10-11T04:35:00Z', '2026-10-11T06:35:00Z', '2026-10-11T18:35:00Z']
const manifest = { version: 0, generated: times[1], now: times[1], chunks: [] }
mkdirSync(join(directory, 'chunks'), { recursive: true })

function chunk(field, source, grid, selectedTimes, first, step, value) {
  const quant = Array.from({ length: 256 }, (_, index) => index === 255 ? null : first + index * step)
  const cells = Buffer.alloc(grid.width * grid.height, Math.round((value - first) / step))
  const compressed = execFileSync('zstd', ['--quiet', '-19', '--stdout'], { input: cells })
  const frames = selectedTimes.map((time, index) => ({ time, offset: index * compressed.length, len: compressed.length }))
  const header = Buffer.from(JSON.stringify({ version: 0, field, grid, quant, source, run: times[0], frames, dict: null }))
  const prefix = Buffer.alloc(8)
  prefix.write('mrf0')
  prefix.writeUInt32LE(header.length, 4)
  const url = `chunks/${field}-${source}.mrf`
  writeFileSync(join(directory, url), Buffer.concat([prefix, header, ...selectedTimes.map(() => compressed)]))
  manifest.chunks.push({ url, field, source, run: times[0], times: selectedTimes })
}

chunk('rain_rate', 'rtcor', rainGrid, times.slice(0, 2), 0, 1, 0)
chunk('rain_rate', 'harmonie', rainGrid, times.slice(2), 0, 1, 0)
chunk('feels_like_c', 'harmonie', fieldGrid, times, -50, 0.5, 14)
chunk('pressure_hpa', 'harmonie', fieldGrid, times, 900, 1, 1012)
chunk('wind_u_ms', 'harmonie', fieldGrid, times, -50, 0.5, 3)
chunk('wind_v_ms', 'harmonie', fieldGrid, times, -50, 0.5, 2)
writeFileSync(join(directory, 'manifest.json'), JSON.stringify(manifest))
