// Vector: één instanced quad per segment, in schermpixels verbreed; de fragmentshader rekent de
// afstand tot het segment (capsule: ronde koppen), dus naden tussen segmenten zijn naadloos
// onder MAX-blending.
export function isolineLineVertex(declarations = '', positionExpression = 'position'): string {
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
vec2 toPx(vec2 position) {
  vec4 clip = u_matrix * vec4(${positionExpression}, 0.0, 1.0);
  return (clip.xy / clip.w * 0.5 + 0.5) * u_viewport;
}
void main() {
  vec2 start = toPx(a_segment.xy);
  vec2 end = toPx(a_segment.zw);
  vec2 delta = end - start;
  float lengthPixels = length(delta);
  vec2 direction = lengthPixels > 1e-4 ? delta / lengthPixels : vec2(1.0, 0.0);
  vec2 normal = vec2(-direction.y, direction.x);
  vec2 position = mix(start - direction * u_extent, end + direction * u_extent, a_corner.x) + normal * u_extent * a_corner.y;
  v_a = start; v_b = end; v_alpha = a_alpha; v_px = position;
  gl_Position = vec4(position / u_viewport * 2.0 - 1.0, 0.0, 1.0);
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
  vec2 delta = v_b - v_a;
  float progress = clamp(dot(v_px - v_a, delta) / max(dot(delta, delta), 1e-8), 0.0, 1.0);
  float distancePixels = length(v_px - (v_a + delta * progress));
  float line = clamp(u_half_width + 0.5 - distancePixels, 0.0, 1.0) * u_line_alpha * mix(v_alpha.x, v_alpha.y, progress);
  if (line <= 0.0) discard;
  color = vec4(u_color * line, line);
}`

/** 4×4 kolom-major a·b in float64 (de kaartmatrix is Float64Array). */
export function multiply(left: ArrayLike<number>, right: ArrayLike<number>): Float32Array {
  const result = new Float32Array(16)
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0
      for (let component = 0; component < 4; component++) sum += left[component * 4 + row]! * right[column * 4 + component]!
      result[column * 4 + row] = sum
    }
  }
  return result
}

