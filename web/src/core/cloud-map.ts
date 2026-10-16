import type { MotionField } from './mrf'
import type { Grid, MrfHeader } from './contract'
import type { PreparedField } from './isoline-field'
import type { FieldBlend } from './sun'
import { layerTransmission, skyDarkness } from './cloud-section'
import { solarElevationSin } from './solar'
import { cloudModification } from './uv'

export const CLOUD_MAP_SAMPLES = ['live', 'gaten', 'sluier', 'dicht', 'overgang'] as const
export type CloudMapSample = typeof CLOUD_MAP_SAMPLES[number]
export const CLOUD_FLOW_STEPS = 8
export const CLOUD_FLOW_HOURS = 0.5
export const CLOUD_FLOW_DOWNSAMPLE = 3

export function cloudFlowPhase(epoch: number): number {
  const hours = epoch / 3_600_000
  return ((hours % CLOUD_FLOW_HOURS) + CLOUD_FLOW_HOURS) % CLOUD_FLOW_HOURS
}

export interface CloudMapStyle {
  enabled: boolean
  night: boolean
  sample: CloudMapSample
}

export interface CloudDriftSample {
  epoch: number
  velocity: readonly [number, number]
  position: readonly [number, number]
}

export function cloudMotionMean(source: CloudMapInputs['motion']): [number, number] {
  if (!source) return [0, 0]
  const { grid, field } = source
  const data = new Int8Array(field.vectors.buffer, field.vectors.byteOffset, field.vectors.byteLength)
  let x = 0, y = 0, count = 0
  for (let at = 0; at < data.length; at += 2) {
    if (data[at] === -128 || data[at + 1] === -128) continue
    x += data[at]!; y += data[at + 1]!; count++
  }
  return count ? [x / count * 6 * grid.dx, y / count * 6 * grid.dy] : [0, 0]
}

export function cloudDriftPath(samples: readonly { epoch: number; velocity: readonly [number, number] }[], previousPath: readonly CloudDriftSample[] = []): CloudDriftSample[] {
  return samples.reduce<CloudDriftSample[]>((path, sample) => {
    const previous = path.at(-1)
    const hours = previous ? (sample.epoch - previous.epoch) / 3_600_000 : 0
    path.push({ ...sample, position: [0, 1].map((axis) => previous
      ? previous.position[axis]! + (previous.velocity[axis]! + sample.velocity[axis]!) * hours / 2 : cloudDriftAt(previousPath, sample.epoch)[axis]!) as [number, number] })
    return path
  }, [])
}

export function cloudDriftAt(path: readonly CloudDriftSample[], epoch: number): [number, number] {
  if (!path.length) return [0, 0]
  const right = path.findIndex((sample) => sample.epoch > epoch)
  const left = path[Math.max(0, right < 0 ? path.length - 1 : right - 1)]!
  const next = right > 0 ? path[right] : undefined
  const hours = (epoch - left.epoch) / 3_600_000
  const mix = next ? (epoch - left.epoch) / (next.epoch - left.epoch) : 0
  return [0, 1].map((axis) => left.position[axis]! + hours * (left.velocity[axis]!
    + (next ? next.velocity[axis]! - left.velocity[axis]! : 0) * mix / 2)) as [number, number]
}

interface CloudMapInputs {
  drift?: readonly CloudDriftSample[]
  low?: FieldBlend
  mid?: FieldBlend
  high?: FieldBlend
  radiation?: FieldBlend
  radiationNext?: FieldBlend
  motion?: { grid: Grid; field: MotionField }
}

function sampleFrame(header: MrfHeader, data: Uint8Array, x: number, y: number): number | null {
  const grid = header.grid
  const column = (x - grid.x0) / grid.dx - 0.5
  const row = (y - grid.y0) / grid.dy - 0.5
  if (column < -0.5 || row < -0.5 || column > grid.width - 0.5 || row > grid.height - 0.5) return null
  const left = Math.floor(column), top = Math.floor(row)
  const mixX = column - left, mixY = row - top
  let sum = 0, weight = 0
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const at = Math.max(0, Math.min(grid.height - 1, top + dy)) * grid.width + Math.max(0, Math.min(grid.width - 1, left + dx))
    const value = header.quant[data[at]!]
    const share = (dx ? mixX : 1 - mixX) * (dy ? mixY : 1 - mixY)
    if (value != null && Number.isFinite(value)) { sum += value * share; weight += share }
  }
  return weight > 0 ? sum / weight : null
}

