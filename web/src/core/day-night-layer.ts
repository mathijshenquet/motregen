import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl'
import type { MapTheme } from './basemap'
import { solarElevationSin, solarPosition } from './solar'

export const DAY_NIGHT_LAYER_ID = 'motregen-day-night'

const vertexSource = `#version 300 es
in vec2 a_pos;
uniform mat4 u_matrix;
out vec2 v_mercator;
void main() {
  v_mercator = a_pos;
  gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
}`

const fragmentSource = `#version 300 es
precision highp float;
uniform vec3 u_sun;
uniform float u_opacity;
in vec2 v_mercator;
out vec4 color;
const float PI = 3.141592653589793;
void main() {
  float longitude = (v_mercator.x - 0.5) * 2.0 * PI;
  float latitude = atan(sinh((0.5 - v_mercator.y) * 2.0 * PI));
  float cosLatitude = cos(latitude);
  vec3 surface = vec3(cosLatitude * cos(longitude), cosLatitude * sin(longitude), sin(latitude));
  float daylight = dot(surface, u_sun);
  float night = 1.0 - smoothstep(-0.085, 0.085, daylight);
  color = vec4(0.015, 0.045, 0.075, night * u_opacity);
}`

export class DayNightLayer implements CustomLayerInterface {
  readonly id = DAY_NIGHT_LAYER_ID
  readonly type = 'custom' as const
  readonly renderingMode = '2d' as const
  private map?: MapLibreMap
  private gl?: WebGL2RenderingContext
  private program?: WebGLProgram
  private buffer?: WebGLBuffer
  private positionLocation = -1
  private matrixLocation?: WebGLUniformLocation
  private sunLocation?: WebGLUniformLocation
  private opacityLocation?: WebGLUniformLocation
  private sun: [number, number, number] = [1, 0, 0]

  constructor(private readonly theme: MapTheme) {}

  onAdd(map: MapLibreMap, context: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map
    this.gl = context as WebGL2RenderingContext
    this.program = link(this.gl, vertexSource, fragmentSource)
    this.buffer = this.gl.createBuffer()!
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer)
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]), this.gl.STATIC_DRAW)
    this.positionLocation = this.gl.getAttribLocation(this.program, 'a_pos')
    this.matrixLocation = this.gl.getUniformLocation(this.program, 'u_matrix')!
    this.sunLocation = this.gl.getUniformLocation(this.program, 'u_sun')!
    this.opacityLocation = this.gl.getUniformLocation(this.program, 'u_opacity')!
  }

  onRemove(): void {
    if (this.gl && this.buffer) this.gl.deleteBuffer(this.buffer)
    if (this.gl && this.program) this.gl.deleteProgram(this.program)
    this.map = undefined
  }

  setEpoch(epoch: number): void {
    this.sun = solarPosition(epoch).vector
    this.map?.triggerRepaint()
  }

  render(context: WebGLRenderingContext | WebGL2RenderingContext, options: CustomRenderMethodInput): void {
    const gl = context as WebGL2RenderingContext
    if (!this.program || !this.buffer) return
    gl.useProgram(this.program)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    gl.enableVertexAttribArray(this.positionLocation)
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 0, 0)
    gl.uniformMatrix4fv(this.matrixLocation!, false, options.defaultProjectionData.mainMatrix)
    gl.uniform3f(this.sunLocation!, this.sun[0], this.sun[1], this.sun[2])
    gl.uniform1f(this.opacityLocation!, terminatorOpacity(this.theme))
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }
}

export function terminatorOpacity(theme: MapTheme): number {
  return theme === 'dark' ? 0.08 : 0.19
}

export function nightAmount(epoch: number, longitude: number, latitude: number): number {
  const daylight = solarElevationSin(epoch, longitude, latitude)
  const mix = Math.max(0, Math.min(1, (daylight + 0.085) / 0.17))
  const smooth = mix * mix * (3 - 2 * mix)
  return 1 - smooth
}

function link(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'Day/night-shaderfout')
    return shader
  }
  const program = gl.createProgram()!
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex))
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Day/night-shader-linkfout')
  return program
}
