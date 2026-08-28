import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl'
import { MercatorCoordinate } from 'maplibre-gl'
import type { Grid } from './contract'

export const WIND_OPACITY = 0.6
export const WIND_PARTICLES_PER_MEGAPIXEL = 620
const MIN_PARTICLES = 48
const MAX_PARTICLES = 1_100
const ADVECTION_SCALE = 7_000
const MAX_AGE = 150
const BEAUFORT_RAMP = [
  [0, 116, 177, 182], [3.4, 82, 180, 190], [8, 99, 191, 154], [13.9, 210, 190, 98], [20.8, 220, 139, 92], [32.7, 202, 105, 141],
] as const

const vertexSource = `#version 300 es
in vec2 a_pos;
in vec4 a_color;
uniform mat4 u_matrix;
uniform vec2 u_nw;
uniform vec2 u_se;
out vec4 v_color;
void main() {
  vec2 projected = mix(u_nw, u_se, a_pos);
  gl_Position = u_matrix * vec4(projected, 0.0, 1.0);
  v_color = a_color;
}`

const fragmentSource = `#version 300 es
precision mediump float;
in vec4 v_color;
out vec4 color;
void main() { color = v_color; }`

export class WindLayer implements CustomLayerInterface {
  readonly id = 'motregen-wind'
  readonly type = 'custom' as const
  readonly renderingMode = '2d' as const
  private map?: MapLibreMap
  private gl?: WebGL2RenderingContext
  private program?: WebGLProgram
  private buffer?: WebGLBuffer
  private positionLocation = -1
  private colorLocation = -1
  private matrixLocation?: WebGLUniformLocation
  private nwLocation?: WebGLUniformLocation
  private seLocation?: WebGLUniformLocation
  private nwX = 0
  private nwY = 0
  private seX = 0
  private seY = 0
  private left?: Float32Array
  private right?: Float32Array
  private mix = 0
  private x = new Float32Array(MAX_PARTICLES)
  private y = new Float32Array(MAX_PARTICLES)
  private age = new Uint16Array(MAX_PARTICLES)
  private vertices = new Float32Array(MAX_PARTICLES * 12)
  private active = MIN_PARTICLES
  private target = MIN_PARTICLES
  private randomState = 0x6d2b79f5
  private previousTime = 0
  private frameTotal = 0
  private frameCount = 0

  constructor(private readonly grid: Grid) {
    for (let index = 0; index < MAX_PARTICLES; index++) this.respawn(index)
  }

