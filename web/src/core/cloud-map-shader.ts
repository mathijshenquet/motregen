export function cloudMapFragment(sampling: string): string {
  return `#version 300 es
${sampling}
uniform vec2 u_cloud_origin;
uniform vec2 u_cloud_extent;
uniform float u_cloud_enabled;
uniform float u_cloud_night;
uniform float u_cloud_sample;
uniform float u_fill_base;
uniform vec3 u_veil;

float hash(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

float noise(vec2 p) {
  vec2 cell = floor(p), f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(cell), hash(cell + vec2(1, 0)), f.x),
             mix(hash(cell + vec2(0, 1)), hash(cell + vec2(1, 1)), f.x), f.y);
}

float cloudNoise(vec2 p) {
  float value = 0.0;
  float weight = 0.55;
  mat2 turn = mat2(0.8, -0.6, 0.6, 0.8);
  for (int octave = 0; octave < 4; octave++) {
    value += weight * noise(p);
    p = turn * p * 2.03 + vec2(17.4, 8.2);
    weight *= 0.5;
  }
  return value / 1.03125;
}

void main() {
  vec4 field = sampleField(v_uv, u_time);
  float valid = smoothstep(0.3, 0.7, field.g);
  if (u_cloud_enabled < 0.5) {
    float opacity = u_fill_base * smoothstep(15.0, 95.0, field.r) * valid;
    color = vec4(u_veil * opacity, opacity);
    return;
  }
  float cover = clamp(field.r / 100.0, 0.0, 1.0);
  float shape = clamp(field.b, 0.0, 1.0);
  float darkness = clamp(field.a, 0.0, 1.0);
  if (u_cloud_sample > 0.5) {
    cover = u_cloud_sample < 1.5 ? 0.5 : 1.0;
    shape = u_cloud_sample < 1.5 ? 0.0 : u_cloud_sample < 2.5 ? 1.0 : 0.35;
    darkness = u_cloud_sample < 1.5 ? 0.45 : u_cloud_sample < 2.5 ? 0.1 : 0.85;
  }
  // World coordinates keep invented detail fixed during pan, zoom and time interpolation.
  vec2 p = (u_cloud_origin + v_uv * u_cloud_extent - vec2(500000, 6800000)) / 10000.0;
  vec2 warp = vec2(noise(p * 0.55 + 9.1), noise(p * 0.55 - 12.7)) - 0.5;
  p += warp * 1.2;
  float streaks = smoothstep(0.55, 0.95, shape);
  p = mat2(0.94, -0.34, 0.34, 0.94) * p;
  p *= mix(vec2(1.0, 1.0), vec2(0.22, 2.8), streaks);
  float body = cloudNoise(p);
  float threshold = mix(0.84, 0.16, cover);
  float mask = smoothstep(threshold - 0.055, threshold + 0.055, body);
  mask *= smoothstep(0.0, 0.06, cover);
  mask = mix(mask, 1.0, smoothstep(0.9, 1.0, cover));
  float relief = (noise(p + vec2(-0.2, 0.3)) - noise(p + vec2(0.2, -0.3))) * 0.14;
  vec3 day = mix(vec3(0.95, 0.97, 0.98), vec3(0.42, 0.49, 0.55), darkness);
  vec3 night = mix(vec3(0.42, 0.51, 0.59), vec3(0.25, 0.32, 0.39), darkness);
  vec3 cloud = mix(day, night, u_cloud_night) + relief + (body - 0.5) * 0.12;
  float opacity = mask * mix(0.32, 0.60, darkness) * mix(1.0, 0.7, streaks) * (0.8 + body * 0.4);
  opacity *= mix(1.0, 0.65, u_cloud_night) * valid;
  float shadow = cover * darkness * mix(0.15, 0.08, u_cloud_night) * valid;
  color = vec4(cloud * opacity + vec3(0.22, 0.29, 0.36) * shadow * (1.0 - opacity),
               opacity + shadow * (1.0 - opacity));
}`
}