function sampleBlend(blend: FieldBlend | undefined, x: number, y: number): number | null {
  if (!blend) return null
  const left = sampleFrame(blend.leftHeader, blend.left, x, y)
  const right = sampleFrame(blend.rightHeader, blend.right, x, y)
  return left == null ? right : right == null ? left : left * (1 - blend.mix) + right * blend.mix
}

function sampleMotion(source: CloudMapInputs['motion'], signed: Int8Array | undefined, x: number, y: number): [number, number] | undefined {
  if (!source || !signed) return undefined
  const { grid, field } = source
  const u = (x - grid.x0) / (grid.dx * grid.width), v = (y - grid.y0) / (grid.dy * grid.height)
  if (u < 0 || u > 1 || v < 0 || v > 1) return undefined
  const column = u * field.width - 0.5, row = v * field.height - 0.5
  const left = Math.floor(column), top = Math.floor(row), mixX = column - left, mixY = row - top
  let east = 0, down = 0
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
    const weight = (dx ? mixX : 1 - mixX) * (dy ? mixY : 1 - mixY)
    if (weight === 0) continue
    const at = Math.max(0, Math.min(field.height - 1, top + dy)) * field.width + Math.max(0, Math.min(field.width - 1, left + dx))
    const a = signed[at * 2], b = signed[at * 2 + 1]
    if (a == null || b == null || a === -128 || b === -128) return undefined
    east += a * weight
    down += b * weight
  }
  // Annex units are 0.1 projected source cells/minute, not ground m/s: no latitude factor.
  return [east * 6 * grid.dx, down * 6 * grid.dy]
}

/** Two hints per source cell: shape (low puffs → high streaks) and ground-light darkness. */
export function prepareCloudMapField(grid: Grid, field: PreparedField, epoch: number, inputs: CloudMapInputs): PreparedField {
  const hints = new Float32Array(field.values.length * 2)
  const flow = new Float32Array(field.values.length * 2)
  const vectors = inputs.motion?.field.vectors
  const signedMotion = vectors ? new Int8Array(vectors.buffer, vectors.byteOffset, vectors.byteLength) : undefined
  const radius = 6_378_137
  for (let row = 0; row < grid.height; row++) {
    const y = grid.y0 + (row + 0.5) * grid.dy
    const latitude = (2 * Math.atan(Math.exp(y / radius)) - Math.PI / 2) * 180 / Math.PI
    for (let column = 0; column < grid.width; column++) {
      const cell = row * grid.width + column
      const x = grid.x0 + (column + 0.5) * grid.dx
      const longitude = x / radius * 180 / Math.PI
      const cover = Math.max(0, Math.min(1, field.values[cell]! / 100))
      const fraction = (blend: FieldBlend | undefined) => {
        const value = sampleBlend(blend, x, y)
        return value == null ? null : Math.max(0, Math.min(1, value / 100))
      }
      const low = fraction(inputs.low), mid = fraction(inputs.mid), high = fraction(inputs.high)
      const hasLayers = low != null || mid != null || high != null
      const layers = { low: low ?? (hasLayers ? 0 : cover), mid: mid ?? 0, high: high ?? 0 }
      const total = layers.low + layers.mid + layers.high
      hints[cell * 2] = total > 0 ? (0.55 * layers.mid + layers.high) / total : 0
      const light = cloudModification(epoch, sampleBlend(inputs.radiation, x, y), sampleBlend(inputs.radiationNext, x, y), (time) => solarElevationSin(time, longitude, latitude))
      const fallback = low != null && mid != null && high != null ? layerTransmission(layers) : 1 - 0.75 * cover
      hints[cell * 2 + 1] = skyDarkness(light ?? fallback)
      const motion = sampleMotion(inputs.motion, signedMotion, x, y)
      if (motion) {
        flow[cell * 2] = motion[0] / grid.dx
        flow[cell * 2 + 1] = motion[1] / grid.dy
      }
    }
  }
  return { ...field, cloudHints: hints, cloudFlow: flow, cloudEpoch: epoch, cloudDrift: inputs.drift }
}
