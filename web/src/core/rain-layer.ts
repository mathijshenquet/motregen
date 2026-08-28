import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl'
import { MercatorCoordinate } from 'maplibre-gl'
import type { Grid } from './contract'
import type { MotionField } from './mrf'

export const WARP_CAP_CELLS = 15
export const WARP_FADE_END_CELLS = 30
export const FLOW_BLEND_CURVE = 1

const vertexSource = `#version 300 es
in vec2 a_pos;
in vec2 a_uv;
uniform mat4 u_matrix;
out vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
}`

const fragmentSource = `#version 300 es
precision highp float;
uniform sampler2D u_left;
uniform sampler2D u_right;
uniform sampler2D u_lut;
uniform sampler2D u_motion;
uniform sampler2D u_motion_mask;
uniform float u_mix;
uniform float u_has_motion;
uniform float u_interval_minutes;
uniform vec2 u_grid_size;
in vec2 v_uv;
out vec4 color;

const float WARP_CAP_CELLS = ${WARP_CAP_CELLS.toFixed(1)};
const float WARP_FADE_END_CELLS = ${WARP_FADE_END_CELLS.toFixed(1)};
const float FLOW_BLEND_CURVE = ${FLOW_BLEND_CURVE.toFixed(1)};

float blendWeight(float value) {
  float clamped = clamp(value, 0.0, 1.0);
  float left = pow(1.0 - clamped, FLOW_BLEND_CURVE);
  float right = pow(clamped, FLOW_BLEND_CURVE);
  return right / max(left + right, 0.0001);
}

vec2 rainSample(sampler2D frame, vec2 uv) {
  vec2 halfTexel = 0.5 / u_grid_size;
  bool inside = all(greaterThanEqual(uv, halfTexel)) && all(lessThanEqual(uv, vec2(1.0) - halfTexel));
  vec2 sampleValue = texture(frame, clamp(uv, halfTexel, vec2(1.0) - halfTexel)).rg;
  return vec2(sampleValue.r, (inside ? 1.0 : 0.0) * step(0.999, sampleValue.g));
}

void main() {
  float weight = blendWeight(u_mix);
  vec2 velocity = (texture(u_motion, v_uv).rg * 255.0 - 128.0) * 0.1;
  float motionValid = step(0.999, texture(u_motion_mask, v_uv).r) * u_has_motion;
  float totalDisplacement = length(velocity) * u_interval_minutes;
  float capScale = min(1.0, WARP_CAP_CELLS / max(totalDisplacement, 0.0001));
  float crossfadeFallback = 1.0 - smoothstep(WARP_CAP_CELLS, WARP_FADE_END_CELLS, totalDisplacement);
  vec2 intervalUv = velocity * u_interval_minutes / u_grid_size;
  vec2 leftUv = v_uv - intervalUv * weight * capScale * crossfadeFallback * motionValid;
  vec2 rightUv = v_uv + intervalUv * (1.0 - weight) * capScale * crossfadeFallback * motionValid;
  vec2 left = rainSample(u_left, leftUv);
  vec2 right = rainSample(u_right, rightUv);
  float value = mix(left.r * left.g, right.r * right.g, weight);
  color = texture(u_lut, vec2(value, 0.5));
}`

const packedFrames = new WeakMap<Uint8Array, Uint8Array>()
const encodedMotion = new WeakMap<Uint8Array, { vectors: Uint8Array; mask: Uint8Array }>()

export class RainLayer implements CustomLayerInterface {
  readonly id = 'motregen-rain'
  readonly type = 'custom' as const
  readonly renderingMode = '2d' as const
  private gl?: WebGL2RenderingContext
  private program?: WebGLProgram
  private buffer?: WebGLBuffer
  private left?: WebGLTexture
  private right?: WebGLTexture
  private lut?: WebGLTexture
  private motion?: WebGLTexture
  private motionMask?: WebGLTexture
  private mix = 0
  private hasMotion = false
  private intervalMinutes = 0

