import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl'
import type { MapTheme } from './basemap'
import type { Grid } from './contract'

export const WIND_TRAIL_OPACITY = 0.6
export const WIND_TRAIL_FADE = 0.955
export const WIND_PARTICLES_PER_MEGAPIXEL = 620
export const WIND_PARTICLE_OPACITY = 0.95
export const WIND_REFERENCE_ZOOM = 6.4

export interface WindTuning {
  visibility: number
  thickness: number
  particlesPerMegapixel: number
  particleOpacity: number
  trailFade: number
  trailOpacity: number
}

export const DEFAULT_WIND_TUNING: WindTuning = {
  visibility: 1,
  thickness: 2.5,
  particlesPerMegapixel: WIND_PARTICLES_PER_MEGAPIXEL,
  particleOpacity: WIND_PARTICLE_OPACITY,
  trailFade: WIND_TRAIL_FADE,
  trailOpacity: WIND_TRAIL_OPACITY,
}

const MIN_PARTICLES = 96
const MAX_PARTICLES = 2_400
const ADVECTION_SCALE = 7_000
const MAX_AGE = 150
const MERCATOR_SCALE = 1 / (2 * Math.PI * 6_378_137)
const BEAUFORT_STOPS = [0, 3.4, 8, 13.9, 20.8, 32.7] as const
const LIGHT_RAMP = [
  [3, 48, 102], [0, 76, 108], [9, 91, 44], [119, 73, 0], [162, 39, 8], [108, 15, 73],
] as const
const DARK_RAMP = [
  [255, 255, 255], [255, 255, 255], [255, 255, 255], [255, 255, 255], [255, 255, 255], [255, 255, 255],
] as const
const lineOffsetCache = new Map<number, ReadonlyArray<readonly [number, number]>>()

const particleVertexSource = `#version 300 es
in vec2 a_pos;
in vec4 a_color;
uniform mat4 u_matrix;
uniform vec2 u_offset;
out vec4 v_color;
void main() {
  vec4 position = u_matrix * vec4(a_pos, 0.0, 1.0);
  position.xy += u_offset * position.w;
  gl_Position = position;
  v_color = a_color;
}`

