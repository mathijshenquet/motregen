import { CLOUD_FLOW_HOURS, CLOUD_FLOW_STEPS } from './cloud-map'

const cloudFlowSampling = `vec2 wind(vec2 uv, float age) {
  // Older travel holds the wind one hour before the cursor, continuously across hour boundaries.
  float time = max(0.0, u_time - min(age, 1.0));
  return textureLod(u_cloud_flow, vec3(uv, (time + 0.5) / u_depth), 0.0).rg / u_grid_size;
}

vec2 backtrace(vec2 uv, float hours) {
  float dt = hours / float(${CLOUD_FLOW_STEPS});
  vec2 at = uv;
  for (int step = 0; step < ${CLOUD_FLOW_STEPS}; step++) {
    float age = float(step) * dt;
    vec2 midpoint = at - wind(at, age) * (0.5 * dt);
    at -= wind(midpoint, age + 0.5 * dt) * dt;
  }
  return at;
}`

export function cloudFlowFragment(sampling: string): string {
  return `#version 300 es
${sampling}
uniform sampler3D u_cloud_flow;
uniform float u_cloud_phase;
${cloudFlowSampling}
void main() {
  float ageB = mod(u_cloud_phase + ${(CLOUD_FLOW_HOURS / 2).toFixed(2)}, ${CLOUD_FLOW_HOURS.toFixed(2)});
  color = vec4(backtrace(v_uv, u_cloud_phase) - v_uv, backtrace(v_uv, ageB) - v_uv);
}`
}

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
uniform sampler3D u_cloud_flow;
uniform float u_cloud_phase;
uniform highp sampler2D u_cloud_travel;
uniform vec2 u_cloud_fill_size;
uniform float u_cloud_cached;

vec4 cloudTravel() {
  vec2 size = vec2(textureSize(u_cloud_travel, 0));
  vec2 at = gl_FragCoord.xy / u_cloud_fill_size * size - 0.5;
  ivec2 cell = ivec2(floor(at));
  vec2 f = fract(at);
  // RGBA32F preserves fine detail when zoomed in; interpolate without float-linear extensions.
  return mix(mix(texelFetch(u_cloud_travel, cell, 0), texelFetch(u_cloud_travel, cell + ivec2(1, 0), 0), f.x),
             mix(texelFetch(u_cloud_travel, cell + ivec2(0, 1), 0), texelFetch(u_cloud_travel, cell + ivec2(1, 1), 0), f.x), f.y);
}

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

float cloudCells(vec2 p) {
  vec2 cell = floor(p), f = fract(p);
  float nearest = 2.0;
  for (int y = -1; y <= 1; y++) for (int x = -1; x <= 1; x++) {
    vec2 offset = vec2(x, y);
    vec2 center = vec2(hash(cell + offset), hash(cell + offset + 31.7));
    float radius = mix(0.35, 0.8, hash(cell + offset + 71.3));
    nearest = min(nearest, length(offset + center - f) / radius);
  }
  return 1.0 - smoothstep(0.1, 1.0, nearest);
}

float cloudTexture(vec2 p) {
  float detail = cloudNoise(p * 2.3);
  float large = cloudCells(p * 0.65);
  float small = cloudCells(p * 2.0 + 42.1);
  float puffs = clamp(large + (small - 0.5) * 0.3, 0.0, 1.0);
  float sheet = cloudNoise(p * 0.23 + 5.7);
  float region = smoothstep(0.25, 0.75, noise(p * 0.11 - 8.3));
  return mix(detail, mix(sheet, puffs, region), 0.7);
}

vec3 cloudBodies(vec2 p, vec3 weights) {
  float low = weights.x > 0.0 ? cloudTexture(p) : 0.0;
  float middle = weights.y > 0.0 ? mix(cloudNoise(p * 0.38 + 27.3), cloudNoise(p * 1.6), 0.3) : 0.0;
  vec2 streak = p * vec2(0.22, 2.8);
  float high = weights.z > 0.0 ? mix(cloudNoise(streak), cloudNoise(streak * 2.7 + 15.4), 0.25) : 0.0;
  return vec3(low, middle, high);
}

${cloudFlowSampling}
vec3 typeWeights(float shape) {
  float low = 1.0 - smoothstep(0.0, 0.55, shape);
  float high = smoothstep(0.55, 1.0, shape);
  return vec3(low, 1.0 - low - high, high);
}