  constructor(private readonly grid: Grid) {}

  onAdd(_map: MapLibreMap, context: WebGLRenderingContext | WebGL2RenderingContext): void {
    const gl = context as WebGL2RenderingContext
    this.gl = gl
    this.program = link(gl, vertexSource, fragmentSource)
    this.buffer = gl.createBuffer()!
    const west = this.grid.x0
    const east = west + this.grid.dx * this.grid.width
    const north = this.grid.y0
    const south = north + this.grid.dy * this.grid.height
    const nw = mercator(west, north), se = mercator(east, south)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([nw.x, nw.y, 0, 0, se.x, nw.y, 1, 0, nw.x, se.y, 0, 1, se.x, se.y, 1, 1]), gl.STATIC_DRAW)
    this.left = texture(gl)
    this.right = texture(gl)
    this.motion = texture(gl)
    this.motionMask = texture(gl)
    gl.activeTexture(gl.TEXTURE3)
    gl.bindTexture(gl.TEXTURE_2D, this.motion)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, 1, 1, 0, gl.RG, gl.UNSIGNED_BYTE, Uint8Array.from([128, 128]))
    gl.activeTexture(gl.TEXTURE4)
    gl.bindTexture(gl.TEXTURE_2D, this.motionMask)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 1, 1, 0, gl.RED, gl.UNSIGNED_BYTE, Uint8Array.of(0))
    const lut = texture(gl); this.lut = lut
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, lut)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, rainColormap())
  }

  setFrames(left: Uint8Array, right: Uint8Array, mix: number, motion?: MotionField, intervalMinutes = 0): void {
    if (!this.gl || !this.left || !this.right) return
    uploadRain(this.gl, this.left, this.grid, left)
    uploadRain(this.gl, this.right, this.grid, right)
    if (motion && this.motion && this.motionMask) uploadMotion(this.gl, this.motion, this.motionMask, motion)
    this.mix = mix
    this.hasMotion = motion !== undefined
    this.intervalMinutes = intervalMinutes
  }

  render(context: WebGLRenderingContext | WebGL2RenderingContext, options: CustomRenderMethodInput): void {
    const gl = context as WebGL2RenderingContext
    if (!this.program || !this.buffer) return
    gl.useProgram(this.program)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    const position = gl.getAttribLocation(this.program, 'a_pos')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0)
    const uv = gl.getAttribLocation(this.program, 'a_uv')
    gl.enableVertexAttribArray(uv)
    gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8)
    gl.uniformMatrix4fv(gl.getUniformLocation(this.program, 'u_matrix'), false, options.defaultProjectionData.mainMatrix)
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_mix'), this.mix)
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_has_motion'), this.hasMotion ? 1 : 0)
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_interval_minutes'), this.intervalMinutes)
    gl.uniform2f(gl.getUniformLocation(this.program, 'u_grid_size'), this.grid.width, this.grid.height)
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.left!); gl.uniform1i(gl.getUniformLocation(this.program, 'u_left'), 0)
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.right!); gl.uniform1i(gl.getUniformLocation(this.program, 'u_right'), 1)
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.lut!); gl.uniform1i(gl.getUniformLocation(this.program, 'u_lut'), 2)
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.motion!); gl.uniform1i(gl.getUniformLocation(this.program, 'u_motion'), 3)
    gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.motionMask!); gl.uniform1i(gl.getUniformLocation(this.program, 'u_motion_mask'), 4)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }
}

function mercator(x: number, y: number): MercatorCoordinate {
  const lng = x / 6378137 * 180 / Math.PI
  const lat = (2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * 180 / Math.PI
  return MercatorCoordinate.fromLngLat({ lng, lat })
}

function texture(gl: WebGL2RenderingContext): WebGLTexture {
  const value = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, value)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return value
}

function uploadRain(gl: WebGL2RenderingContext, target: WebGLTexture, grid: Grid, data: Uint8Array): void {
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, target)
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
  let packed = packedFrames.get(data)
  if (!packed) {
    packed = packRainTexture(data)
    packedFrames.set(data, packed)
  }
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, grid.width, grid.height, 0, gl.RG, gl.UNSIGNED_BYTE, packed)
}

