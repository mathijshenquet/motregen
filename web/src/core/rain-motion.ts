export const WARP_CAP_CELLS = 15
export const WARP_FADE_END_CELLS = 30
export const FLOW_BLEND_CURVE = 1

export function motionWarpStrength(totalDisplacement: number): number {
  const capScale = Math.min(1, WARP_CAP_CELLS / Math.max(totalDisplacement, 0.0001))
  const position = Math.max(0, Math.min(1, (totalDisplacement - WARP_CAP_CELLS) / (WARP_FADE_END_CELLS - WARP_CAP_CELLS)))
  const fallback = 1 - position * position * (3 - 2 * position)
  return capScale * fallback
}