  onAdd(map: MapLibreMap, context: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map
    this.gl = context as WebGL2RenderingContext
    this.program = link(this.gl, vertexSource, fragmentSource)
    this.buffer = this.gl.createBuffer()!
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer)
    this.gl.bufferData(this.gl.ARRAY_BUFFER, this.vertices.byteLength, this.gl.DYNAMIC_DRAW)
    this.positionLocation = this.gl.getAttribLocation(this.program, 'a_pos')
    this.colorLocation = this.gl.getAttribLocation(this.program, 'a_color')
    this.matrixLocation = this.gl.getUniformLocation(this.program, 'u_matrix')!
    this.nwLocation = this.gl.getUniformLocation(this.program, 'u_nw')!
    this.seLocation = this.gl.getUniformLocation(this.program, 'u_se')!
    const west = this.grid.x0
    const east = west + this.grid.dx * this.grid.width
    const north = this.grid.y0
    const south = north + this.grid.dy * this.grid.height
    const nw = mercator(west, north), se = mercator(east, south)
    this.nwX = nw.x; this.nwY = nw.y; this.seX = se.x; this.seY = se.y
    const pixels = map.getCanvas().clientWidth * map.getCanvas().clientHeight
    this.target = Math.max(MIN_PARTICLES, Math.min(MAX_PARTICLES, Math.round(pixels / 1_000_000 * WIND_PARTICLES_PER_MEGAPIXEL)))
    this.active = this.target
  }

  onRemove(): void {
    if (this.gl && this.buffer) this.gl.deleteBuffer(this.buffer)
    if (this.gl && this.program) this.gl.deleteProgram(this.program)
    this.map = undefined
  }

  setFrames(left: Float32Array, right: Float32Array, mix: number): void {
    this.left = left
    this.right = right
    this.mix = mix
  }

  render(context: WebGLRenderingContext | WebGL2RenderingContext, options: CustomRenderMethodInput): void {
    const gl = context as WebGL2RenderingContext
    if (!this.program || !this.buffer || !this.left || !this.right) return
    const now = performance.now()
    const elapsed = this.previousTime ? Math.min(40, now - this.previousTime) : 16
    this.previousTime = now
    this.adjustBudget(elapsed)
    this.advance(elapsed / 1_000)
    gl.useProgram(this.program)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertices, 0, this.active * 12)
    gl.enableVertexAttribArray(this.positionLocation)
    gl.vertexAttribPointer(this.positionLocation, 2, gl.FLOAT, false, 24, 0)
    gl.enableVertexAttribArray(this.colorLocation)
    gl.vertexAttribPointer(this.colorLocation, 4, gl.FLOAT, false, 24, 8)
    gl.uniformMatrix4fv(this.matrixLocation!, false, options.defaultProjectionData.mainMatrix)
    gl.uniform2f(this.nwLocation!, this.nwX, this.nwY)
    gl.uniform2f(this.seLocation!, this.seX, this.seY)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA)
    gl.lineWidth(1)
    gl.drawArrays(gl.LINES, 0, this.active * 2)
    this.map?.triggerRepaint()
  }

  private advance(seconds: number): void {
    const cellWidth = Math.abs(this.grid.dx) * this.grid.width
    const cellHeight = Math.abs(this.grid.dy) * this.grid.height
    const leftFrame = this.left!, rightFrame = this.right!
    for (let index = 0; index < this.active; index++) {
      const oldX = this.x[index]!, oldY = this.y[index]!
      const column = Math.max(0, Math.min(this.grid.width - 1, Math.round(oldX * (this.grid.width - 1))))
      const row = Math.max(0, Math.min(this.grid.height - 1, Math.round(oldY * (this.grid.height - 1))))
      const vectorOffset = (row * this.grid.width + column) * 2
      const east = leftFrame[vectorOffset]! * (1 - this.mix) + rightFrame[vectorOffset]! * this.mix
      const north = leftFrame[vectorOffset + 1]! * (1 - this.mix) + rightFrame[vectorOffset + 1]! * this.mix
      const invalid = !Number.isFinite(east) || !Number.isFinite(north)
      const nextX = oldX + east * seconds * ADVECTION_SCALE / cellWidth
      const nextY = oldY - north * seconds * ADVECTION_SCALE / cellHeight
      if (invalid || nextX < 0 || nextX > 1 || nextY < 0 || nextY > 1 || ++this.age[index]! > MAX_AGE) {
        this.respawn(index)
        continue
      }
      this.x[index] = nextX
      this.y[index] = nextY
      writeParticle(this.vertices, index * 12, oldX, oldY, nextX, nextY, Math.hypot(east, north))
    }
  }

  private adjustBudget(elapsed: number): void {
    this.frameTotal += elapsed
    this.frameCount++
    if (this.frameCount < 45) return
    const average = this.frameTotal / this.frameCount
    if (average > 19 && this.active > MIN_PARTICLES) this.active = Math.max(MIN_PARTICLES, Math.floor(this.active * 0.78))
    else if (average < 17.2 && this.active < this.target) this.active = Math.min(this.target, this.active + Math.max(12, Math.floor(this.target * 0.06)))
    this.frameTotal = 0
    this.frameCount = 0
  }

  private respawn(index: number): void {
    this.x[index] = this.random()
    this.y[index] = this.random()
    this.age[index] = Math.floor(this.random() * MAX_AGE)
  }

  private random(): number {
    let state = this.randomState
    state ^= state << 13; state ^= state >>> 17; state ^= state << 5
    this.randomState = state >>> 0
    return this.randomState / 0x1_0000_0000
  }
}

function writeParticle(vertices: Float32Array, offset: number, oldX: number, oldY: number, nextX: number, nextY: number, speed: number): void {
  let upper = 1
  while (upper < BEAUFORT_RAMP.length - 1 && speed > BEAUFORT_RAMP[upper]![0]) upper++
  const left = BEAUFORT_RAMP[upper - 1]!, right = BEAUFORT_RAMP[upper]!
  const mix = Math.max(0, Math.min(1, (speed - left[0]!) / (right[0]! - left[0]!)))
  const red = (left[1] + (right[1] - left[1]) * mix) / 255
  const green = (left[2] + (right[2] - left[2]) * mix) / 255
  const blue = (left[3] + (right[3] - left[3]) * mix) / 255
  vertices[offset] = oldX
  vertices[offset + 1] = oldY
  vertices[offset + 2] = red
  vertices[offset + 3] = green
  vertices[offset + 4] = blue
  vertices[offset + 5] = WIND_OPACITY
  vertices[offset + 6] = nextX
  vertices[offset + 7] = nextY
  vertices[offset + 8] = red
  vertices[offset + 9] = green
  vertices[offset + 10] = blue
  vertices[offset + 11] = WIND_OPACITY
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
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'Wind-shaderfout')
    return shader
  }
  const program = gl.createProgram()!
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex)); gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment)); gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Wind-shader-linkfout')
  return program
}
