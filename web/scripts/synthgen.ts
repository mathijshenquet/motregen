import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ZstdCodec } from 'zstd-codec'
import type { Field, Grid, Manifest, ManifestChunk, MrfHeader, Source } from '../src/core/contract'
import { solarElevationSin } from '../src/core/solar'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = resolve(root, 'public/data')
const grid: Grid = { crs: 'EPSG:3857', x0: 320_000, y0: 7_170_000, dx: 3_000, dy: -3_000, width: 190, height: 230 }
const now = Date.parse('2026-08-28T15:00:00Z')
const rainQuant: Array<number | null> = [0]
for (let i = 1; i < 255; i++) rainQuant.push(Number((0.01 * Math.pow(150 / 0.01, (i - 1) / 253)).toFixed(4)))
rainQuant.push(null)
const radiationQuant: Array<number | null> = Array.from({ length: 255 }, (_, index) => index * 5)
radiationQuant.push(null)
const temperatureQuant = linearQuant(-25, 40)
const feelsLikeQuant = linearQuant(-35, 45)
const windQuant = linearQuant(-30, 30)
const uvQuant = linearQuant(0, 12.7)

interface ChunkPlan { name: string; source: Source; field: Field; run: number; times: number[] }
const plans: ChunkPlan[] = []
for (let hour = -3; hour < 0; hour++) plans.push({
  name: `rtcor-${iso(now + hour * 3_600_000).replaceAll(/[-:]/g, '').slice(0, 13)}.mrf`,
  source: 'rtcor', field: 'rain_rate', run: now + hour * 3_600_000,
  times: Array.from({ length: 12 }, (_, i) => now + hour * 3_600_000 + i * 300_000),
})
plans.push({ name: 'nowcast-20260828T1500.mrf', source: 'nowcast', field: 'rain_rate', run: now, times: Array.from({ length: 25 }, (_, i) => now + i * 300_000) })
plans.push({ name: 'harmonie-20260828T1200.mrf', source: 'harmonie', field: 'rain_rate', run: now - 3 * 3_600_000, times: Array.from({ length: 24 }, (_, i) => now + (i + 1) * 3_600_000) })
plans.push({ name: 'radiation-20260828T1200.mrf', source: 'harmonie', field: 'radiation', run: now - 3 * 3_600_000, times: Array.from({ length: 24 }, (_, i) => now + (i + 1) * 3_600_000) })
plans.push({
  name: 'uv-20260828.mrf', source: 'uv', field: 'uv', run: Date.parse('2026-08-28T00:00:00Z'),
  times: Array.from({ length: 72 }, (_, i) => Date.parse('2026-08-28T03:00:00Z') + i * 15 * 60_000),
})
const hourlyTimes = Array.from({ length: 24 }, (_, i) => now + (i + 1) * 3_600_000)
for (const field of ['temp_c', 'feels_like_c', 'wind_u_ms', 'wind_v_ms'] as const) plans.push({
  name: `${field}-20260828T1200.mrf`, source: 'harmonie', field, run: now - 3 * 3_600_000, times: hourlyTimes,
})

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

function makeRadiationFrame(epoch: number): Uint8Array {
  const values = new Uint8Array(grid.width * grid.height)
  const date = new Date(epoch)
  const utcHour = date.getUTCHours() + date.getUTCMinutes() / 60
  const daylight = Math.max(0, Math.sin(Math.PI * (utcHour - 4.5) / 16))
  if (daylight === 0) return values
  for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) {
    const cloudFactor = 0.62 + 0.3 * (0.5 + 0.5 * Math.sin(x * 0.045 + y * 0.031 + epoch / 7_200_000))
    values[y * grid.width + x] = Math.min(254, Math.round(850 * daylight * cloudFactor / 5))
  }
  return values
}

function makeUvFrame(epoch: number): Uint8Array {
  const values = new Uint8Array(grid.width * grid.height)
  const elevation = Math.max(0, solarElevationSin(epoch, 5.3, 52.15))
  if (elevation === 0) return values
  const clearUv = 7.5 * Math.pow(elevation, 0.8)
  for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) {
    const cloudFactor = 0.58 + 0.37 * (0.5 + 0.5 * Math.sin(x * 0.045 + y * 0.031 + epoch / 7_200_000))
    values[y * grid.width + x] = encodeLinear(clearUv * cloudFactor, uvQuant)
  }
  return values
}

