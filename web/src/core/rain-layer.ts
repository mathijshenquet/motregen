import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl'
import { MercatorCoordinate } from 'maplibre-gl'
import type { Grid } from './contract'
import type { MotionField } from './mrf'
import { measurePerfPhase } from './perf'
import { rainColormap } from './rain-chart'

export { rainColormap }

export const WARP_CAP_CELLS = 15
export const WARP_FADE_END_CELLS = 30
export const FLOW_BLEND_CURVE = 1

/**
 * Hoe een frame tussen de cellen wordt ingevuld. `bilinear` is het product; de rest is de U72-proef.
 * De `source-`kernen wegen broncellen (de blokken die de dichtste-buur-regrid van de ingest achterlaat)
 * in plaats van rastercellen, zodat dezelfde stand op het grove HARMONIE-raster evenveel gladstrijkt.
 */
export type RainKernel = 'nearest' | 'bilinear' | 'source-linear' | 'source-cubic' | 'source-blur-3' | 'source-blur-5'

export interface RainSampling {
  kernel: RainKernel
  /** Breedte van één broncel in rastercellen; alleen de `source-`kernen gebruiken hem. */
  sourceCellWidth: number
}

export interface RainTimeBlend {
  /** De menging tussen twee frames loopt met een S-curve in plaats van lineair. */
  eased: boolean
  warpCapCells: number
  warpFadeEndCells: number
}

const KERNEL_IDS: Record<RainKernel, number> = { 'nearest': 0, 'bilinear': 1, 'source-linear': 2, 'source-cubic': 3, 'source-blur-3': 4, 'source-blur-5': 5 }
const DEFAULT_SAMPLING: RainSampling = { kernel: 'bilinear', sourceCellWidth: 1 }
const DEFAULT_TIME_BLEND: RainTimeBlend = { eased: false, warpCapCells: WARP_CAP_CELLS, warpFadeEndCells: WARP_FADE_END_CELLS }

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
uniform float u_opacity;
uniform float u_saturation;
uniform float u_brightness;
uniform float u_has_motion;
uniform float u_interval_minutes;
uniform vec2 u_grid_size;
uniform int u_left_kernel;
uniform int u_right_kernel;
uniform float u_left_source_cell;
uniform float u_right_source_cell;
uniform float u_blend_eased;
uniform float u_warp_cap_cells;
uniform float u_warp_fade_end_cells;
in vec2 v_uv;
out vec4 color;

const int KERNEL_NEAREST = ${KERNEL_IDS['nearest']};
const int KERNEL_BILINEAR = ${KERNEL_IDS['bilinear']};
const int KERNEL_SOURCE_LINEAR = ${KERNEL_IDS['source-linear']};
const int KERNEL_SOURCE_CUBIC = ${KERNEL_IDS['source-cubic']};
const int KERNEL_SOURCE_BLUR_3 = ${KERNEL_IDS['source-blur-3']};
const float FLOW_BLEND_CURVE = ${FLOW_BLEND_CURVE.toFixed(1)};

float blendWeight(float value) {
  float clamped = clamp(value, 0.0, 1.0);
  clamped = mix(clamped, smoothstep(0.0, 1.0, clamped), u_blend_eased);
  float left = pow(1.0 - clamped, FLOW_BLEND_CURVE);
  float right = pow(clamped, FLOW_BLEND_CURVE);
  return right / max(left + right, 0.0001);
}

