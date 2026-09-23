import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl'
import { MercatorCoordinate } from 'maplibre-gl'
import type { Grid } from './contract'
import type { FrameWeight, ScalarField } from './isolines'

/** Eén frame, geblurd en met no-data opgevuld zodat de bicubische taps aan de rand niets vreemds zien. */
export interface PreparedField {
  values: Float32Array
  valid: Float32Array
}

const FILL_PASSES = 8
// Hoekbakken voor de richting-onafhankelijke stippel; zie de shader. Stippel i.p.v. streep:
// de basiskaart tekent provinciegrenzen al gestreept.
const DASH_BINS = 16
export const DASH_PERIOD_PX = 5
export const DASH_ON_PX = 2.4

export function prepareField(field: ScalarField): PreparedField {
  const { width, height } = field
  const values = Float32Array.from(field.values)
  const valid = new Float32Array(values.length)
  for (let index = 0; index < values.length; index++) valid[index] = Number.isNaN(values[index]!) ? 0 : 1
  for (let pass = 0; pass < FILL_PASSES; pass++) {
    const holes: Array<[number, number]> = []
    for (let row = 0; row < height; row++) {
      for (let column = 0; column < width; column++) {
        const index = row * width + column
        if (!Number.isNaN(values[index]!)) continue
        let sum = 0, count = 0
        const add = (neighbour: number) => { const value = values[neighbour]!; if (!Number.isNaN(value)) { sum += value; count++ } }
        if (column > 0) add(index - 1)
        if (column < width - 1) add(index + 1)
        if (row > 0) add(index - width)
        if (row < height - 1) add(index + width)
        if (count) holes.push([index, sum / count])
      }
    }
    if (!holes.length) break
    for (const [index, value] of holes) values[index] = value
  }
  for (let index = 0; index < values.length; index++) if (Number.isNaN(values[index]!)) values[index] = 0
  return { values, valid }
}

/** Interleaved (waarde, geldig) voor een RG16F-texture; `out` wordt hergebruikt. */
export function mixPreparedFields(fields: PreparedField[], weights: FrameWeight[], out: Float32Array): Float32Array {
  const cells = out.length / 2
  out.fill(0)
  weights.forEach(({ weight }, slot) => {
    const { values, valid } = fields[slot]!
    for (let index = 0; index < cells; index++) {
      out[index * 2] += values[index]! * weight
      out[index * 2 + 1] += valid[index]! * weight
    }
  })
  return out
}

const vertexSource = `#version 300 es
in vec2 a_pos;
in vec2 a_uv;
uniform mat4 u_matrix;
uniform vec2 u_origin;
uniform float u_world;
out vec2 v_uv;
out vec2 v_px;
void main() {
  v_uv = a_uv;
  v_px = (a_pos - u_origin) * u_world;
  gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
}`

const fragmentSource = `#version 300 es
precision highp float;
uniform sampler2D u_field;
uniform vec2 u_grid_size;
uniform float u_step;
uniform float u_half_width;
uniform float u_dashed;
uniform float u_dash_period;
uniform float u_dash_on;
uniform vec4 u_color;
in vec2 v_uv;
in vec2 v_px;
out vec4 color;

const float PI = 3.141592653589793;
const float BINS = ${DASH_BINS.toFixed(1)};

// Kubische B-spline met 4 bilineaire taps (GPU Gems 2, hfst. 20): C2 over celgrenzen, dus
// de isolijnen hebben geen knikjes waar het 6-km-rooster ze zou geven.
vec2 sampleField(vec2 uv) {
  vec2 coord = uv * u_grid_size - 0.5;
  vec2 cell = floor(coord);
  vec2 f = coord - cell;
  vec2 f2 = f * f, f3 = f2 * f;
  vec2 w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  vec2 w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  vec2 w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  vec2 w3 = f3 / 6.0;
  vec2 g0 = w0 + w1, g1 = w2 + w3;
  vec2 h0 = (cell - 0.5 + w1 / g0) / u_grid_size;
  vec2 h1 = (cell + 1.5 + w3 / g1) / u_grid_size;
  return g0.y * (g0.x * texture(u_field, vec2(h0.x, h0.y)).rg + g1.x * texture(u_field, vec2(h1.x, h0.y)).rg)
       + g1.y * (g0.x * texture(u_field, vec2(h0.x, h1.y)).rg + g1.x * texture(u_field, vec2(h1.x, h1.y)).rg);
}

// Symmetrisch rond 0 (dash(u) == dash(-u)), zodat de richtingsomslag bij 180° naadloos is.
float dash(float u) {
  float x = abs(fract(u / u_dash_period + 0.5) - 0.5) * u_dash_period;
  return clamp(u_dash_on * 0.5 + 0.5 - x, 0.0, 1.0);
}

void main() {
  vec2 field = sampleField(v_uv);
  float s = field.r / u_step;
  vec2 ds = vec2(dFdx(s), dFdy(s));
  vec2 pdx = dFdx(v_px), pdy = dFdy(v_px);
  float level = floor(s + 0.5);
  float distance = abs(s - level) / max(length(ds), 1e-6);
  float line = clamp(u_half_width + 0.5 - distance, 0.0, 1.0);
  // Een fragmentshader kent geen booglengte. Projectie op de raaklijn werkt voor rechte stukken
  // maar breekt bij kromming (|p| is groot); daarom projecteren we op een vaste richting per
  // hoekbak van 180°/16: binnen een bak wijkt de schaal < 2 % af, en tussen twee bakken
  // mengen we beide patronen zodat de fase nergens springt.
  vec2 tangent = pdx * -ds.y + pdy * ds.x;
  float bin = mod(atan(tangent.y, tangent.x), PI) / (PI / BINS);
  float b0 = floor(bin);
  float a0 = b0 * PI / BINS, a1 = (b0 + 1.0) * PI / BINS;
  float pattern = mix(dash(dot(v_px, vec2(cos(a0), sin(a0)))), dash(dot(v_px, vec2(cos(a1), sin(a1)))), bin - b0);
  float odd = step(0.5, mod(level * u_step + 0.25, 2.0));
  float alpha = line * mix(1.0, pattern, odd * u_dashed) * step(0.5, field.g);
  if (alpha <= 0.0) discard;
  color = vec4(u_color.rgb, u_color.a * alpha);
}`

