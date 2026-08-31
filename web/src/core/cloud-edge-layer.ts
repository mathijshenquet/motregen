import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl'
import { MercatorCoordinate } from 'maplibre-gl'
import type { Grid, MrfHeader } from './contract'

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
uniform float u_mix;
uniform vec2 u_grid_size;
in vec2 v_uv;
out vec4 color;

vec2 cloudSample(sampler2D frame, vec2 uv) {
  vec2 halfTexel = 0.5 / u_grid_size;
  bool inside = all(greaterThanEqual(uv, halfTexel)) && all(lessThanEqual(uv, vec2(1.0) - halfTexel));
  vec2 value = texture(frame, clamp(uv, halfTexel, vec2(1.0) - halfTexel)).rg;
  return vec2(value.r, value.g * (inside ? 1.0 : 0.0));
}

float coverage(vec2 uv) {
  vec2 left = cloudSample(u_left, uv);
  vec2 right = cloudSample(u_right, uv);
  float valid = mix(left.g, right.g, u_mix);
  return valid < 0.01 ? -1.0 : mix(left.r * left.g, right.r * right.g, u_mix) / valid;
}

void main() {
  float center = coverage(v_uv);
  if (center < 0.0) { color = vec4(0.0); return; }
  vec2 texel = 1.0 / u_grid_size;
  float left = max(0.0, coverage(v_uv - vec2(texel.x * 1.5, 0.0)));
  float right = max(0.0, coverage(v_uv + vec2(texel.x * 1.5, 0.0)));
  float down = max(0.0, coverage(v_uv - vec2(0.0, texel.y * 1.5)));
  float up = max(0.0, coverage(v_uv + vec2(0.0, texel.y * 1.5)));
  float wideLeft = max(0.0, coverage(v_uv - vec2(texel.x * 4.0, 0.0)));
  float wideRight = max(0.0, coverage(v_uv + vec2(texel.x * 4.0, 0.0)));
  float wideDown = max(0.0, coverage(v_uv - vec2(0.0, texel.y * 4.0)));
  float wideUp = max(0.0, coverage(v_uv + vec2(0.0, texel.y * 4.0)));
  float localGradient = length(vec2(right - left, up - down));
  float wideGradient = length(vec2(wideRight - wideLeft, wideUp - wideDown));
  float boundary = smoothstep(0.06, 0.32, max(localGradient, wideGradient * 0.72));
  float cloudSide = smoothstep(0.35, 0.72, center);
  vec3 sunlight = vec3(1.0, 0.78, 0.22);
  vec3 cloudShadow = vec3(0.25, 0.42, 0.52);
  vec3 tint = mix(sunlight, cloudShadow, cloudSide);
  float alpha = boundary * mix(0.18, 0.42, cloudSide);
  color = vec4(tint, alpha);
}`

export class CloudEdgeLayer implements CustomLayerInterface {
  readonly id = 'motregen-cloud-edges'
  readonly type = 'custom' as const
  readonly renderingMode = '2d' as const
  private gl?: WebGL2RenderingContext
  private program?: WebGLProgram
  private buffer?: WebGLBuffer
  private left?: WebGLTexture
  private right?: WebGLTexture
  private mix = 0

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
  }

  onRemove(_map: MapLibreMap, context: WebGLRenderingContext | WebGL2RenderingContext): void {
    const gl = context as WebGL2RenderingContext
    if (this.left) gl.deleteTexture(this.left)
    if (this.right) gl.deleteTexture(this.right)
    if (this.buffer) gl.deleteBuffer(this.buffer)
    if (this.program) gl.deleteProgram(this.program)
    this.gl = undefined
  }

  setFrames(left: Uint8Array, right: Uint8Array, leftHeader: MrfHeader, rightHeader: MrfHeader, mix: number): void {
    if (!this.gl || !this.left || !this.right) return
    upload(this.gl, this.left, this.grid, encodeCloudCoverage(left, leftHeader.quant))
    upload(this.gl, this.right, this.grid, encodeCloudCoverage(right, rightHeader.quant))
    this.mix = mix
  }

  render(context: WebGLRenderingContext | WebGL2RenderingContext, options: CustomRenderMethodInput): void {
    const gl = context as WebGL2RenderingContext
    if (!this.program || !this.buffer || !this.left || !this.right) return
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
    gl.uniform2f(gl.getUniformLocation(this.program, 'u_grid_size'), this.grid.width, this.grid.height)
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.left); gl.uniform1i(gl.getUniformLocation(this.program, 'u_left'), 0)
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.right); gl.uniform1i(gl.getUniformLocation(this.program, 'u_right'), 1)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }
}

export function encodeCloudCoverage(data: Uint8Array, quant: Array<number | null>): Uint8Array {
  const encoded = new Uint8Array(data.length * 2)
  for (let index = 0; index < data.length; index++) {
    const value = quant[data[index]!]
    encoded[index * 2] = value == null ? 0 : Math.round(Math.max(0, Math.min(1, value)) * 255)
    encoded[index * 2 + 1] = value == null ? 0 : 255
  }
  return encoded
}

function mercator(x: number, y: number): MercatorCoordinate {
  const longitude = x / 6_378_137 * 180 / Math.PI
  const latitude = (2 * Math.atan(Math.exp(y / 6_378_137)) - Math.PI / 2) * 180 / Math.PI
  return MercatorCoordinate.fromLngLat({ lng: longitude, lat: latitude })
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

function upload(gl: WebGL2RenderingContext, target: WebGLTexture, grid: Grid, data: Uint8Array): void {
  gl.bindTexture(gl.TEXTURE_2D, target)
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG8, grid.width, grid.height, 0, gl.RG, gl.UNSIGNED_BYTE, data)
}

function link(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'Shaderfout')
    return shader
  }
  const program = gl.createProgram()!
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex))
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Shader-linkfout')
  return program
}
