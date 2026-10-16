export const WARP_CAP_CELLS = 15
export const WARP_FADE_END_CELLS = 30
export const FLOW_BLEND_CURVE = 1

export const rainMotionShader = `
uniform sampler2D u_motion;
uniform sampler2D u_motion_mask;
uniform float u_has_motion;
uniform float u_interval_minutes;
uniform vec2 u_grid_size;
uniform float u_warp_cap_cells;
uniform float u_warp_fade_end_cells;

float blendWeight(float value) {
  float clamped = clamp(value, 0.0, 1.0);
  float left = pow(1.0 - clamped, ${FLOW_BLEND_CURVE.toFixed(1)});
  float right = pow(clamped, ${FLOW_BLEND_CURVE.toFixed(1)});
  return right / max(left + right, 0.0001);
}

vec2 rainDisplacement(vec2 uv) {
  vec2 velocity = (texture(u_motion, uv).rg * 255.0 - 128.0) * 0.1;
  float motionValid = step(0.999, texture(u_motion_mask, uv).r) * u_has_motion;
  float totalDisplacement = length(velocity) * u_interval_minutes;
  float capScale = min(1.0, u_warp_cap_cells / max(totalDisplacement, 0.0001));
  float crossfadeFallback = 1.0 - smoothstep(u_warp_cap_cells, u_warp_fade_end_cells, totalDisplacement);
  return velocity * u_interval_minutes * capScale * crossfadeFallback * motionValid;
}`

export function motionWarpStrength(totalDisplacement: number): number {
  const capScale = Math.min(1, WARP_CAP_CELLS / Math.max(totalDisplacement, 0.0001))
  const position = Math.max(0, Math.min(1, (totalDisplacement - WARP_CAP_CELLS) / (WARP_FADE_END_CELLS - WARP_CAP_CELLS)))
  const fallback = 1 - position * position * (3 - 2 * position)
  return capScale * fallback
}