const particleFragmentSource = `#version 300 es
precision mediump float;
in vec4 v_color;
uniform float u_visibility;
uniform vec3 u_contrast;
out vec4 color;
void main() {
  float alpha = v_color.a * min(u_visibility, 1.0);
  vec3 rgb = mix(v_color.rgb, u_contrast, clamp((u_visibility - 1.0) * 0.5, 0.0, 1.0));
  color = vec4(rgb * alpha, alpha);
}`

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
uniform vec2 u_uv_scale;
uniform vec2 u_uv_offset;
in vec2 v_uv;
out vec4 color;
void main() {
  vec2 previousUv = v_uv * u_uv_scale + u_uv_offset;
  float inside = step(0.0, previousUv.x) * step(previousUv.x, 1.0) * step(0.0, previousUv.y) * step(previousUv.y, 1.0);
  color = texture(u_trail, clamp(previousUv, vec2(0.0), vec2(1.0))) * u_fade * inside;
}`

const compositeVertexSource = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
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

interface ParticleBounds {
  west: number
  north: number
  east: number
  south: number
}

export interface TrailView {
  centerX: number
  centerY: number
  zoom: number
  width: number
  height: number
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
  private particleMatrixLocation?: WebGLUniformLocation
  private particleOffsetLocation?: WebGLUniformLocation
  private particleVisibilityLocation?: WebGLUniformLocation
  private particleContrastLocation?: WebGLUniformLocation
  private fadePositionLocation = -1
  private fadeTrailLocation?: WebGLUniformLocation
  private fadeFactorLocation?: WebGLUniformLocation
  private fadeUvScaleLocation?: WebGLUniformLocation
  private fadeUvOffsetLocation?: WebGLUniformLocation
  private compositePositionLocation = -1
  private compositeTrailLocation?: WebGLUniformLocation
  private compositeOpacityLocation?: WebGLUniformLocation
  private particleBuffer?: WebGLBuffer
  private screenBuffer?: WebGLBuffer
  private trails?: [TrailTarget, TrailTarget]
  private trailIndex = 0
  private trailWidth = 0
  private trailHeight = 0
  private trailView?: TrailView
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
  private particleBounds: ParticleBounds = { west: 0, north: 0, east: 1, south: 1 }
  private tuning: WindTuning
  private readonly viewportChanged = () => this.resetViewport()

  constructor(private readonly grid: Grid, private theme: MapTheme, tuning: WindTuning = DEFAULT_WIND_TUNING) {
    this.tuning = { ...tuning }
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
    this.particleMatrixLocation = this.gl.getUniformLocation(this.particleProgram, 'u_matrix')!
    this.particleOffsetLocation = this.gl.getUniformLocation(this.particleProgram, 'u_offset')!
    this.particleVisibilityLocation = this.gl.getUniformLocation(this.particleProgram, 'u_visibility')!
    this.particleContrastLocation = this.gl.getUniformLocation(this.particleProgram, 'u_contrast')!
    this.fadePositionLocation = this.gl.getAttribLocation(this.fadeProgram, 'a_pos')
    this.fadeTrailLocation = this.gl.getUniformLocation(this.fadeProgram, 'u_trail')!
    this.fadeFactorLocation = this.gl.getUniformLocation(this.fadeProgram, 'u_fade')!
    this.fadeUvScaleLocation = this.gl.getUniformLocation(this.fadeProgram, 'u_uv_scale')!
    this.fadeUvOffsetLocation = this.gl.getUniformLocation(this.fadeProgram, 'u_uv_offset')!
    this.compositePositionLocation = this.gl.getAttribLocation(this.compositeProgram, 'a_pos')
    this.compositeTrailLocation = this.gl.getUniformLocation(this.compositeProgram, 'u_trail')!
    this.compositeOpacityLocation = this.gl.getUniformLocation(this.compositeProgram, 'u_opacity')!
    this.particleBuffer = this.gl.createBuffer()!
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.particleBuffer)
    this.gl.bufferData(this.gl.ARRAY_BUFFER, this.vertices.byteLength, this.gl.DYNAMIC_DRAW)
    this.screenBuffer = this.gl.createBuffer()!
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.screenBuffer)
    this.gl.bufferData(this.gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), this.gl.STATIC_DRAW)
    this.ensureTrailTargets()
    map.on('move', this.viewportChanged)
    map.on('resize', this.viewportChanged)
    this.resetViewport(true)
  }

  onRemove(): void {
    if (!this.gl) return
    this.map?.off('move', this.viewportChanged)
    this.map?.off('resize', this.viewportChanged)
    for (const buffer of [this.particleBuffer, this.screenBuffer]) if (buffer) this.gl.deleteBuffer(buffer)
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

  setTheme(theme: MapTheme): void {
    if (theme === this.theme) return
    this.theme = theme
    if (this.gl && this.trails) {
      clearTrails(this.gl, this.trails, this.trailWidth, this.trailHeight)
      this.trailView = this.currentTrailView()
    }
    this.map?.triggerRepaint()
  }

  setTuning(tuning: WindTuning): void {
    const previousActive = this.active
    this.tuning = { ...tuning }
    if (!this.map) return
    const canvas = this.map.getCanvas()
    this.target = particleCountForViewport(canvas.clientWidth, canvas.clientHeight, tuning.particlesPerMegapixel)
    this.active = this.target
    for (let index = previousActive; index < this.active; index++) this.respawn(index)
    this.map.triggerRepaint()
  }

  render(context: WebGLRenderingContext | WebGL2RenderingContext, options: CustomRenderMethodInput): void {
    const gl = context as WebGL2RenderingContext
    this.ensureTrailTargets()
    if (!this.particleProgram || !this.fadeProgram || !this.compositeProgram || !this.particleBuffer || !this.screenBuffer || !this.trails || !this.left || !this.right) return
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
    const currentView = this.currentTrailView()
    this.drawFade(gl, previous.texture, currentView)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    this.drawParticles(gl, options)
    this.trailIndex = nextIndex
    this.trailView = currentView

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.viewport(viewport[0]!, viewport[1]!, viewport[2]!, viewport[3]!)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    this.drawComposite(gl, next.texture, options)
    if (depthEnabled) gl.enable(gl.DEPTH_TEST); else gl.disable(gl.DEPTH_TEST)
    if (scissorEnabled) gl.enable(gl.SCISSOR_TEST); else gl.disable(gl.SCISSOR_TEST)
    this.map?.triggerRepaint()
  }

  private drawFade(gl: WebGL2RenderingContext, texture: WebGLTexture, currentView: TrailView): void {
    gl.useProgram(this.fadeProgram!)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.screenBuffer!)
    gl.enableVertexAttribArray(this.fadePositionLocation)
    gl.vertexAttribPointer(this.fadePositionLocation, 2, gl.FLOAT, false, 0, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.uniform1i(this.fadeTrailLocation!, 0)
    gl.uniform1f(this.fadeFactorLocation!, this.tuning.trailFade)
    const transform = trailUvTransform(this.trailView ?? currentView, currentView)
    gl.uniform2f(this.fadeUvScaleLocation!, transform.scaleX, transform.scaleY)
    gl.uniform2f(this.fadeUvOffsetLocation!, transform.offsetX, transform.offsetY)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  private drawParticles(gl: WebGL2RenderingContext, options: CustomRenderMethodInput): void {
    gl.useProgram(this.particleProgram!)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.particleBuffer!)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertices, 0, this.active * 12)
    gl.enableVertexAttribArray(this.particlePositionLocation)
    gl.vertexAttribPointer(this.particlePositionLocation, 2, gl.FLOAT, false, 24, 0)
    gl.enableVertexAttribArray(this.particleColorLocation)
    gl.vertexAttribPointer(this.particleColorLocation, 4, gl.FLOAT, false, 24, 8)
    gl.uniformMatrix4fv(this.particleMatrixLocation!, false, options.defaultProjectionData.mainMatrix)
    gl.uniform1f(this.particleVisibilityLocation!, this.tuning.visibility)
    const contrast = this.theme === 'dark' ? 1 : 0
    gl.uniform3f(this.particleContrastLocation!, contrast, contrast, contrast)
    gl.lineWidth(1)
    for (const [x, y] of windLineOffsets(this.tuning.thickness)) {
      gl.uniform2f(this.particleOffsetLocation!, x * 2 / this.trailWidth, y * 2 / this.trailHeight)
      gl.drawArrays(gl.LINES, 0, this.active * 2)
    }
  }

  private drawComposite(gl: WebGL2RenderingContext, texture: WebGLTexture, options: CustomRenderMethodInput): void {
    void options
    gl.useProgram(this.compositeProgram!)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.screenBuffer!)
    gl.enableVertexAttribArray(this.compositePositionLocation)
    gl.vertexAttribPointer(this.compositePositionLocation, 2, gl.FLOAT, false, 0, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.uniform1i(this.compositeTrailLocation!, 0)
    gl.uniform1f(this.compositeOpacityLocation!, this.tuning.trailOpacity * Math.min(this.tuning.visibility, 1))
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
  }

  private advance(seconds: number): void {
    const cellWidth = Math.abs(this.grid.dx) * this.grid.width
    const cellHeight = Math.abs(this.grid.dy) * this.grid.height
    const advectionScale = ADVECTION_SCALE * windZoomCompensation(this.map?.getZoom() ?? WIND_REFERENCE_ZOOM)
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
      const nextX = oldX + east * seconds * advectionScale / cellWidth
      const nextY = oldY - north * seconds * advectionScale / cellHeight
      if (invalid || nextX < this.particleBounds.west || nextX > this.particleBounds.east ||
        nextY < this.particleBounds.north || nextY > this.particleBounds.south || ++this.age[index]! > MAX_AGE) {
        this.respawn(index)
        this.vertices[index * 12 + 5] = 0
        this.vertices[index * 12 + 11] = 0
        continue
      }
      this.x[index] = nextX
      this.y[index] = nextY
      const oldMercatorX = 0.5 + (this.grid.x0 + this.grid.dx * this.grid.width * oldX) * MERCATOR_SCALE
      const oldMercatorY = 0.5 - (this.grid.y0 + this.grid.dy * this.grid.height * oldY) * MERCATOR_SCALE
      const nextMercatorX = 0.5 + (this.grid.x0 + this.grid.dx * this.grid.width * nextX) * MERCATOR_SCALE
      const nextMercatorY = 0.5 - (this.grid.y0 + this.grid.dy * this.grid.height * nextY) * MERCATOR_SCALE
      writeParticle(this.vertices, index * 12, oldMercatorX, oldMercatorY, nextMercatorX, nextMercatorY, Math.hypot(east, north), this.theme, this.tuning.particleOpacity, this.color)
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
    this.x[index] = this.particleBounds.west + this.random() * (this.particleBounds.east - this.particleBounds.west)
    this.y[index] = this.particleBounds.north + this.random() * (this.particleBounds.south - this.particleBounds.north)
    this.age[index] = Math.floor(this.random() * MAX_AGE)
  }

  private resetViewport(resetAll = false): void {
    if (!this.map) return
    this.ensureTrailTargets()
    this.particleBounds = particleBounds(this.map, this.grid)
    const canvas = this.map.getCanvas()
    const previousActive = this.active
    this.target = particleCountForViewport(canvas.clientWidth, canvas.clientHeight, this.tuning.particlesPerMegapixel)
    this.active = this.target
    for (let index = 0; index < this.active; index++) {
      const outside = this.x[index]! < this.particleBounds.west || this.x[index]! > this.particleBounds.east ||
        this.y[index]! < this.particleBounds.north || this.y[index]! > this.particleBounds.south
      if (resetAll || index >= previousActive || outside) this.respawn(index)
    }
    if (resetAll && this.gl && this.trails) {
      clearTrails(this.gl, this.trails, this.trailWidth, this.trailHeight)
      this.trailView = this.currentTrailView()
    }
  }

  private currentTrailView(): TrailView {
    const center = this.map!.getCenter()
    const canvas = this.map!.getCanvas()
    return {
      centerX: 0.5 + projectX(center.lng) * MERCATOR_SCALE,
      centerY: 0.5 - projectY(center.lat) * MERCATOR_SCALE,
      zoom: this.map!.getZoom(),
      width: Math.max(1, canvas.clientWidth),
      height: Math.max(1, canvas.clientHeight),
    }
  }

  private ensureTrailTargets(): void {
    if (!this.map || !this.gl) return
    const canvas = this.map.getCanvas()
    const [width, height] = trailTargetSize(canvas.width, canvas.height, this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number)
    if (width === this.trailWidth && height === this.trailHeight && this.trails) return
    for (const target of this.trails ?? []) {
      this.gl.deleteFramebuffer(target.framebuffer)
      this.gl.deleteTexture(target.texture)
    }
    this.trailWidth = width
    this.trailHeight = height
    this.trails = [createTrailTarget(this.gl, width, height), createTrailTarget(this.gl, width, height)]
    this.trailIndex = 0
    clearTrails(this.gl, this.trails, width, height)
    this.trailView = this.currentTrailView()
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

export function trailTargetSize(canvasWidth: number, canvasHeight: number, maxTextureSize: number): [number, number] {
  const width = Math.max(1, Math.round(canvasWidth))
  const height = Math.max(1, Math.round(canvasHeight))
  const scale = Math.min(1, maxTextureSize / Math.max(width, height))
  return [Math.max(1, Math.round(width * scale)), Math.max(1, Math.round(height * scale))]
}

export function particleCountForViewport(width: number, height: number, particlesPerMegapixel = WIND_PARTICLES_PER_MEGAPIXEL): number {
  const count = Math.round(Math.max(0, width) * Math.max(0, height) / 1_000_000 * particlesPerMegapixel)
  return Math.max(MIN_PARTICLES, Math.min(MAX_PARTICLES, count))
}

export function windZoomCompensation(zoom: number): number {
  return 2 ** (WIND_REFERENCE_ZOOM - zoom)
}

export function trailUvTransform(previous: TrailView, current: TrailView): { scaleX: number; scaleY: number; offsetX: number; offsetY: number } {
  const zoomScale = 2 ** (previous.zoom - current.zoom)
  const scaleX = zoomScale * current.width / previous.width
  const scaleY = zoomScale * current.height / previous.height
  const previousWorldSize = 512 * 2 ** previous.zoom
  return {
    scaleX,
    scaleY,
    offsetX: 0.5 * (1 - scaleX) + (current.centerX - previous.centerX) * previousWorldSize / previous.width,
    offsetY: 0.5 * (1 - scaleY) - (current.centerY - previous.centerY) * previousWorldSize / previous.height,
  }
}

export function windLineOffsets(thickness: number): ReadonlyArray<readonly [number, number]> {
  const value = Math.max(1, Math.min(5, thickness))
  const cached = lineOffsetCache.get(value)
  if (cached) return cached
  const size = Math.ceil(value)
  const start = -(value - 1) / 2
  const step = size === 1 ? 0 : (value - 1) / (size - 1)
  const offsets = Array.from({ length: size * size }, (_, index) => [
    start + index % size * step,
    start + Math.floor(index / size) * step,
  ] as const)
  lineOffsetCache.set(value, offsets)
  return offsets
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

function writeParticle(vertices: Float32Array, offset: number, oldX: number, oldY: number, nextX: number, nextY: number, speed: number, theme: MapTheme, opacity: number, color: Float32Array): void {
  setWindColor(speed, theme, color)
  vertices[offset] = oldX
  vertices[offset + 1] = oldY
  vertices[offset + 2] = color[0]!
  vertices[offset + 3] = color[1]!
  vertices[offset + 4] = color[2]!
  vertices[offset + 5] = opacity
  vertices[offset + 6] = nextX
  vertices[offset + 7] = nextY
  vertices[offset + 8] = color[0]!
  vertices[offset + 9] = color[1]!
  vertices[offset + 10] = color[2]!
  vertices[offset + 11] = opacity
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
  const clearColor = gl.getParameter(gl.COLOR_CLEAR_VALUE) as Float32Array
  const scissorEnabled = gl.isEnabled(gl.SCISSOR_TEST)
  gl.disable(gl.SCISSOR_TEST)
  gl.viewport(0, 0, width, height)
  gl.clearColor(0, 0, 0, 0)
  for (const trail of trails) {
    gl.bindFramebuffer(gl.FRAMEBUFFER, trail.framebuffer)
    gl.clear(gl.COLOR_BUFFER_BIT)
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
  gl.viewport(viewport[0]!, viewport[1]!, viewport[2]!, viewport[3]!)
  gl.clearColor(clearColor[0]!, clearColor[1]!, clearColor[2]!, clearColor[3]!)
  if (scissorEnabled) gl.enable(gl.SCISSOR_TEST)
}

function particleBounds(map: MapLibreMap, grid: Grid): ParticleBounds {
  const bounds = map.getBounds()
  const west = gridFractionX(grid, projectX(bounds.getWest()))
  const east = gridFractionX(grid, projectX(bounds.getEast()))
  const north = gridFractionY(grid, projectY(bounds.getNorth()))
  const south = gridFractionY(grid, projectY(bounds.getSouth()))
  const clipped = {
    west: Math.max(0, Math.min(1, Math.min(west, east))),
    east: Math.max(0, Math.min(1, Math.max(west, east))),
    north: Math.max(0, Math.min(1, Math.min(north, south))),
    south: Math.max(0, Math.min(1, Math.max(north, south))),
  }
  return clipped.west < clipped.east && clipped.north < clipped.south
    ? clipped
    : { west: 0, north: 0, east: 1, south: 1 }
}

function gridFractionX(grid: Grid, projected: number): number {
  return (projected - grid.x0) / (grid.dx * grid.width)
}

function gridFractionY(grid: Grid, projected: number): number {
  return (projected - grid.y0) / (grid.dy * grid.height)
}

function projectX(longitude: number): number {
  return longitude * Math.PI / 180 * 6_378_137
}

function projectY(latitude: number): number {
  return Math.log(Math.tan(Math.PI / 4 + latitude * Math.PI / 360)) * 6_378_137
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