// Het frame staat als ruwe bytes in een R8-textuur (255 = geen data). De shader mengt de vier
// buurcellen zelf: zo is er geen tweede kanaal voor geldigheid nodig en hoeft de hoofddraad het
// frame niet meer in te pakken en dubbel zo groot te uploaden. Eén buur zonder data maakt het
// punt ongeldig, precies wat de geldigheid in het G-kanaal onder lineair filteren deed.
vec2 rainSample(sampler2D frame, vec2 uv) {
  vec2 halfTexel = 0.5 / u_grid_size;
  bool inside = all(greaterThanEqual(uv, halfTexel)) && all(lessThanEqual(uv, vec2(1.0) - halfTexel));
  vec2 cell = clamp(uv, halfTexel, vec2(1.0) - halfTexel) * u_grid_size - 0.5;
  ivec2 lower = ivec2(floor(cell));
  ivec2 upper = min(lower + 1, ivec2(u_grid_size) - 1);
  vec2 weight = cell - vec2(lower);
  float northWest = texelFetch(frame, lower, 0).r;
  float northEast = texelFetch(frame, ivec2(upper.x, lower.y), 0).r;
  float southWest = texelFetch(frame, ivec2(lower.x, upper.y), 0).r;
  float southEast = texelFetch(frame, upper, 0).r;
  float valid = 1.0 - step(0.999, max(max(northWest, northEast), max(southWest, southEast)));
  float value = mix(mix(northWest, northEast, weight.x), mix(southWest, southEast, weight.x), weight.y);
  return vec2(value, (inside ? 1.0 : 0.0) * valid);
}

vec2 nearestSample(sampler2D frame, vec2 uv) {
  bool inside = all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)));
  ivec2 cell = clamp(ivec2(floor(uv * u_grid_size)), ivec2(0), ivec2(u_grid_size) - 1);
  float value = texelFetch(frame, cell, 0).r;
  return vec2(value, (inside ? 1.0 : 0.0) * (1.0 - step(0.999, value)));
}

int kernelTaps(int kernel) {
  if (kernel == KERNEL_SOURCE_LINEAR) return 2;
  if (kernel == KERNEL_SOURCE_CUBIC) return 4;
  return kernel == KERNEL_SOURCE_BLUR_3 ? 3 : 5;
}

float kernelWeight(int kernel, float signedDistance) {
  float distance = abs(signedDistance);
  if (kernel == KERNEL_SOURCE_LINEAR) return max(0.0, 1.0 - distance);
  if (kernel == KERNEL_SOURCE_CUBIC) {
    // Catmull-Rom: gaat door de bronwaarden zelf, dus maakt glad zonder te vervagen.
    if (distance < 1.0) return 1.5 * distance * distance * distance - 2.5 * distance * distance + 1.0;
    if (distance < 2.0) return -0.5 * distance * distance * distance + 2.5 * distance * distance - 4.0 * distance + 2.0;
    return 0.0;
  }
  // Klokvorm die op de rand van het venster nul is: een tap die erbij komt of wegvalt geeft dan geen sprong.
  float radius = float(kernelTaps(kernel)) * 0.5;
  float falloff = max(0.0, 1.0 - (distance * distance) / (radius * radius));
  return falloff * falloff;
}

// Weegt broncellen in plaats van rastercellen. De knopen liggen op een rooster met de maat van één broncel
// en lezen elk één rastercel: binnen een roostervak liggen ze vast, dus dichtste-buur volstaat en de stand
// "bronlineair" kost evenveel texels als het bilineaire product.
vec2 sourceSample(sampler2D frame, vec2 uv, int kernel, float sourceCell) {
  bool inside = all(greaterThanEqual(uv, vec2(0.0))) && all(lessThanEqual(uv, vec2(1.0)));
  int taps = kernelTaps(kernel);
  bool evenTaps = taps % 2 == 0;
  vec2 position = uv * u_grid_size / sourceCell - 0.5;
  vec2 anchor = evenTaps ? floor(position) : floor(position + 0.5);
  int firstOffset = evenTaps ? 1 - taps / 2 : -(taps - 1) / 2;
  float weightedValue = 0.0;
  float validWeight = 0.0;
  float totalWeight = 0.0;
  for (int row = 0; row < taps; row++) {
    for (int column = 0; column < taps; column++) {
      vec2 node = anchor + vec2(float(firstOffset + column), float(firstOffset + row));
      float tapWeight = kernelWeight(kernel, node.x - position.x) * kernelWeight(kernel, node.y - position.y);
      ivec2 cell = clamp(ivec2(floor((node + 0.5) * sourceCell)), ivec2(0), ivec2(u_grid_size) - 1);
      float tapValue = texelFetch(frame, cell, 0).r;
      float tapValid = 1.0 - step(0.999, tapValue);
      weightedValue += tapWeight * tapValue * tapValid;
      validWeight += tapWeight * tapValid;
      totalWeight += tapWeight;
    }
  }
  // De kubische kern schiet bij een scherpe rand door; onder nul en boven de hoogste geldige byte bestaat niet.
  float value = clamp(weightedValue / max(validWeight, 0.0001), 0.0, 254.0 / 255.0);
  float valid = step(0.5, validWeight / max(totalWeight, 0.0001));
  return vec2(value, (inside ? 1.0 : 0.0) * valid);
}

