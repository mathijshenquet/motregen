import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl'
import { MercatorCoordinate } from 'maplibre-gl'
import type { MapTheme } from './basemap'
import type { Grid } from './contract'

export const WIND_TRAIL_OPACITY = 0.6
export const WIND_TRAIL_FADE = 0.955
export const WIND_PARTICLES_PER_MEGAPIXEL = 620
const TRAIL_TEXTURE_LONG_EDGE = 640
const SEGMENT_ALPHA = 0.95
const MIN_PARTICLES = 96
const MAX_PARTICLES = 1_100
const ADVECTION_SCALE = 7_000
const MAX_AGE = 150
const BEAUFORT_STOPS = [0, 3.4, 8, 13.9, 20.8, 32.7] as const
const LIGHT_RAMP = [
  [8, 75, 135], [0, 105, 135], [22, 120, 62], [151, 104, 0], [191, 54, 16], [137, 25, 95],
] as const
const DARK_RAMP = [
  [112, 194, 255], [68, 224, 231], [108, 225, 146], [255, 218, 92], [255, 147, 79], [244, 113, 201],
] as const

const particleVertexSource = `#version 300 es
in vec2 a_pos;
in vec4 a_color;
out vec4 v_color;
void main() {
  gl_Position = vec4(a_pos.x * 2.0 - 1.0, 1.0 - a_pos.y * 2.0, 0.0, 1.0);
  v_color = a_color;
}`

const particleFragmentSource = `#version 300 es
precision mediump float;
in vec4 v_color;
out vec4 color;
void main() { color = vec4(v_color.rgb * v_color.a, v_color.a); }`

const fadeVertexSource = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

const fadeFragmentSource = `#version 300 es
precision mediump float;
uniform sampler2D u_trail;
uniform float u_fade;
in vec2 v_uv;
out vec4 color;
void main() { color = texture(u_trail, v_uv) * u_fade; }`

const compositeVertexSource = `#version 300 es
in vec2 a_pos;
in vec2 a_uv;
uniform mat4 u_matrix;
out vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
}`

const compositeFragmentSource = `#version 300 es
precision mediump float;
uniform sampler2D u_trail;
uniform float u_opacity;
in vec2 v_uv;
out vec4 color;
void main() { color = texture(u_trail, v_uv) * u_opacity; }`

interface TrailTarget {
  texture: WebGLTexture
  framebuffer: WebGLFramebuffer
}

export class WindLayer implements CustomLayerInterface {
  readonly id = 'motregen-wind'
  readonly type = 'custom' as const
  readonly renderingMode = '2d' as const
  private map?: MapLibreMap
  private gl?: WebGL2RenderingContext
  private particleProgram?: WebGLProgram
  private fadeProgram?: WebGLProgram
  private compositeProgram?: WebGLProgram
  private particlePositionLocation = -1
  private particleColorLocation = -1
  private fadePositionLocation = -1
  private fadeTrailLocation?: WebGLUniformLocation
  private fadeFactorLocation?: WebGLUniformLocation
  private compositePositionLocation = -1
  private compositeUvLocation = -1
  private compositeMatrixLocation?: WebGLUniformLocation
  private compositeTrailLocation?: WebGLUniformLocation
  private compositeOpacityLocation?: WebGLUniformLocation
  private particleBuffer?: WebGLBuffer
  private screenBuffer?: WebGLBuffer
  private mapBuffer?: WebGLBuffer
  private trails?: [TrailTarget, TrailTarget]
  private trailIndex = 0
  private readonly trailWidth: number
  private readonly trailHeight: number
  private left?: Float32Array
  private right?: Float32Array
  private mix = 0
  private x = new Float32Array(MAX_PARTICLES)
  private y = new Float32Array(MAX_PARTICLES)
  private age = new Uint16Array(MAX_PARTICLES)
  private vertices = new Float32Array(MAX_PARTICLES * 12)
  private color = new Float32Array(3)
  private active = MIN_PARTICLES
  private target = MIN_PARTICLES
  private randomState = 0x6d2b79f5
  private previousTime = 0
  private frameTotal = 0
  private frameCount = 0