function makeWeatherFrame(epoch: number, field: Exclude<Field, 'rain_rate' | 'radiation' | 'uv'>): Uint8Array {
  const values = new Uint8Array(grid.width * grid.height)
  const hour = (epoch - now) / 3_600_000
  for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) {
    const north = 1 - y / (grid.height - 1)
    const east = x / (grid.width - 1)
    const angle = hour * 0.08
    const vortexX = x - (92 + 20 * Math.cos(angle))
    const vortexY = y - (112 + 14 * Math.sin(angle))
    const vortexScale = 7 * Math.exp(-(vortexX * vortexX + vortexY * vortexY) / 8_500)
    const u = 4.5 + 3 * north - vortexY / 65 * vortexScale + 0.7 * Math.sin(y * 0.035 + angle)
    const v = 1.2 + 2.2 * Math.sin(east * Math.PI + angle) + vortexX / 65 * vortexScale
    const temperature = 16.5 + 4.2 * Math.sin((hour - 3) * Math.PI / 12) - 2.6 * north + 0.9 * Math.sin(x * 0.025 - y * 0.018)
    const speed = Math.hypot(u, v)
    const feelsLike = temperature - Math.max(0, 0.22 * speed - 0.7) + Math.max(0, temperature - 24) * 0.12
    const value = field === 'wind_u_ms' ? u : field === 'wind_v_ms' ? v : field === 'temp_c' ? temperature : feelsLike
    const quant = field.startsWith('wind_') ? windQuant : field === 'temp_c' ? temperatureQuant : feelsLikeQuant
    values[y * grid.width + x] = encodeLinear(value, quant)
  }
  return values
}

function encodeRain(value: number): number {
  if (value < 0.01) return 0
  return Math.max(1, Math.min(254, Math.round(1 + 253 * Math.log(value / 0.01) / Math.log(150 / 0.01))))
}

function linearQuant(minimum: number, maximum: number): Array<number | null> {
  const quant: Array<number | null> = Array.from({ length: 255 }, (_, index) => Number((minimum + (maximum - minimum) * index / 254).toFixed(4)))
  quant.push(null)
  return quant
}

function encodeLinear(value: number, quant: Array<number | null>): number {
  const minimum = quant[0]!
  const maximum = quant[254]!
  return Math.max(0, Math.min(254, Math.round((value - minimum) / (maximum - minimum) * 254)))
}

function quantFor(field: Field): Array<number | null> {
  if (field === 'rain_rate') return rainQuant
  if (field === 'radiation') return radiationQuant
  if (field === 'temp_c') return temperatureQuant
  if (field === 'feels_like_c') return feelsLikeQuant
  if (field === 'uv') return uvQuant
  return windQuant
}

function frameFor(plan: ChunkPlan, time: number, index: number): Uint8Array {
  if (plan.field === 'rain_rate') return makeFrame(time, plan.source, index)
  if (plan.field === 'radiation') return makeRadiationFrame(time)
  if (plan.field === 'uv') return makeUvFrame(time)
  return makeWeatherFrame(time, plan.field)
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
    const compressed = plan.times.map((time, index) => compressor.compress(frameFor(plan, time, index), 9))
    let offset = 0
    const header: MrfHeader = {
      version: 0,
      field: plan.field,
      grid,
      quant: quantFor(plan.field),
      source: plan.source,
      run: iso(plan.run),
      dict: null,
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
    chunks.push({ url: `chunks/${plan.name}`, source: plan.source, field: plan.field, run: iso(plan.run), header_len: 8 + json.length, times: plan.times.map(iso) })
  }
  const manifest: Manifest = { version: 0, generated: iso(now), now: iso(now), chunks }
  await writeFile(resolve(dataDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`Generated ${plans.reduce((sum, plan) => sum + plan.times.length, 0)} frames in ${plans.length} chunks`)
}

await main()
