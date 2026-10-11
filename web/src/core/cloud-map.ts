import type { Grid, MrfHeader } from './contract'
import type { PreparedField } from './isoline-field'
import type { FieldBlend } from './sun'
import { layerTransmission, skyDarkness } from './cloud-section'
import { solarElevationSin } from './solar'
import { cloudModification } from './uv'

export const CLOUD_MAP_SAMPLES = ['live', 'gaten', 'sluier', 'dicht', 'overgang'] as const
export type CloudMapSample = typeof CLOUD_MAP_SAMPLES[number]
export const CLOUD_FLOW_STEPS = 12
export const CLOUD_FLOW_HOURS = 2
export const CLOUD_FLOW_DOWNSAMPLE = 2

export function cloudFlowPhase(epoch: number): number {
  const hours = epoch / 3_600_000
  return ((hours % CLOUD_FLOW_HOURS) + CLOUD_FLOW_HOURS) % CLOUD_FLOW_HOURS
}

export interface CloudMapStyle {
  enabled: boolean
  night: boolean
  sample: CloudMapSample
}

interface CloudMapInputs {
  low?: FieldBlend
  mid?: FieldBlend
  high?: FieldBlend
  radiation?: FieldBlend
  radiationNext?: FieldBlend
  windU?: FieldBlend
  windV?: FieldBlend
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

/** Two hints per source cell: shape (low puffs → high streaks) and ground-light darkness. */
export function prepareCloudMapField(grid: Grid, field: PreparedField, epoch: number, inputs: CloudMapInputs): PreparedField {
  const hints = new Float32Array(field.values.length * 2)
  const flow = new Float32Array(field.values.length * 2)
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
      const east = sampleBlend(inputs.windU, x, y), north = sampleBlend(inputs.windV, x, y)
      if (east != null && north != null) {
        const scale = 3_600 / Math.cos(latitude * Math.PI / 180)
        flow[cell * 2] = east * scale / grid.dx
        flow[cell * 2 + 1] = north * scale / grid.dy
      }
    }
  }
  return { ...field, cloudHints: hints, cloudFlow: flow, cloudEpoch: epoch }
}
