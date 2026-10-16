// Vector: één instanced quad per segment, in schermpixels verbreed; de fragmentshader rekent de
// afstand tot het segment (capsule: ronde koppen), dus naden tussen segmenten zijn naadloos
// onder MAX-blending.
export function isolineLineVertex(declarations = '', position = 'p'): string {
  return `#version 300 es
precision highp float;
${declarations}
in vec2 a_corner;
in vec4 a_segment;
in vec2 a_alpha;
uniform mat4 u_matrix;
uniform vec2 u_viewport;
uniform float u_extent;
flat out vec2 v_a;
flat out vec2 v_b;
flat out vec2 v_alpha;
out vec2 v_px;
vec2 toPx(vec2 p) {
  vec4 clip = u_matrix * vec4(${position}, 0.0, 1.0);
  return (clip.xy / clip.w * 0.5 + 0.5) * u_viewport;
}
void main() {
  vec2 a = toPx(a_segment.xy), b = toPx(a_segment.zw);
  vec2 d = b - a;
  float len = length(d);
  vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x);
  vec2 p = mix(a - dir * u_extent, b + dir * u_extent, a_corner.x) + normal * u_extent * a_corner.y;
  v_a = a; v_b = b; v_alpha = a_alpha; v_px = p;
  gl_Position = vec4(p / u_viewport * 2.0 - 1.0, 0.0, 1.0);
}`
}

export const isolineLineFragment = `#version 300 es
precision highp float;
uniform float u_half_width;
uniform float u_line_alpha;
uniform vec3 u_color;
flat in vec2 v_a;
flat in vec2 v_b;
flat in vec2 v_alpha;
in vec2 v_px;
out vec4 color;
void main() {
  vec2 ab = v_b - v_a;
  float t = clamp(dot(v_px - v_a, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
  float d = length(v_px - (v_a + ab * t));
  float line = clamp(u_half_width + 0.5 - d, 0.0, 1.0) * u_line_alpha * mix(v_alpha.x, v_alpha.y, t);
  if (line <= 0.0) discard;
  color = vec4(u_color * line, line);
}`

/** 4×4 kolom-major a·b in float64 (de kaartmatrix is Float64Array). */
export function multiply(a: ArrayLike<number>, b: ArrayLike<number>): Float32Array {
  const out = new Float32Array(16)
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row]! * b[column * 4 + k]!
      out[column * 4 + row] = sum
    }
  }
  return out
}

