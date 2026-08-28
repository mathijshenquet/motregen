import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ZstdCodec } from 'zstd-codec'
import type { Grid, Manifest, ManifestChunk, MrfHeader, Source } from '../src/core/contract'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = resolve(root, 'public/data')
const grid: Grid = { crs: 'EPSG:3857', x0: 320_000, y0: 7_170_000, dx: 3_000, dy: -3_000, width: 190, height: 230 }
const now = Date.parse('2026-08-28T15:00:00Z')
const quant: Array<number | null> = [0]
for (let i = 1; i < 255; i++) quant.push(Number((0.01 * Math.pow(150 / 0.01, (i - 1) / 253)).toFixed(4)))
quant.push(null)

interface ChunkPlan { name: string; source: Source; run: number; times: number[] }
const plans: ChunkPlan[] = []
for (let hour = -3; hour < 0; hour++) plans.push({
  name: `rtcor-${iso(now + hour * 3_600_000).replaceAll(/[-:]/g, '').slice(0, 13)}.mrf`,
  source: 'rtcor', run: now + hour * 3_600_000,
  times: Array.from({ length: 12 }, (_, i) => now + hour * 3_600_000 + i * 300_000),
})
plans.push({ name: 'nowcast-20260828T1500.mrf', source: 'nowcast', run: now, times: Array.from({ length: 25 }, (_, i) => now + i * 300_000) })
plans.push({ name: 'harmonie-20260828T1200.mrf', source: 'harmonie', run: now - 3 * 3_600_000, times: Array.from({ length: 24 }, (_, i) => now + (i + 1) * 3_600_000) })

function iso(epoch: number): string { return new Date(epoch).toISOString().replace('.000', '') }

function makeFrame(epoch: number, source: Source, ordinal: number): Uint8Array {
  const values = new Uint8Array(grid.width * grid.height)
  if ((source === 'rtcor' && ordinal === 7) || (source === 'harmonie' && ordinal > 20)) return values
  const minutes = (epoch - now) / 60_000
  const cells = [
    { x: 62 + minutes * 0.035, y: 80 + minutes * 0.012, rx: 25, ry: 15, peak: 18 },
    { x: 118 + minutes * 0.018, y: 135 - minutes * 0.006, rx: 16, ry: 30, peak: 55 },
    { x: 38 + minutes * 0.022, y: 175 - minutes * 0.009, rx: 34, ry: 20, peak: 3.5 },
  ]
  for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) {
    let rain = 0
    for (const cell of cells) {
      const radius = ((x - cell.x) / cell.rx) ** 2 + ((y - cell.y) / cell.ry) ** 2
      if (radius < 1) rain += cell.peak * (1 - radius) ** 2 * (0.78 + 0.22 * Math.sin(x * 0.31 + y * 0.19 + ordinal))
    }
    values[y * grid.width + x] = encodeRain(Math.max(0, rain))
  }
  return values
}

function encodeRain(value: number): number {
  if (value < 0.01) return 0
  return Math.max(1, Math.min(254, Math.round(1 + 253 * Math.log(value / 0.01) / Math.log(150 / 0.01))))
}

async function zstdSimple(): Promise<{ compress(data: Uint8Array, level?: number): Uint8Array }> {
  return new Promise((resolveCodec) => ZstdCodec.run((zstd) => resolveCodec(new zstd.Simple())))
}

async function main(): Promise<void> {
  await rm(dataDir, { recursive: true, force: true })
  await mkdir(resolve(dataDir, 'chunks'), { recursive: true })
  const compressor = await zstdSimple()
  const chunks: ManifestChunk[] = []
  for (const plan of plans) {
    const compressed = plan.times.map((time, index) => compressor.compress(makeFrame(time, plan.source, index), 9))
    let offset = 0
    const header: MrfHeader = {
      version: 0, grid, quant, source: plan.source, run: iso(plan.run), dict: null,
      frames: plan.times.map((time, index) => {
        const frame = { time: iso(time), offset, len: compressed[index]!.length }
        offset += frame.len
        return frame
      }),
    }
    const json = new TextEncoder().encode(JSON.stringify(header))
    const prefix = new Uint8Array(8)
    prefix.set(new TextEncoder().encode('mrf0'))
    new DataView(prefix.buffer).setUint32(4, json.length, true)
    const file = Buffer.concat([prefix, json, ...compressed])
    await writeFile(resolve(dataDir, 'chunks', plan.name), file)
    chunks.push({ url: `chunks/${plan.name}`, source: plan.source, run: iso(plan.run), header_len: 8 + json.length, times: plan.times.map(iso) })
  }
  const manifest: Manifest = { version: 0, generated: iso(now), now: iso(now), chunks }
  await writeFile(resolve(dataDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`Generated ${plans.reduce((sum, plan) => sum + plan.times.length, 0)} frames in ${plans.length} chunks`)
}

await main()