float cloudOpacity(float body, float cover, float darkness, float veil) {
  float threshold = mix(0.84, 0.16, cover);
  float mask = smoothstep(threshold - 0.055, threshold + 0.055, body);
  mask *= smoothstep(0.0, 0.06, cover);
  mask = mix(mask, 1.0, smoothstep(0.9, 1.0, cover));
  return mask * mix(0.32, 0.60, darkness) * veil * (0.8 + body * 0.4)
       * mix(1.0, 0.65, u_cloud_night);
}

vec4 transportedCloud(vec2 foot, float cover, float darkness, vec3 weights) {
  vec2 p = (u_cloud_origin + foot * u_cloud_extent - vec2(500000, 6800000)) / 10000.0;
  vec2 warp = vec2(noise(p * 0.55 + 9.1), noise(p * 0.55 - 12.7)) - 0.5;
  p = mat2(0.94, -0.34, 0.34, 0.94) * (p + warp * 0.6);
  // Each type has its own fixed coordinates. Mix optical depths, never the coordinate scales.
  vec3 bodies = cloudBodies(p, weights);
  vec3 relief = clamp((bodies - cloudBodies(p + vec2(-0.12, 0.18), weights)) * 0.22, vec3(-0.05), vec3(0.05));
  vec3 opacity = vec3(cloudOpacity(bodies.x, cover, darkness, 1.0),
                      cloudOpacity(bodies.y, cover, darkness, 1.0),
                      cloudOpacity(bodies.z, cover, darkness, 0.7));
  // Model cover already controls density; surface-wind convergence cannot supply cloud mass.
  float depth = dot(-log(max(vec3(0.001), 1.0 - opacity)), weights);
  float light = dot(relief + (bodies - 0.5) * 0.12, weights);
  vec3 day = mix(vec3(0.95, 0.97, 0.98), vec3(0.42, 0.49, 0.55), darkness);
  vec3 night = mix(vec3(0.42, 0.51, 0.59), vec3(0.25, 0.32, 0.39), darkness);
  return vec4(mix(day, night, u_cloud_night) + light, depth);
}

void main() {
  // Border taps may fall outside the rendered quad or viewport; trace those pixels directly.
  vec2 margin = (abs(dFdx(v_uv)) + abs(dFdy(v_uv))) * 8.0;
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
    if (u_cloud_sample > 3.5) {
      cover = 0.65;
      shape = smoothstep(0.3, 0.55, v_uv.x + 0.05 * sin(v_uv.y * 14.0));
      darkness = mix(0.6, 0.1, shape);
    }
  }
  if (cover == 0.0 || valid == 0.0) { color = vec4(0.0); return; }
  float ageA = u_cloud_phase;
  float ageB = mod(ageA + ${(CLOUD_FLOW_HOURS / 2).toFixed(2)}, ${CLOUD_FLOW_HOURS.toFixed(2)});
  float weightA = pow(sin(ageA * 3.14159265359 / ${CLOUD_FLOW_HOURS.toFixed(2)}), 2.0);
  vec2 pixel = gl_FragCoord.xy;
  bool interior = all(greaterThan(v_uv, margin)) && all(lessThan(v_uv, 1.0 - margin))
               && all(greaterThan(pixel, vec2(8.0))) && all(lessThan(pixel, u_cloud_fill_size - 8.0));
  vec2 footA, footB;
  if (u_cloud_cached > 0.5 && interior) {
    vec4 travel = cloudTravel();
    footA = v_uv + travel.xy;
    footB = v_uv + travel.zw;
  } else {
    footA = backtrace(v_uv, ageA);
    footB = backtrace(v_uv, ageB);
  }
  vec3 weights = typeWeights(shape);
  vec4 cloudA = transportedCloud(footA, cover, darkness, weights);
  vec4 cloudB = transportedCloud(footB, cover, darkness, weights);
  // Two overlapping lifetimes renew the detail at zero weight; seeking depends only on model time.
  float opacity = (1.0 - exp(-mix(cloudB.a, cloudA.a, weightA))) * valid;
  vec3 cloud = mix(cloudB.rgb, cloudA.rgb, weightA);
  float shadow = cover * darkness * mix(0.15, 0.08, u_cloud_night) * valid;
  color = vec4(cloud * opacity + vec3(0.22, 0.29, 0.36) * shadow * (1.0 - opacity),
               opacity + shadow * (1.0 - opacity));
}`
}