  constructor(private readonly grid: Grid, private readonly theme: MapTheme) {
    const aspect = grid.width / grid.height
    this.trailWidth = aspect >= 1 ? TRAIL_TEXTURE_LONG_EDGE : Math.max(1, Math.round(TRAIL_TEXTURE_LONG_EDGE * aspect))
    this.trailHeight = aspect >= 1 ? Math.max(1, Math.round(TRAIL_TEXTURE_LONG_EDGE / aspect)) : TRAIL_TEXTURE_LONG_EDGE
    for (let index = 0; index < MAX_PARTICLES; index++) this.respawn(index)
  }

  onAdd(map: MapLibreMap, context: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map
    this.gl = context as WebGL2RenderingContext
    this.particleProgram = link(this.gl, particleVertexSource, particleFragmentSource)
    this.fadeProgram = link(this.gl, fadeVertexSource, fadeFragmentSource)
    this.compositeProgram = link(this.gl, compositeVertexSource, compositeFragmentSource)
    this.particlePositionLocation = this.gl.getAttribLocation(this.particleProgram, 'a_pos')
    this.particleColorLocation = this.gl.getAttribLocation(this.particleProgram, 'a_color')
    this.fadePositionLocation = this.gl.getAttribLocation(this.fadeProgram, 'a_pos')
    this.fadeTrailLocation = this.gl.getUniformLocation(this.fadeProgram, 'u_trail')!
    this.fadeFactorLocation = this.gl.getUniformLocation(this.fadeProgram, 'u_fade')!
    this.compositePositionLocation = this.gl.getAttribLocation(this.compositeProgram, 'a_pos')
    this.compositeUvLocation = this.gl.getAttribLocation(this.compositeProgram, 'a_uv')
    this.compositeMatrixLocation = this.gl.getUniformLocation(this.compositeProgram, 'u_matrix')!
    this.compositeTrailLocation = this.gl.getUniformLocation(this.compositeProgram, 'u_trail')!
    this.compositeOpacityLocation = this.gl.getUniformLocation(this.compositeProgram, 'u_opacity')!
    this.particleBuffer = this.gl.createBuffer()!
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.particleBuffer)
    this.gl.bufferData(this.gl.ARRAY_BUFFER, this.vertices.byteLength, this.gl.DYNAMIC_DRAW)
    this.screenBuffer = this.gl.createBuffer()!
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.screenBuffer)
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), this.gl.STATIC_DRAW)
    this.mapBuffer = this.gl.createBuffer()!
    const west = this.grid.x0
    const east = west + this.grid.dx * this.grid.width
    const north = this.grid.y0
    const south = north + this.grid.dy * this.grid.height
    const nw = mercator(west, north)
    const se = mercator(east, south)
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.mapBuffer)
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([
      nw.x, nw.y, 0, 1,
      se.x, nw.y, 1, 1,
      nw.x, se.y, 0, 0,
      se.x, se.y, 1, 0,
    ]), this.gl.STATIC_DRAW)
    this.trails = [createTrailTarget(this.gl, this.trailWidth, this.trailHeight), createTrailTarget(this.gl, this.trailWidth, this.trailHeight)]
    clearTrails(this.gl, this.trails, this.trailWidth, this.trailHeight)
    const pixels = map.getCanvas().clientWidth * map.getCanvas().clientHeight
    this.target = Math.max(MIN_PARTICLES, Math.min(MAX_PARTICLES, Math.round(pixels / 1_000_000 * WIND_PARTICLES_PER_MEGAPIXEL)))
    this.active = this.target
  }

  onRemove(): void {
    if (!this.gl) return
    for (const buffer of [this.particleBuffer, this.screenBuffer, this.mapBuffer]) if (buffer) this.gl.deleteBuffer(buffer)
    for (const program of [this.particleProgram, this.fadeProgram, this.compositeProgram]) if (program) this.gl.deleteProgram(program)
    for (const target of this.trails ?? []) {
      this.gl.deleteFramebuffer(target.framebuffer)
      this.gl.deleteTexture(target.texture)
    }
    this.map = undefined
  }

  setFrames(left: Float32Array, right: Float32Array, mix: number): void {
    this.left = left
    this.right = right
    this.mix = mix
  }

  render(context: WebGLRenderingContext | WebGL2RenderingContext, options: CustomRenderMethodInput): void {
    const gl = context as WebGL2RenderingContext
    if (!this.particleProgram || !this.fadeProgram || !this.compositeProgram || !this.particleBuffer || !this.screenBuffer || !this.mapBuffer || !this.trails || !this.left || !this.right) return
    const now = performance.now()
    const elapsed = this.previousTime ? Math.min(40, now - this.previousTime) : 16
    this.previousTime = now
    this.adjustBudget(elapsed)
    this.advance(elapsed / 1_000)

    const viewport = gl.getParameter(gl.VIEWPORT) as Int32Array
    const framebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
    const depthEnabled = gl.isEnabled(gl.DEPTH_TEST)
    const scissorEnabled = gl.isEnabled(gl.SCISSOR_TEST)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.SCISSOR_TEST)

    const previous = this.trails[this.trailIndex]
    const nextIndex = 1 - this.trailIndex
    const next = this.trails[nextIndex]!
    gl.bindFramebuffer(gl.FRAMEBUFFER, next.framebuffer)
    gl.viewport(0, 0, this.trailWidth, this.trailHeight)
    gl.disable(gl.BLEND)
    this.drawFade(gl, previous.texture)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    this.drawParticles(gl)
    this.trailIndex = nextIndex

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.viewport(viewport[0]!, viewport[1]!, viewport[2]!, viewport[3]!)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    this.drawComposite(gl, next.texture, options)
    if (depthEnabled) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST)
    if (scissorEnabled) gl.enable(gl.SCISSOR_TEST); else gl.disable(gl.SCISSOR_TEST)
    this.map?.triggerRepaint()
  }

  private drawFade(gl: WebGL2RenderingContext, texture: WebGLTexture): void {
    gl.useProgram(this.fadeProgram!)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.screenBuffer!)
    gl.enableVertexAttribArray(this.fadePositionLocation)
    gl.vertexAttribPointer(this.fadePositionLocation, 2, gl.FLOAT, false, 0, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.uniform1i(this.fadeTrailLocation!, 0)
    gl.uniform1f(this.fadeFactorLocation!, WIND_TRAIL_FADE)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  private drawParticles(gl: WebGL2RenderingContext): void {
    gl.useProgram(this.particleProgram!)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer!)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertices, 0, this.active * 12)
    gl.enableVertexAttribArray(this.particlePositionLocation)
    gl.vertexAttribPointer(this.particlePositionLocation, 2, gl.FLOAT, false, 24, 0)
    gl.enableVertexAttribArray(this.particleColorLocation)
    gl.vertexAttribPointer(this.particleColorLocation, 4, gl.FLOAT, false, 24, 8)
    gl.lineWidth(1)
    gl.drawArrays(gl.LINES, 0, this.active * 2)
  }

  private drawComposite(gl: WebGL2RenderingContext, texture: WebGLTexture, options: CustomRenderMethodInput): void {
    gl.useProgram(this.compositeProgram!)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.mapBuffer!)
    gl.enableVertexAttribArray(this.compositePositionLocation)
    gl.vertexAttribPointer(this.compositePositionLocation, 2, gl.FLOAT, false, 16, 0)
    gl.enableVertexAttribArray(this.compositeUvLocation)
    gl.vertexAttribPointer(this.compositeUvLocation, 2, gl.FLOAT, false, 16, 8)
    gl.uniformMatrix4fv(this.compositeMatrixLocation!, false, options.defaultProjectionData.mainMatrix)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.uniform1i(this.compositeTrailLocation!, 0)
    gl.uniform1f(this.compositeOpacityLocation!, WIND_TRAIL_OPACITY)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  private advance(seconds: number): void {
    const cellWidth = Math.abs(this.grid.dx) * this.grid.width
    const cellHeight = Math.abs(this.grid.dy) * this.grid.height
    const leftFrame = this.left!
    const rightFrame = this.right!
    for (let index = 0; index < this.active; index++) {
      const oldX = this.x[index]!
      const oldY = this.y[index]!
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
        this.vertices[index * 12 + 5] = 0
        this.vertices[index * 12 + 11] = 0
        continue
      }
      this.x[index] = nextX
      this.y[index] = nextY
      writeParticle(this.vertices, index * 12, oldX, oldY, nextX, nextY, Math.hypot(east, north), this.theme, this.color)
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
    state ^= state << 13
    state ^= state >>> 17
    state ^= state << 5
    this.randomState = state >>> 0
    return this.randomState / 0x1_0000_0000
  }
}