vec2 kernelSample(sampler2D frame, vec2 uv, int kernel, float sourceCell) {
  if (kernel == KERNEL_BILINEAR) return rainSample(frame, uv);
  if (kernel == KERNEL_NEAREST) return nearestSample(frame, uv);
  return sourceSample(frame, uv, kernel, sourceCell);
}

void main() {
  float weight = blendWeight(u_mix);
  vec2 velocity = (texture(u_motion, v_uv).rg * 255.0 - 128.0) * 0.1;
  float motionValid = step(0.999, texture(u_motion_mask, v_uv).r) * u_has_motion;
  float totalDisplacement = length(velocity) * u_interval_minutes;
  float capScale = min(1.0, u_warp_cap_cells / max(totalDisplacement, 0.0001));
  float crossfadeFallback = 1.0 - smoothstep(u_warp_cap_cells, u_warp_fade_end_cells, totalDisplacement);
  vec2 intervalUv = velocity * u_interval_minutes / u_grid_size;
  vec2 leftUv = v_uv - intervalUv * weight * capScale * crossfadeFallback * motionValid;
  vec2 rightUv = v_uv + intervalUv * (1.0 - weight) * capScale * crossfadeFallback * motionValid;
  vec2 left = kernelSample(u_left, leftUv, u_left_kernel, u_left_source_cell);
  vec2 right = kernelSample(u_right, rightUv, u_right_kernel, u_right_source_cell);
  float value = mix(left.r * left.g, right.r * right.g, weight);
  color = texture(u_lut, vec2(value, 0.5));
  // Toon (U62): rustiger maken zonder te verbleken. Minder verzadiging houdt de helderheid van de
  // kleur, minder helderheid houdt de tint; dimmen via alfa mengt met de kaart en maakt geel crème.
  float luma = dot(color.rgb, vec3(0.2126, 0.7152, 0.0722));
  color.rgb = mix(vec3(luma), color.rgb, u_saturation) * u_brightness;
  color.a *= u_opacity;
}`

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
  private leftData?: Uint8Array
  private rightData?: Uint8Array
  private motionData?: MotionField
  /** Texture-uploads (regenframes + motion); tijdens afspelen alleen bij een nieuw framepaar. */
  uploads = 0
  private mix = 0
  private opacity = 1
  private saturation = 1
  private brightness = 1
  private hasMotion = false
  private intervalMinutes = 0
  private leftSampling = DEFAULT_SAMPLING
  private rightSampling = DEFAULT_SAMPLING
  private timeBlend = DEFAULT_TIME_BLEND

  constructor(private readonly grid: Grid) {}

  onAdd(_map: MapLibreMap, context: WebGLRenderingContext | WebGL2RenderingContext): void {
    const gl = context as WebGL2RenderingContext
    this.gl = gl
    this.leftData = this.rightData = this.motionData = undefined
    this.program = link(gl, vertexSource, fragmentSource)
    this.buffer = gl.createBuffer()!
    const west = this.grid.x0
    const east = west + this.grid.dx * this.grid.width
    const north = this.grid.y0
    const south = north + this.grid.dy * this.grid.height
    const nw = mercator(west, north), se = mercator(east, south)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([nw.x, nw.y, 0, 0, se.x, nw.y, 1, 0, nw.x, se.y, 0, 1, se.x, se.y, 1, 1]), gl.STATIC_DRAW)
    this.left = texture(gl, gl.NEAREST)
    this.right = texture(gl, gl.NEAREST)
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
    // Afspelen zet dit op elke frame; een upload kost op Apple-GPU's een CPU-swizzle in het
    // GPU-proces (PO-profiel U8c), dus alleen uploaden wat echt nieuw is.
    const plan = planRainUploads({ left: this.leftData, right: this.rightData }, { left, right })
    if (plan.swap) {
      [this.left, this.right] = [this.right, this.left];
      [this.leftData, this.rightData] = [this.rightData, this.leftData]
    }
    const motionChanged = !!motion && motion !== this.motionData && !!this.motion && !!this.motionMask
    if (plan.left || plan.right || motionChanged) measurePerfPhase('texture-upload', () => {
      if (plan.left) { uploadRain(this.gl!, this.left!, this.grid, left); this.leftData = left; this.uploads++ }
      if (plan.right) { uploadRain(this.gl!, this.right!, this.grid, right); this.rightData = right; this.uploads++ }
      if (motionChanged) {
        uploadMotion(this.gl!, this.motion!, this.motionMask!, motion!)
        this.motionData = motion
        this.uploads++
      }
    }, { layer: 'rain', textures: Number(plan.left) + Number(plan.right) + Number(motionChanged) })
    this.mix = mix
    this.hasMotion = motion !== undefined
    this.intervalMinutes = intervalMinutes
  }

  /** Per frame, want een paar op de naad tussen twee bronnen heeft twee bronrasters. */
  setSampling(left: RainSampling, right: RainSampling): void {
    this.leftSampling = left
    this.rightSampling = right
  }

  setTimeBlend(timeBlend: RainTimeBlend): void {
    this.timeBlend = timeBlend
  }

  setOpacity(opacity: number): void {
    this.opacity = opacity
  }

  /** Verzadiging en helderheid van het regenpalet (1 = ongewijzigd). */
  setTone(saturation: number, brightness: number): void {
    this.saturation = saturation
    this.brightness = brightness
  }

  render(context: WebGLRenderingContext | WebGL2RenderingContext, options: CustomRenderMethodInput): void {
    const gl = context as WebGL2RenderingContext
    if (!this.program || !this.buffer || this.opacity <= 0) return
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
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_opacity'), this.opacity)
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_saturation'), this.saturation)
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_brightness'), this.brightness)
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_has_motion'), this.hasMotion ? 1 : 0)
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_interval_minutes'), this.intervalMinutes)
    gl.uniform2f(gl.getUniformLocation(this.program, 'u_grid_size'), this.grid.width, this.grid.height)
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_left_kernel'), KERNEL_IDS[this.leftSampling.kernel])
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_right_kernel'), KERNEL_IDS[this.rightSampling.kernel])
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_left_source_cell'), this.leftSampling.sourceCellWidth)
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_right_source_cell'), this.rightSampling.sourceCellWidth)
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_blend_eased'), this.timeBlend.eased ? 1 : 0)
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_warp_cap_cells'), this.timeBlend.warpCapCells)
    gl.uniform1f(gl.getUniformLocation(this.program, 'u_warp_fade_end_cells'), this.timeBlend.warpFadeEndCells)
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

/** Welke regentextures opnieuw moeten; `swap` als het nieuwe linkerframe het oude rechter is. */
export function planRainUploads<T>(current: { left?: T; right?: T }, next: { left: T; right: T }): { swap: boolean; left: boolean; right: boolean } {
  const swap = next.left !== current.left && next.left === current.right
  const left = swap ? current.right : current.left
  const right = swap ? current.left : current.right
  return { swap, left: next.left !== left, right: next.right !== right }
}

function mercator(x: number, y: number): MercatorCoordinate {
  const lng = x / 6378137 * 180 / Math.PI
  const lat = (2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * 180 / Math.PI
  return MercatorCoordinate.fromLngLat({ lng, lat })
}

function texture(gl: WebGL2RenderingContext, filter: number = gl.LINEAR): WebGLTexture {
  const value = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, value)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  return value
}

function uploadRain(gl: WebGL2RenderingContext, target: WebGLTexture, grid: Grid, data: Uint8Array): void {
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, target)
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, grid.width, grid.height, 0, gl.RED, gl.UNSIGNED_BYTE, data)
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

export function neutralizeNoData(data: Uint8Array): Uint8Array {
  if (!data.includes(255)) return data
  const normalized = data.slice()
  for (let index = 0; index < normalized.length; index++) if (normalized[index] === 255) normalized[index] = 0
  return normalized
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