export interface IsolineStyle {
  step: number
  dashed: boolean
  color: [number, number, number]
}

/**
 * Isolijnen per frame op de GPU: contouren uit het (temporeel en ruimtelijk gladde) veld in de
 * fragmentshader, dus elke scrubber-stap beweegt de lijnen continu in plaats van per
 * worker-ronde te verspringen. Even graden doorgetrokken, oneven gestreept.
 */
export class IsolineLayer implements CustomLayerInterface {
  readonly id = 'motregen-isolines'
  readonly type = 'custom' as const
  readonly renderingMode = '2d' as const
  private map?: MapLibreMap
  private gl?: WebGL2RenderingContext
  private program?: WebGLProgram
  private buffer?: WebGLBuffer
  private field?: WebGLTexture
  private hasField = false
  private opacity = 0

  constructor(private readonly grid: Grid, private style: IsolineStyle) {}

  onAdd(map: MapLibreMap, context: WebGLRenderingContext | WebGL2RenderingContext): void {
    const gl = context as WebGL2RenderingContext
    this.map = map
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
    const field = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, field)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    this.field = field
  }

  onRemove(): void {
    this.map = undefined
    this.gl = undefined
    this.hasField = false
  }

  /** `interleaved`: (waarde, geldig) per cel, zie `mixPreparedFields`. */
  setField(interleaved: Float32Array): void {
    const gl = this.gl
    if (!gl || !this.field) return
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.field)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4)
    // RG16F is in WebGL2 altijd lineair filterbaar (RG32F niet zonder extensie).
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, this.grid.width, this.grid.height, 0, gl.RG, gl.FLOAT, interleaved)
    this.hasField = true
    this.map?.triggerRepaint()
  }

  clearField(): void {
    this.hasField = false
  }

  setOpacity(opacity: number): void {
    this.opacity = opacity
  }

  setStyle(style: IsolineStyle): void {
    this.style = style
    this.map?.triggerRepaint()
  }

  render(context: WebGLRenderingContext | WebGL2RenderingContext, options: CustomRenderMethodInput): void {
    const gl = context as WebGL2RenderingContext
    const map = this.map

    if (!this.program || !this.buffer || !map || !this.hasField || this.opacity <= 0) return
    const ratio = window.devicePixelRatio || 1
    const zoom = map.getZoom()
    const world = 512 * 2 ** zoom * ratio
    // Oorsprong op een grof raster rond het midden: houdt v_px klein genoeg voor float32 en
    // verschuift het streeppatroon alleen bij een grote pan.
    const center = MercatorCoordinate.fromLngLat(map.getCenter())
    const cell = 4096 / world
    const origin = [Math.round(center.x / cell) * cell, Math.round(center.y / cell) * cell]
    const widthCss = zoom <= 5 ? 1.3 : zoom >= 9 ? 2 : 1.3 + (zoom - 5) * 0.175
    const program = this.program
    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    const position = gl.getAttribLocation(program, 'a_pos')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0)
    const uv = gl.getAttribLocation(program, 'a_uv')
    gl.enableVertexAttribArray(uv)
    gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8)
    const uniform = (name: string) => gl.getUniformLocation(program, name)
    gl.uniformMatrix4fv(uniform('u_matrix'), false, options.defaultProjectionData.mainMatrix)
    gl.uniform2f(uniform('u_origin'), origin[0]!, origin[1]!)
    gl.uniform1f(uniform('u_world'), world)
    gl.uniform2f(uniform('u_grid_size'), this.grid.width, this.grid.height)
    gl.uniform1f(uniform('u_step'), this.style.step)
    gl.uniform1f(uniform('u_half_width'), widthCss * ratio / 2)
    gl.uniform1f(uniform('u_dashed'), this.style.dashed ? 1 : 0)
    gl.uniform1f(uniform('u_dash_period'), DASH_PERIOD_PX * ratio)
    gl.uniform1f(uniform('u_dash_on'), DASH_ON_PX * ratio)
    gl.uniform4f(uniform('u_color'), ...this.style.color, this.opacity)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.field!)
    gl.uniform1i(uniform('u_field'), 0)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }
}

export function hexColor(hex: string): [number, number, number] {
  const value = Number.parseInt(hex.slice(1), 16)
  return [(value >> 16 & 255) / 255, (value >> 8 & 255) / 255, (value & 255) / 255]
}

function mercator(x: number, y: number): MercatorCoordinate {
  const lng = x / 6378137 * 180 / Math.PI
  const lat = (2 * Math.atan(Math.exp(y / 6378137)) - Math.PI / 2) * 180 / Math.PI
  return MercatorCoordinate.fromLngLat({ lng, lat })
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
