import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl'
import { MercatorCoordinate } from 'maplibre-gl'
import type { Grid } from './contract'

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
uniform float u_mix;
in vec2 v_uv;
out vec4 color;
void main() {
  float value = mix(texture(u_left, v_uv).r, texture(u_right, v_uv).r, u_mix);
  color = texture(u_lut, vec2(value, 0.5));
}`

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
    const lut = texture(gl); this.lut = lut
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, lut)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, 256, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, colormap())
  }

  setFrames(left: Uint8Array, right: Uint8Array, mix: number): void {
    if (!this.gl || !this.left || !this.right) return
    upload(this.gl, this.left, this.grid, left)
    upload(this.gl, this.right, this.grid, right)
    this.mix = mix
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
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.left!); gl.uniform1i(gl.getUniformLocation(this.program, 'u_left'), 0)
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.right!); gl.uniform1i(gl.getUniformLocation(this.program, 'u_right'), 1)
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.lut!); gl.uniform1i(gl.getUniformLocation(this.program, 'u_lut'), 2)
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

function upload(gl: WebGL2RenderingContext, target: WebGLTexture, grid: Grid, data: Uint8Array): void {
  gl.activeTexture(gl.TEXTURE0)
  gl.bindTexture(gl.TEXTURE_2D, target)
  gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, grid.width, grid.height, 0, gl.RED, gl.UNSIGNED_BYTE, data)
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

function colormap(): Uint8Array {
  const stops = [[0, 0, 0, 0], [55, 54, 183, 255], [105, 31, 231, 190], [150, 255, 222, 44], [195, 255, 82, 35], [235, 188, 45, 214], [255, 188, 45, 214]]
  const lut = new Uint8Array(256 * 4)
  for (let value = 1; value < 255; value++) {
    let stop = 1; while (value > stops[stop]![0]) stop++
    const a = stops[stop - 1]!, b = stops[stop]!, mix = (value - a[0]!) / (b[0]! - a[0]!)
    for (let channel = 1; channel < 4; channel++) lut[value * 4 + channel - 1] = Math.round(a[channel]! + (b[channel]! - a[channel]!) * mix)
    lut[value * 4 + 3] = Math.min(210, Math.round(75 + value * 0.55))
  }
  return lut
}
