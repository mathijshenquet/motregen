import type { MrfHeader } from './contract.js'
import type { MotionField } from './mrf.js'
import { WARP_CAP_CELLS, motionWarpStrength } from './rain-motion.js'

/**
 * Regen op één plek tussen twee frames, precies zoals de kaartshader hem tekent (`rain-layer.ts`): het linker frame
 * verschoven met +w·v, het rechter met −(1−w)·v, gemengd in bytes. Zo vertellen de tussenbalken in het histogram
 * hetzelfde als de kaart, ook als een bui langzaam over de plek schuift (PO 2026-10-16).
 */

// De kaart verschuift nooit verder dan WARP_CAP_CELLS; één cel extra voor het bilineair lezen.
const PATCH_RADIUS = WARP_CAP_CELLS + 2
const PATCH_SIZE = 2 * PATCH_RADIUS + 1
const NO_DATA = 255

/** Een klein stuk frame rond de plek: genoeg om elke verschuiving van de kaart te volgen. */
export interface RainPatch {
  /** Celcoördinaat van de plek (celmiddens op .5, zoals in de shader). */
  cellX: number
  cellY: number
  originColumn: number
  originRow: number
  bytes: Uint8Array
  quant: Array<number | null>
  gridWidth: number
  gridHeight: number
}

export function rainPatch(header: MrfHeader, decoded: Uint8Array, projectedX: number, projectedY: number): RainPatch {
  const { grid } = header
  const cellX = (projectedX - grid.x0) / grid.dx
  const cellY = (projectedY - grid.y0) / grid.dy
  const originColumn = Math.floor(cellX) - PATCH_RADIUS
  const originRow = Math.floor(cellY) - PATCH_RADIUS
  const bytes = new Uint8Array(PATCH_SIZE * PATCH_SIZE).fill(NO_DATA)
  for (let row = 0; row < PATCH_SIZE; row++) {
    const sourceRow = originRow + row
    if (sourceRow < 0 || sourceRow >= grid.height) continue
    for (let column = 0; column < PATCH_SIZE; column++) {
      const sourceColumn = originColumn + column
      if (sourceColumn < 0 || sourceColumn >= grid.width) continue
      bytes[row * PATCH_SIZE + column] = decoded[sourceRow * grid.width + sourceColumn]!
    }
  }
  return { cellX, cellY, originColumn, originRow, bytes, quant: header.quant, gridWidth: grid.width, gridHeight: grid.height }
}

/** Snelheid in cellen per minuut op de plek, bilineair zoals de motiontextuur; ongeldig als een buurblok geen vector heeft. */
export function motionAtPatch(motion: MotionField, patch: RainPatch): { x: number; y: number } | null {
  const signed = new Int8Array(motion.vectors.buffer, motion.vectors.byteOffset, motion.vectors.byteLength)
  const blockX = patch.cellX / patch.gridWidth * motion.width - 0.5
  const blockY = patch.cellY / patch.gridHeight * motion.height - 0.5
  const lowerX = Math.floor(blockX)
  const lowerY = Math.floor(blockY)
  const weightX = blockX - lowerX
  const weightY = blockY - lowerY
  let x = 0
  let y = 0
  for (const [offsetX, offsetY, weight] of [[0, 0, (1 - weightX) * (1 - weightY)], [1, 0, weightX * (1 - weightY)], [0, 1, (1 - weightX) * weightY], [1, 1, weightX * weightY]] as const) {
    if (weight <= 0) continue
    const column = Math.min(motion.width - 1, Math.max(0, lowerX + offsetX))
    const row = Math.min(motion.height - 1, Math.max(0, lowerY + offsetY))
    const index = (row * motion.width + column) * 2
    if (signed[index] === -128 || signed[index + 1] === -128) return null
    x += signed[index]! * 0.1 * weight
    y += signed[index + 1]! * 0.1 * weight
  }
  return { x, y }
}

/** Bilineair gelezen byte (0–254) op een celcoördinaat; 0 waar een buurcel geen data heeft, zoals in de shader. */
function patchByte(patch: RainPatch, cellX: number, cellY: number): number {
  if (cellX < 0.5 || cellY < 0.5 || cellX > patch.gridWidth - 0.5 || cellY > patch.gridHeight - 0.5) return 0
  const column = cellX - 0.5 - patch.originColumn
  const row = cellY - 0.5 - patch.originRow
  const lowerColumn = Math.max(0, Math.min(PATCH_SIZE - 2, Math.floor(column)))
  const lowerRow = Math.max(0, Math.min(PATCH_SIZE - 2, Math.floor(row)))
  const weightX = column - lowerColumn
  const weightY = row - lowerRow
  const at = (offsetColumn: number, offsetRow: number) => patch.bytes[(lowerRow + offsetRow) * PATCH_SIZE + lowerColumn + offsetColumn]!
  const corners = [at(0, 0), at(1, 0), at(0, 1), at(1, 1)]
  if (corners.some((value) => value === NO_DATA)) return 0
  const top = corners[0]! + (corners[1]! - corners[0]!) * weightX
  const bottom = corners[2]! + (corners[3]! - corners[2]!) * weightX
  return top + (bottom - top) * weightY
}

/** Byte met breuk naar mm/u via de kwantisatietabel, lineair tussen de twee buren. */
function rateOfByte(quant: Array<number | null>, byte: number): number {
  const lower = Math.floor(byte)
  const lowerRate = quant[lower] ?? 0
  if (lower === byte) return lowerRate
  const upperRate = quant[lower + 1] ?? lowerRate
  return lowerRate + (upperRate - lowerRate) * (byte - lower)
}

/** Regen in mm/u op `weight` (0–1) tussen het linker en rechter frame, met de beweging die de kaart gebruikt. */
export function rainBetween(left: RainPatch, right: RainPatch, motion: MotionField | undefined, intervalMinutes: number, weight: number): number {
  const velocity = motion ? motionAtPatch(motion, left) : null
  let shiftX = 0
  let shiftY = 0
  if (velocity) {
    const strength = motionWarpStrength(Math.hypot(velocity.x, velocity.y) * intervalMinutes)
    shiftX = velocity.x * intervalMinutes * strength
    shiftY = velocity.y * intervalMinutes * strength
  }
  const leftByte = patchByte(left, left.cellX - shiftX * weight, left.cellY - shiftY * weight)
  const rightByte = patchByte(right, right.cellX + shiftX * (1 - weight), right.cellY + shiftY * (1 - weight))
  return rateOfByte(left.quant, leftByte + (rightByte - leftByte) * weight)
}