export function windColor(speed: number, theme: MapTheme): [number, number, number] {
  const color = new Float32Array(3)
  setWindColor(speed, theme, color)
  return [color[0]!, color[1]!, color[2]!]
}

function setWindColor(speed: number, theme: MapTheme, color: Float32Array): void {
  let upper = 1
  while (upper < BEAUFORT_STOPS.length - 1 && speed > BEAUFORT_STOPS[upper]!) upper++
  const lowerSpeed = BEAUFORT_STOPS[upper - 1]!
  const upperSpeed = BEAUFORT_STOPS[upper]!
  const mix = Math.max(0, Math.min(1, (speed - lowerSpeed) / (upperSpeed - lowerSpeed)))
  const ramp = theme === 'dark' ? DARK_RAMP : LIGHT_RAMP
  const left = ramp[upper - 1]!
  const right = ramp[upper]!
  color[0] = (left[0] + (right[0] - left[0]) * mix) / 255
  color[1] = (left[1] + (right[1] - left[1]) * mix) / 255
  color[2] = (left[2] + (right[2] - left[2]) * mix) / 255
}

function writeParticle(vertices: Float32Array, offset: number, oldX: number, oldY: number, nextX: number, nextY: number, speed: number, theme: MapTheme, color: Float32Array): void {
  setWindColor(speed, theme, color)
  vertices[offset] = oldX
  vertices[offset + 1] = oldY
  vertices[offset + 2] = color[0]!
  vertices[offset + 3] = color[1]!
  vertices[offset + 4] = color[2]!
  vertices[offset + 5] = SEGMENT_ALPHA
  vertices[offset + 6] = nextX
  vertices[offset + 7] = nextY
  vertices[offset + 8] = color[0]!
  vertices[offset + 9] = color[1]!
  vertices[offset + 10] = color[2]!
  vertices[offset + 11] = SEGMENT_ALPHA
}