function uploadMotion(gl: WebGL2RenderingContext, target: WebGLTexture, maskTarget: WebGLTexture, motion: MotionField): void {
  const encoded = encodeMotionTexture(motion)
  gl.activeTexture(gl.TEXTURE3)
  gl.bindTexture(gl.TEXTURE_2D, target)
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, motion.width, motion.height, 0, gl.RG, gl.UNSIGNED_BYTE, encoded.vectors)
  gl.activeTexture(gl.TEXTURE4)
  gl.bindTexture(gl.TEXTURE_2D, maskTarget)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, motion.width, motion.height, 0, gl.RED, gl.UNSIGNED_BYTE, encoded.mask)
}

function link(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source); gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'Shaderfout')
    return shader
  }
  const program = gl.createProgram()!
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex)); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment)); gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Shader-linkfout')
  return program
}

export function rainColormap(): Uint8Array {
  const stops = [[0, 54, 183, 255], [55, 54, 183, 255], [105, 31, 231, 190], [150, 255, 222, 44], [195, 255, 82, 35], [235, 188, 45, 214], [255, 188, 45, 214]]
  const lut = new Uint8Array(256 * 4)
  for (let value = 0; value < 255; value++) {
    let stop = 1; while (value > stops[stop]![0]) stop++
    const a = stops[stop - 1]!, b = stops[stop]!, mix = (value - a[0]!) / (b[0]! - a[0]!)
    for (let channel = 1; channel < 4; channel++) lut[value * 4 + channel - 1] = Math.round(a[channel]! + (b[channel]! - a[channel]!) * mix)
    lut[value * 4 + 3] = Math.min(210, Math.round(value * 1.6))
  }
  return lut
}

export function neutralizeNoData(data: Uint8Array): Uint8Array {
  if (!data.includes(255)) return data
  const normalized = data.slice()
  for (let index = 0; index < normalized.length; index++) if (normalized[index] === 255) normalized[index] = 0
  return normalized
}

export function packRainTexture(data: Uint8Array): Uint8Array {
  const packed = new Uint8Array(data.length * 2)
  for (let index = 0; index < data.length; index++) {
    const valid = data[index] !== 255
    packed[index * 2] = valid ? data[index]! : 0
    packed[index * 2 + 1] = valid ? 255 : 0
  }
  return packed
}

export function encodeMotionTexture(motion: MotionField): { vectors: Uint8Array; mask: Uint8Array } {
  if (motion.vectors.length !== motion.width * motion.height * 2) throw new Error('Ongeldige motion-annexlengte')
  let encoded = encodedMotion.get(motion.vectors)
  if (encoded) return encoded
  const signed = new Int8Array(motion.vectors.buffer, motion.vectors.byteOffset, motion.vectors.byteLength)
  const vectors = new Uint8Array(motion.vectors.length)
  const mask = new Uint8Array(motion.width * motion.height)
  for (let index = 0; index < mask.length; index++) {
    const u = signed[index * 2]!, v = signed[index * 2 + 1]!
    const valid = u !== -128 && v !== -128
    vectors[index * 2] = valid ? u + 128 : 128
    vectors[index * 2 + 1] = valid ? v + 128 : 128
    mask[index] = valid ? 255 : 0
  }
  encoded = { vectors, mask }
  encodedMotion.set(motion.vectors, encoded)
  return encoded
}

export function motionWarpStrength(totalDisplacement: number): number {
  const capScale = Math.min(1, WARP_CAP_CELLS / Math.max(totalDisplacement, 0.0001))
  const position = Math.max(0, Math.min(1, (totalDisplacement - WARP_CAP_CELLS) / (WARP_FADE_END_CELLS - WARP_CAP_CELLS)))
  const fallback = 1 - position * position * (3 - 2 * position)
  return capScale * fallback
}
