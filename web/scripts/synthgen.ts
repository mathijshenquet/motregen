import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { ZstdCodec } from 'zstd-codec'
import type { Field, FrameIndex, Grid, Manifest, ManifestChunk, MotionGrid, MrfHeader, Source } from '../src/core/contract'
import { solarElevationSin } from '../src/core/solar'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dataDir = resolve(root, 'public/data')
const grid: Grid = { crs: 'EPSG:3857', x0: 320_000, y0: 7_170_000, dx: 3_000, dy: -3_000, width: 190, height: 230 }
const motionGrid: MotionGrid = { bw: 19, bh: 23 }
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
const percentQuant = linearQuant(0, 100)

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
for (const field of ['temp_c', 'feels_like_c', 'wind_u_ms', 'wind_v_ms', 'rel_humidity', 'cloud_frac'] as const) plans.push({
  name: `${field}-20260828T1200.mrf`, source: 'harmonie', field, run: now - 3 * 3_600_000, times: hourlyTimes,
})

function iso(epoch: number): string { return new Date(epoch).toISOString().replace('.000', '') }

interface RainCell {
  x: number
  y: number
  rx: number
  ry: number
  peak: number
  vx: number
  vy: number
}

function rainCells(epoch: number): RainCell[] {
  const minutes = (epoch - now) / 60_000
  return [
    { x: 62 + minutes * 0.1, y: 80 + minutes * 0.1, rx: 25, ry: 15, peak: 18, vx: 0.1, vy: 0.1 },
    { x: 118 + minutes * 0.1, y: 135, rx: 16, ry: 30, peak: 55, vx: 0.1, vy: 0 },
    { x: 38 + minutes * 0.1, y: 175 - minutes * 0.1, rx: 34, ry: 20, peak: 3.5, vx: 0.1, vy: -0.1 },
  ]
}

function makeFrame(epoch: number, source: Source, ordinal: number): Uint8Array {
  const values = new Uint8Array(grid.width * grid.height)
  if ((source === 'rtcor' && ordinal === 7) || (source === 'harmonie' && ordinal > 20)) return values
  const cells = rainCells(epoch)
  for (let y = 0; y < grid.height; y++) for (let x = 0; x < grid.width; x++) {
    let rain = 0
    for (const cell of cells) {
      const radius = ((x - cell.x) / cell.rx) ** 2 + ((y - cell.y) / cell.ry) ** 2
      if (radius < 1) rain += cell.peak * (1 - radius) ** 2 * (0.78 + 0.22 * Math.sin((x - cell.x) * 0.31 + (y - cell.y) * 0.19))
    }
    values[y * grid.width + x] = encodeRain(Math.max(0, rain))
  }
  return values
}

function makeMotion(previousEpoch: number, epoch: number): Uint8Array {
  const values = new Uint8Array(motionGrid.bw * motionGrid.bh * 2)
  const cells = rainCells((previousEpoch + epoch) / 2)
  for (let by = 0; by < motionGrid.bh; by++) for (let bx = 0; bx < motionGrid.bw; bx++) {
    const x = (bx + 0.5) * grid.width / motionGrid.bw - 0.5
    const y = (by + 0.5) * grid.height / motionGrid.bh - 0.5
    let closest = cells[0]!
    let closestRadius = Number.POSITIVE_INFINITY
    for (const cell of cells) {
      const radius = ((x - cell.x) / cell.rx) ** 2 + ((y - cell.y) / cell.ry) ** 2
      if (radius < closestRadius) { closest = cell; closestRadius = radius }
    }
    const index = (by * motionGrid.bw + bx) * 2
    values[index] = Math.round(closest.vx * 10)
    values[index + 1] = Math.round(closest.vy * 10)
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
    const cloud = Math.max(0, Math.min(100, 48 + 42 * Math.sin(x * 0.035 + y * 0.018 + hour * 0.35)))
    const humidity = Math.max(25, Math.min(100, 58 + cloud * 0.28 - temperature * 0.35 + 8 * Math.sin(y * 0.04 - hour * 0.2)))
    const value = field === 'wind_u_ms' ? u
      : field === 'wind_v_ms' ? v
        : field === 'temp_c' ? temperature
          : field === 'feels_like_c' ? feelsLike
            : field === 'rel_humidity' ? humidity
              : cloud
    const quant = field.startsWith('wind_') ? windQuant
      : field === 'temp_c' ? temperatureQuant
        : field === 'feels_like_c' ? feelsLikeQuant
          : percentQuant
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
  if (field === 'rel_humidity' || field === 'cloud_frac') return percentQuant
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
    const compressedMotion = plan.field === 'rain_rate'
      ? plan.times.map((time, index) => index === 0 ? undefined : compressor.compress(makeMotion(plan.times[index - 1]!, time), 9))
      : plan.times.map(() => undefined)
    let offset = 0
    const frames: FrameIndex[] = plan.times.map((time, index) => {
      const frame = { time: iso(time), offset, len: compressed[index]!.length }
      offset += frame.len
      return frame
    })
    for (let index = 0; index < frames.length; index++) {
      const motion = compressedMotion[index]
      if (!motion) continue
      frames[index]!.motion = { offset, len: motion.length }
      offset += motion.length
    }
    const header: MrfHeader = {
      version: 0,
      field: plan.field,
      grid,
      quant: quantFor(plan.field),
      source: plan.source,
      run: iso(plan.run),
      dict: null,
      frames,
      ...(plan.field === 'rain_rate' ? { motion_grid: motionGrid } : {}),
    }
    const json = new TextEncoder().encode(JSON.stringify(header))
    const prefix = new Uint8Array(8)
    prefix.set(new TextEncoder().encode('mrf0'))
    new DataView(prefix.buffer).setUint32(4, json.length, true)
    const file = Buffer.concat([prefix, json, ...compressed, ...compressedMotion.filter((member): member is Uint8Array => member !== undefined)])
    await writeFile(resolve(dataDir, 'chunks', plan.name), file)
    chunks.push({ url: `chunks/${plan.name}`, source: plan.source, field: plan.field, run: iso(plan.run), header_len: 8 + json.length, times: plan.times.map(iso) })
  }
  const manifest: Manifest = { version: 0, generated: iso(now), now: iso(now), chunks }
  await writeFile(resolve(dataDir, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`)
  console.log(`Generated ${plans.reduce((sum, plan) => sum + plan.times.length, 0)} frames in ${plans.length} chunks`)
}

await main()