function createTrailTarget(gl: WebGL2RenderingContext, width: number, height: number): TrailTarget {
  const texture = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  const framebuffer = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Wind-trail-framebuffer is onvolledig')
  return { texture, framebuffer }
}

function clearTrails(gl: WebGL2RenderingContext, trails: [TrailTarget, TrailTarget], width: number, height: number): void {
  const framebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
  const viewport = gl.getParameter(gl.VIEWPORT) as Int32Array
  gl.viewport(0, 0, width, height)
  gl.clearColor(0, 0, 0, 0)
  for (const trail of trails) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, trail.framebuffer)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
  gl.viewport(viewport[0]!, viewport[1]!, viewport[2]!, viewport[3]!)
}

function mercator(x: number, y: number): MercatorCoordinate {
  const lng = x / 6_378_137 * 180 / Math.PI
  const lat = (2 * Math.atan(Math.exp(y / 6_378_137)) - Math.PI / 2) * 180 / Math.PI
  return MercatorCoordinate.fromLngLat({ lng, lat })
}

function link(gl: WebGL2RenderingContext, vertex: string, fragment: string): WebGLProgram {
  const compile = (type: number, source: string) => {
    const shader = gl.createShader(type)!
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(shader) ?? 'Wind-shaderfout')
    return shader
  }
  const program = gl.createProgram()!
  gl.attachShader(program, compile(gl.VERTEX_SHADER, vertex))
  gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragment))
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program) ?? 'Wind-shader-linkfout')
  return program
}
