import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl'
import type { MapTheme } from './basemap'
import type { Grid } from './contract'

export const WIND_PARTICLES_PER_MEGAPIXEL = 620
export const WIND_REFERENCE_ZOOM = 6.4
// v2: U3-waarden (polylinemodel) betekenen in het buffermodel iets anders.
export const WIND_TUNING_STORAGE_KEY = 'motregen-wind-tuning-v2'

// De staart ontstaat in een trailbuffer die per seconde vervaagt; de particle
// zelf stempelt alleen zijn kop. Leven en fades zijn schermafstanden (CSS-px),
// zodat snelheid tempo wordt en niet de hoeveelheid inkt per particle.
// lineWidth is in device-px, zoals vóór U3: dat hield mobiel fijn en desktop
// voller, en de PO wil die look terug.
export interface WindTuning {
  particlesPerMegapixel: number
  trailDistance: number
  fadeInPx: number
  fadeOutPx: number
  maxAge: number
  spawnJitter: number
  speedDamping: number
  bufferFade: number
  bufferDpr: number
  headIntensity: number
  lineWidth: number
  speed: number
  intensity: number
  visibility: number
  /** Bovengrens voor wind-, regen- en afspeelframes (120 Hz-schermen tekenen anders alles dubbel). */
  maxFps: number
}

export const DEFAULT_WIND_TUNING: WindTuning = {
  particlesPerMegapixel: WIND_PARTICLES_PER_MEGAPIXEL,
  trailDistance: 90,
  fadeInPx: 15,
  fadeOutPx: 30,
  maxAge: 6,
  spawnJitter: 0.6,
  speedDamping: 0.7,
  // 0,955 per frame bij 60 Hz, de fade van vóór U3.
  bufferFade: 0.063,
  // Buffer nooit fijner dan 1,5 device-px per CSS-px: op een Pixel 5 (DPR 2,75)
  // kostten fade + composite op volle resolutie ~1 s warme TTFR in de 4G-gate.
  bufferDpr: 1.5,
  headIntensity: 0.95,
  lineWidth: 2.5,
  speed: 1,
  intensity: 1.9,
  visibility: 1,
  maxFps: 60,
}

export interface WindTuningControl {
  key: keyof WindTuning
  label: string
  min: number
  max: number
  step: number
  unit?: string
}

export const WIND_TUNING_CONTROLS: readonly WindTuningControl[] = [
  { key: 'particlesPerMegapixel', label: 'Dichtheid', min: 50, max: 2_000, step: 10, unit: '/MP' },
  { key: 'trailDistance', label: 'Afstand per leven', min: 10, max: 400, step: 5, unit: 'px' },
  { key: 'fadeInPx', label: 'Fade-in', min: 0, max: 150, step: 1, unit: 'px' },
  { key: 'fadeOutPx', label: 'Fade-out', min: 0, max: 150, step: 1, unit: 'px' },
  { key: 'maxAge', label: 'Max. leeftijd', min: 0.5, max: 20, step: 0.1, unit: 's' },
  { key: 'spawnJitter', label: 'Spawn-jitter', min: 0, max: 1, step: 0.05 },
  { key: 'speedDamping', label: 'Snelheidsdemping', min: 0, max: 2, step: 0.05 },
  { key: 'bufferFade', label: 'Buffer-rest', min: 0.001, max: 0.6, step: 0.001, unit: '/s' },
  { key: 'bufferDpr', label: 'Buffer-DPR max', min: 0.5, max: 4, step: 0.25, unit: '×' },
  { key: 'headIntensity', label: 'Kopintensiteit', min: 0, max: 1, step: 0.01 },
  { key: 'lineWidth', label: 'Lijnbreedte', min: 0.5, max: 8, step: 0.05, unit: 'dpx' },
  { key: 'speed', label: 'Tempo', min: 0.2, max: 3, step: 0.05, unit: '×' },
  { key: 'intensity', label: 'Intensiteit', min: 0, max: 2, step: 0.01, unit: '×' },
  { key: 'visibility', label: 'Contrast', min: 0, max: 3, step: 0.1 },
  { key: 'maxFps', label: 'Max. fps', min: 10, max: 120, step: 5, unit: 'Hz' },
]

const MIN_PARTICLES = 96
const MAX_PARTICLES = 2_400
const INSTANCE_BYTES = 20
const ADVECTION_SCALE = 7_000
const WORLD_TILE_SIZE = 512
const INITIAL_STAGGER_SECONDS = 2
const SPAWN_ATTEMPTS = 32
// Boven deze windsnelheid (m/s) dimt speedDamping de kop.
const DAMPING_REFERENCE_SPEED = 3
const MERCATOR_SCALE = 1 / (2 * Math.PI * 6_378_137)
const BEAUFORT_STOPS = [0, 3.4, 8, 13.9, 20.8, 32.7] as const
const LIGHT_RAMP = [
  [3, 48, 102], [0, 76, 108], [9, 91, 44], [119, 73, 0], [162, 39, 8], [108, 15, 73],
] as const
const DARK_RAMP = [
  [255, 255, 255], [255, 255, 255], [255, 255, 255], [255, 255, 255], [255, 255, 255], [255, 255, 255],
] as const

// Eén instance per particle: het segment dat de kop deze frame aflegt, als
// quad met stompe uiteinden (opeenvolgende segmenten overlappen dan niet en
// stempelen de naad niet dubbel) en een gefeatherde rand over de breedte.
const segmentVertexSource = `#version 300 es
in vec2 a_from;
in vec2 a_to;
in vec4 a_color;
uniform mat4 u_matrix;
uniform vec2 u_target;
uniform float u_extent;
out vec4 v_color;
out float v_across;
void main() {
  vec4 from = u_matrix * vec4(a_from, 0.0, 1.0);
  vec4 to = u_matrix * vec4(a_to, 0.0, 1.0);
  vec2 fromPx = from.xy / from.w * 0.5 * u_target;
  vec2 toPx = to.xy / to.w * 0.5 * u_target;
  vec2 delta = toPx - fromPx;
  float len = length(delta);
  vec2 direction = len > 1e-4 ? delta / len : vec2(1.0, 0.0);
  float side = (gl_VertexID & 1) == 0 ? 1.0 : -1.0;
  vec2 px = (gl_VertexID >= 2 ? toPx : fromPx) + vec2(-direction.y, direction.x) * side * u_extent;
  gl_Position = vec4(px / (0.5 * u_target), 0.0, 1.0);
  v_across = side * u_extent;
  v_color = len > 1e-4 ? a_color : vec4(0.0);
}`

const segmentFragmentSource = `#version 300 es
precision mediump float;
in vec4 v_color;
in float v_across;
uniform float u_half_width;
uniform float u_head;
uniform float u_visibility;
uniform vec3 u_contrast;
out vec4 color;
void main() {
  float coverage = clamp(u_half_width + 0.5 - abs(v_across), 0.0, 1.0);
  float alpha = v_color.a * coverage * u_head;
  vec3 rgb = mix(v_color.rgb, u_contrast, clamp((u_visibility - 1.0) * 0.5, 0.0, 1.0));
  color = vec4(rgb * alpha, alpha);
}`

const screenVertexSource = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`

// De vloer haalt 8-bit-waarden die door afronding nooit meer dalen (t3i-ghosts) weg.
const fadeFragmentSource = `#version 300 es
precision mediump float;
uniform sampler2D u_trail;
uniform float u_fade;
uniform float u_floor;
uniform vec2 u_uv_scale;
uniform vec2 u_uv_offset;
in vec2 v_uv;
out vec4 color;
void main() {
  vec2 previousUv = v_uv * u_uv_scale + u_uv_offset;
  float inside = step(0.0, previousUv.x) * step(previousUv.x, 1.0) * step(0.0, previousUv.y) * step(previousUv.y, 1.0);
  vec4 previous = texture(u_trail, clamp(previousUv, vec2(0.0), vec2(1.0)));
  color = max(vec4(0.0), previous * u_fade - vec4(u_floor)) * inside;
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

export interface ParticleBounds {
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

export interface ParticleLife {
  age: number
  travelled: number
  distance: number
  remaining: number
}

type UniformMap<Name extends string> = Record<Name, WebGLUniformLocation | null>

export class WindLayer implements CustomLayerInterface {
  readonly id = 'motregen-wind'
  readonly type = 'custom' as const
  readonly renderingMode = '2d' as const
  private map?: MapLibreMap
  private gl?: WebGL2RenderingContext
  private segmentProgram?: WebGLProgram
  private fadeProgram?: WebGLProgram
  private compositeProgram?: WebGLProgram
  private segmentUniforms?: UniformMap<'matrix' | 'target' | 'extent' | 'halfWidth' | 'head' | 'visibility' | 'contrast'>
  private fadeUniforms?: UniformMap<'trail' | 'fade' | 'floor' | 'uvScale' | 'uvOffset'>
  private compositeUniforms?: UniformMap<'trail' | 'opacity'>
  // Eigen VAO's: instance-divisors en attribuutbindings zijn VAO-state en mogen die van MapLibre niet raken.
  private segmentArray?: WebGLVertexArrayObject
  private fadeArray?: WebGLVertexArrayObject
  private compositeArray?: WebGLVertexArrayObject
  private instanceBuffer?: WebGLBuffer
  private screenBuffer?: WebGLBuffer
  private trails?: [TrailTarget, TrailTarget]
  private trailIndex = 0
  private trailWidth = 0
  private trailHeight = 0
  private trailView?: TrailView
  private left?: Float32Array
  private right?: Float32Array
  private mix = 0
  private east = 0
  private north = 0
  private x = new Float32Array(MAX_PARTICLES)
  private y = new Float32Array(MAX_PARTICLES)
  private ages = new Float32Array(MAX_PARTICLES)
  private travelled = new Float32Array(MAX_PARTICLES)
  private distances = new Float32Array(MAX_PARTICLES)
  private instanceData = new ArrayBuffer(MAX_PARTICLES * INSTANCE_BYTES)
  private instanceFloats = new Float32Array(this.instanceData)
  private instanceBytes = new Uint8Array(this.instanceData)
  private life: ParticleLife = { age: 0, travelled: 0, distance: 0, remaining: 0 }
  private color = new Float32Array(3)
  private active = MIN_PARTICLES
  private target = MIN_PARTICLES
  private randomState = 0x6d2b79f5
  private cellCounts = new Uint16Array(MAX_PARTICLES * 2)
  private columns = 1
  private rows = 1
  private previousTime = 0
  private repaintFrame?: number
  /** Gezet door een `LayerOverlay`: die tekent de windcanvas zelf (met de fps-grens). */
  requestRepaint?: () => void
  private frameTotal = 0
  private frameCount = 0
  private particleBounds: ParticleBounds = { west: 0, north: 0, east: 1, south: 1 }
  private tuning: WindTuning
  private readonly viewportChanged = () => this.resetViewport()

  constructor(private readonly grid: Grid, private theme: MapTheme, tuning: WindTuning = DEFAULT_WIND_TUNING) {
    this.tuning = { ...tuning }
    for (let index = 0; index < MAX_PARTICLES; index++) this.respawn(index, this.random() * INITIAL_STAGGER_SECONDS)
  }

  onAdd(map: MapLibreMap, context: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map
    const gl = this.gl = context as WebGL2RenderingContext
    const segment = this.segmentProgram = link(gl, segmentVertexSource, segmentFragmentSource)
    const fade = this.fadeProgram = link(gl, screenVertexSource, fadeFragmentSource)
    const composite = this.compositeProgram = link(gl, screenVertexSource, compositeFragmentSource)
    this.segmentUniforms = uniforms(gl, segment, {
      matrix: 'u_matrix', target: 'u_target', extent: 'u_extent', halfWidth: 'u_half_width', head: 'u_head', visibility: 'u_visibility', contrast: 'u_contrast',
    })
    this.fadeUniforms = uniforms(gl, fade, { trail: 'u_trail', fade: 'u_fade', floor: 'u_floor', uvScale: 'u_uv_scale', uvOffset: 'u_uv_offset' })
    this.compositeUniforms = uniforms(gl, composite, { trail: 'u_trail', opacity: 'u_opacity' })

    this.segmentArray = gl.createVertexArray()!
    gl.bindVertexArray(this.segmentArray)
    this.instanceBuffer = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, this.instanceData.byteLength, gl.DYNAMIC_DRAW)
    for (const [name, size, type, normalized, offset] of [
      ['a_from', 2, gl.FLOAT, false, 0],
      ['a_to', 2, gl.FLOAT, false, 8],
      ['a_color', 4, gl.UNSIGNED_BYTE, true, 16],
    ] as const) {
      const location = gl.getAttribLocation(segment, name)
      gl.enableVertexAttribArray(location)
      gl.vertexAttribPointer(location, size, type, normalized, INSTANCE_BYTES, offset)
      gl.vertexAttribDivisor(location, 1)
    }
    this.screenBuffer = gl.createBuffer()!
    this.fadeArray = screenArray(gl, fade, this.screenBuffer, true)
    this.compositeArray = screenArray(gl, composite, this.screenBuffer, false)
    gl.bindVertexArray(null)
    this.ensureTrailTargets()
    map.on('move', this.viewportChanged)
    map.on('resize', this.viewportChanged)
    this.resetViewport(true)
    ;(globalThis as { __motregenWind?: WindLayer }).__motregenWind = this
  }

  onRemove(): void {
    const gl = this.gl
    if (!gl) return
    if (this.repaintFrame !== undefined) cancelAnimationFrame(this.repaintFrame)
    this.repaintFrame = undefined
    this.map?.off('move', this.viewportChanged)
    this.map?.off('resize', this.viewportChanged)
    for (const buffer of [this.instanceBuffer, this.screenBuffer]) if (buffer) gl.deleteBuffer(buffer)
    for (const array of [this.segmentArray, this.fadeArray, this.compositeArray]) if (array) gl.deleteVertexArray(array)
    for (const program of [this.segmentProgram, this.fadeProgram, this.compositeProgram]) if (program) gl.deleteProgram(program)
    this.deleteTrailTargets()
    this.instanceBuffer = undefined
    this.screenBuffer = undefined
    this.segmentArray = undefined
    this.fadeArray = undefined
    this.compositeArray = undefined
    this.segmentProgram = undefined
    this.fadeProgram = undefined
    this.compositeProgram = undefined
    this.trailView = undefined
    this.gl = undefined
    this.map = undefined
  }

  /** Meethaak (U3b): spreidingsindex van de zichtbare koppen over een celraster van het beeld. */
  dispersion(columns = 12, rows = 12): { particles: number; dispersion: number } {
    const bounds = this.particleBounds
    const xs: number[] = []
    const ys: number[] = []
    for (let index = 0; index < this.active; index++) {
      if (this.ages[index]! <= 0 || this.instanceBytes[index * INSTANCE_BYTES + 19] === 0) continue
      xs.push((this.x[index]! - bounds.west) / (bounds.east - bounds.west))
      ys.push((this.y[index]! - bounds.north) / (bounds.south - bounds.north))
    }
    return { particles: xs.length, dispersion: cellDispersion(xs, ys, xs.length, columns, rows) }
  }

  setFrames(left: Float32Array, right: Float32Array, mix: number): void {
    this.left = left
    this.right = right
    this.mix = mix
  }

  setTheme(theme: MapTheme): void {
    if (theme === this.theme) return
    this.theme = theme
    this.clearTrails()
    this.repaint()
  }

  setTuning(tuning: WindTuning): void {
    const previousActive = this.active
    this.tuning = { ...tuning }
    if (!this.map) return
    this.ensureTrailTargets()
    const canvas = this.map.getCanvas()
    this.target = particleCountForViewport(canvas.clientWidth, canvas.clientHeight, tuning.particlesPerMegapixel)
    this.active = this.target
    for (let index = previousActive; index < this.active; index++) this.respawn(index, this.random() * INITIAL_STAGGER_SECONDS)
    this.repaint()
  }

  get maxFps(): number {
    return this.tuning.maxFps
  }

  private repaint(): void {
    if (this.requestRepaint) this.requestRepaint()
    else this.map?.triggerRepaint()
  }

  render(context: WebGLRenderingContext | WebGL2RenderingContext, options: CustomRenderMethodInput): void {
    const gl = context as WebGL2RenderingContext
    // Onzichtbaar: geen frame en geen volgende aanvraag; setTuning/setTheme wekken weer.
    if (this.tuning.intensity * Math.min(this.tuning.visibility, 1) <= 0) { this.previousTime = 0; return }
    this.ensureTrailTargets()
    if (!this.map || !this.trails || !this.segmentArray || !this.fadeArray || !this.compositeArray || !this.left || !this.right) return
    const now = performance.now()
    const elapsed = this.previousTime ? Math.min(40, now - this.previousTime) : 16
    this.previousTime = now
    const seconds = elapsed / 1_000
    this.adjustBudget(elapsed)
    const worldPx = WORLD_TILE_SIZE * 2 ** this.map.getZoom()
    this.advance(seconds, worldPx)

    const viewport = gl.getParameter(gl.VIEWPORT) as Int32Array
    const framebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
    const depthEnabled = gl.isEnabled(gl.DEPTH_TEST)
    const scissorEnabled = gl.isEnabled(gl.SCISSOR_TEST)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.SCISSOR_TEST)

    const previous = this.trails[this.trailIndex]
    const nextIndex = 1 - this.trailIndex
    const next = this.trails[nextIndex]!
    const currentView = this.currentTrailView()
    const transform = trailUvTransform(this.trailView ?? currentView, currentView)
    gl.bindFramebuffer(gl.FRAMEBUFFER, next.framebuffer)
    gl.viewport(0, 0, this.trailWidth, this.trailHeight)
    gl.disable(gl.BLEND)
    gl.useProgram(this.fadeProgram!)
    gl.bindVertexArray(this.fadeArray)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, previous.texture)
    gl.uniform1i(this.fadeUniforms!.trail, 0)
    gl.uniform1f(this.fadeUniforms!.fade, bufferDecay(this.tuning.bufferFade, seconds) * transform.retention)
    gl.uniform1f(this.fadeUniforms!.floor, trailFloor(seconds))
    gl.uniform2f(this.fadeUniforms!.uvScale, transform.scaleX, transform.scaleY)
    gl.uniform2f(this.fadeUniforms!.uvOffset, transform.offsetX, transform.offsetY)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    const halfWidth = this.tuning.lineWidth / 2 * this.trailWidth / Math.max(1, this.map.getCanvas().width)
    gl.useProgram(this.segmentProgram!)
    gl.bindVertexArray(this.segmentArray)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer!)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceBytes, 0, this.active * INSTANCE_BYTES)
    const segmentUniforms = this.segmentUniforms!
    gl.uniformMatrix4fv(segmentUniforms.matrix, false, options.defaultProjectionData.mainMatrix)
    gl.uniform2f(segmentUniforms.target, this.trailWidth, this.trailHeight)
    gl.uniform1f(segmentUniforms.extent, halfWidth + 1)
    gl.uniform1f(segmentUniforms.halfWidth, halfWidth)
    gl.uniform1f(segmentUniforms.head, this.tuning.headIntensity)
    gl.uniform1f(segmentUniforms.visibility, this.tuning.visibility)
    const contrast = this.theme === 'dark' ? 1 : 0
    gl.uniform3f(segmentUniforms.contrast, contrast, contrast, contrast)
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.active)
    this.trailIndex = nextIndex
    this.trailView = currentView

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.viewport(viewport[0]!, viewport[1]!, viewport[2]!, viewport[3]!)
    gl.useProgram(this.compositeProgram!)
    gl.bindVertexArray(this.compositeArray)
    gl.bindTexture(gl.TEXTURE_2D, next.texture)
    gl.uniform1i(this.compositeUniforms!.trail, 0)
    gl.uniform1f(this.compositeUniforms!.opacity, this.tuning.intensity * Math.min(this.tuning.visibility, 1))
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.bindVertexArray(null)
    if (depthEnabled) gl.enable(gl.DEPTH_TEST)
    if (scissorEnabled) gl.enable(gl.SCISSOR_TEST)
    if (this.requestRepaint) this.requestRepaint()
    else this.requestNextFrame(now)
  }

  /**
   * Volgende windframe op hooguit `maxFps`: tussenliggende vsyncs krijgen alleen een lege
   * rAF-callback (geen kaartrender), zodat de hele kaart niet op 120 Hz meedraait.
   */
  private requestNextFrame(renderedAt: number): void {
    if (this.repaintFrame !== undefined) return
    const interval = 1_000 / this.tuning.maxFps
    const tick = (time: number) => {
      this.repaintFrame = undefined
      if (!this.map) return
      // Halve vsync speling: bij 60 fps op 120 Hz valt elke tweede vsync net vóór de grens.
      if (time - renderedAt < interval - 4) { this.repaintFrame = requestAnimationFrame(tick); return }
      this.map.triggerRepaint()
    }
    this.repaintFrame = requestAnimationFrame(tick)
  }

  private advance(seconds: number, worldPx: number): void {
    const tuning = this.tuning
    const gridWidth = this.grid.dx * this.grid.width
    const gridHeight = this.grid.dy * this.grid.height
    const advectionScale = ADVECTION_SCALE * tuning.speed * windZoomCompensation(this.map?.getZoom() ?? WIND_REFERENCE_ZOOM)
    const unitX = gridWidth * MERCATOR_SCALE
    const unitY = -gridHeight * MERCATOR_SCALE
    const life = this.life
    const floats = this.instanceFloats
    this.countCells()
    for (let index = 0; index < this.active; index++) {
      const oldX = this.x[index]!
      const oldY = this.y[index]!
      life.age = this.ages[index]!
      life.travelled = this.travelled[index]!
      life.distance = this.distances[index]!
      let nextX = oldX
      let nextY = oldY
      let stepPx = 0
      let speed = 0
      if (life.age + seconds > 0 && this.sampleWind(oldX, oldY)) {
        nextX += this.east * seconds * advectionScale / Math.abs(gridWidth)
        nextY -= this.north * seconds * advectionScale / Math.abs(gridHeight)
        stepPx = Math.hypot((nextX - oldX) * unitX, (nextY - oldY) * unitY) * worldPx
        speed = Math.hypot(this.east, this.north)
      }
      const outside = nextX < this.particleBounds.west || nextX > this.particleBounds.east ||
        nextY < this.particleBounds.north || nextY > this.particleBounds.south
      const offset = index * INSTANCE_BYTES / 4
      if (outside || !advanceLife(life, stepPx, seconds, tuning)) {
        this.leaveCell(oldX, oldY)
        this.respawn(index, 0)
        this.instanceBytes[index * INSTANCE_BYTES + 19] = 0
        continue
      }
      this.x[index] = nextX
      this.y[index] = nextY
      this.ages[index] = life.age
      this.travelled[index] = life.travelled
      floats[offset] = floats[offset + 2]!
      floats[offset + 1] = floats[offset + 3]!
      floats[offset + 2] = 0.5 + (this.grid.x0 + gridWidth * nextX) * MERCATOR_SCALE
      floats[offset + 3] = 0.5 - (this.grid.y0 + gridHeight * nextY) * MERCATOR_SCALE
      setWindColor(speed, this.theme, this.color)
      const byte = index * INSTANCE_BYTES + 16
      this.instanceBytes[byte] = Math.round(this.color[0]! * 255)
      this.instanceBytes[byte + 1] = Math.round(this.color[1]! * 255)
      this.instanceBytes[byte + 2] = Math.round(this.color[2]! * 255)
      this.instanceBytes[byte + 3] = Math.round(headAlpha(life, tuning) * speedDamping(speed, tuning.speedDamping) * 255)
    }
  }

  private adjustBudget(elapsed: number): void {
    this.frameTotal += elapsed
    this.frameCount++
    if (this.frameCount < 45) return
    const average = this.frameTotal / this.frameCount
    // Tegen het eigen framebudget: een bewust lagere maxFps is geen trage GPU.
    const budget = Math.max(16.7, 1_000 / this.tuning.maxFps)
    if (average > budget * 1.14 && this.active > MIN_PARTICLES) this.active = Math.max(MIN_PARTICLES, Math.floor(this.active * 0.78))
    else if (average < budget * 1.03 && this.active < this.target) {
      const previousActive = this.active
      this.active = Math.min(this.target, this.active + Math.max(12, Math.floor(this.target * 0.06)))
      for (let index = previousActive; index < this.active; index++) this.respawn(index, this.random() * INITIAL_STAGGER_SECONDS)
    }
    this.frameTotal = 0
    this.frameCount = 0
  }

  // Respawn in de leegste cel van een raster met
  // ~1 particle per cel, op een gejitterde positie: gelijkmatige koppendichtheid
  // zonder zichtbaar raster. Dat maakt de inkt ∝ windsnelheid; speedDamping
  // compenseert dat in de kopintensiteit.
  private respawn(index: number, delaySeconds: number): void {
    const bounds = this.particleBounds
    let cell = 0
    const [x, y] = pickSpawn(SPAWN_ATTEMPTS, () => {
      cell = leastOccupiedCell(this.cellCounts, this.columns * this.rows, this.random())
      const [u, v] = jitteredCellPoint(cell, this.columns, this.rows, this.tuning.spawnJitter, () => this.random())
      return [bounds.west + u * (bounds.east - bounds.west), bounds.north + v * (bounds.south - bounds.north)]
    }, () => this.random(), (candidateX, candidateY) => !this.left || this.sampleWind(candidateX, candidateY) ? 1 : 0)
    this.cellCounts[cell]!++
    this.x[index] = x
    this.y[index] = y
    this.ages[index] = -delaySeconds
    this.travelled[index] = 0
    // ±20 %: anders sterft een homogeen zeeveld in synchrone golven.
    this.distances[index] = this.tuning.trailDistance * (0.8 + this.random() * 0.4)
    const offset = index * INSTANCE_BYTES / 4
    this.instanceFloats[offset + 2] = 0.5 + (this.grid.x0 + this.grid.dx * this.grid.width * x) * MERCATOR_SCALE
    this.instanceFloats[offset + 3] = 0.5 - (this.grid.y0 + this.grid.dy * this.grid.height * y) * MERCATOR_SCALE
  }

  private resetViewport(resetAll = false): void {
    if (!this.map) return
    this.ensureTrailTargets()
    const previousBounds = this.particleBounds
    const nextBounds = particleBounds(this.map, this.grid)
    const retention = viewportParticleRetention(previousBounds, nextBounds)
    this.particleBounds = nextBounds
    const canvas = this.map.getCanvas()
    const previousActive = this.active
    this.target = particleCountForViewport(canvas.clientWidth, canvas.clientHeight, this.tuning.particlesPerMegapixel)
    this.active = this.target
    ;[this.columns, this.rows] = occupancyGrid(canvas.clientWidth, canvas.clientHeight, this.target)
    this.countCells()
    for (let index = 0; index < this.active; index++) {
      const outside = this.x[index]! < this.particleBounds.west || this.x[index]! > this.particleBounds.east ||
        this.y[index]! < this.particleBounds.north || this.y[index]! > this.particleBounds.south
      if (resetAll || index >= previousActive || outside || (retention < 1 && this.random() > retention)) {
        if (!resetAll && index < previousActive) this.leaveCell(this.x[index]!, this.y[index]!)
        this.respawn(index, this.random() * INITIAL_STAGGER_SECONDS)
        this.instanceBytes[index * INSTANCE_BYTES + 19] = 0
      }
    }
    if (resetAll) this.clearTrails()
  }

  private countCells(): void {
    this.cellCounts.fill(0, 0, this.columns * this.rows)
    for (let index = 0; index < this.active; index++) {
      const cell = this.cellOf(this.x[index]!, this.y[index]!)
      if (cell >= 0) this.cellCounts[cell]!++
    }
  }

  private leaveCell(x: number, y: number): void {
    const cell = this.cellOf(x, y)
    if (cell >= 0 && this.cellCounts[cell]! > 0) this.cellCounts[cell]!--
  }

  private cellOf(x: number, y: number): number {
    const bounds = this.particleBounds
    const u = (x - bounds.west) / (bounds.east - bounds.west)
    const v = (y - bounds.north) / (bounds.south - bounds.north)
    return u >= 0 && u < 1 && v >= 0 && v < 1 ? Math.floor(v * this.rows) * this.columns + Math.floor(u * this.columns) : -1
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
    const scale = Math.min(1, this.tuning.bufferDpr / Math.max(1e-3, this.map.getPixelRatio()))
    const [width, height] = trailTargetSize(canvas.width, canvas.height, this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE) as number, scale)
    if (width === this.trailWidth && height === this.trailHeight && this.trails) return
    this.deleteTrailTargets()
    this.trailWidth = width
    this.trailHeight = height
    this.trails = [createTrailTarget(this.gl, width, height), createTrailTarget(this.gl, width, height)]
    this.trailIndex = 0
    this.clearTrails()
  }

  private deleteTrailTargets(): void {
    for (const target of this.trails ?? []) {
      this.gl?.deleteFramebuffer(target.framebuffer)
      this.gl?.deleteTexture(target.texture)
    }
    this.trails = undefined
    this.trailWidth = 0
    this.trailHeight = 0
  }

  private clearTrails(): void {
    const gl = this.gl
    if (!gl || !this.trails || !this.map) return
    const framebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
    const viewport = gl.getParameter(gl.VIEWPORT) as Int32Array
    const clearColor = gl.getParameter(gl.COLOR_CLEAR_VALUE) as Float32Array
    const scissorEnabled = gl.isEnabled(gl.SCISSOR_TEST)
    gl.disable(gl.SCISSOR_TEST)
    gl.viewport(0, 0, this.trailWidth, this.trailHeight)
    gl.clearColor(0, 0, 0, 0)
    for (const trail of this.trails) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, trail.framebuffer)
      gl.clear(gl.COLOR_BUFFER_BIT)
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.viewport(viewport[0]!, viewport[1]!, viewport[2]!, viewport[3]!)
    gl.clearColor(clearColor[0]!, clearColor[1]!, clearColor[2]!, clearColor[3]!)
    if (scissorEnabled) gl.enable(gl.SCISSOR_TEST)
    this.trailView = this.currentTrailView()
  }

  private sampleWind(x: number, y: number): boolean {
    const left = this.left
    const right = this.right
    if (!left || !right) return false
    const column = Math.max(0, Math.min(this.grid.width - 1, Math.round(x * (this.grid.width - 1))))
    const row = Math.max(0, Math.min(this.grid.height - 1, Math.round(y * (this.grid.height - 1))))
    const offset = (row * this.grid.width + column) * 2
    this.east = left[offset]! * (1 - this.mix) + right[offset]! * this.mix
    this.north = left[offset + 1]! * (1 - this.mix) + right[offset + 1]! * this.mix
    return Number.isFinite(this.east) && Number.isFinite(this.north)
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

/**
 * Leeftijdsstap van één particle. Hij sterft zodra hij `life.distance` heeft
 * afgelegd of `maxAge` bereikt; `remaining` is de afstand die hem nog rest,
 * voor maxAge geschat met de huidige snelheid. Geeft false als hij dood is.
 */
export function advanceLife(life: ParticleLife, stepPx: number, seconds: number, tuning: Pick<WindTuning, 'maxAge'>): boolean {
  life.age += seconds
  if (life.age <= 0) {
    life.remaining = life.distance
    return true
  }
  life.travelled += stepPx
  const speed = seconds > 0 ? stepPx / seconds : 0
  life.remaining = Math.min(life.distance - life.travelled, speed * Math.max(0, tuning.maxAge - life.age))
  return life.remaining > 0
}

/** Kopintensiteit: loopt op over de eerste fadeInPx en af over de laatste fadeOutPx; de buffer doet de rest. */
export function headAlpha(life: ParticleLife, tuning: Pick<WindTuning, 'fadeInPx' | 'fadeOutPx'>): number {
  if (life.age <= 0 || life.remaining <= 0) return 0
  const fadeIn = tuning.fadeInPx > 0 ? Math.min(1, life.travelled / tuning.fadeInPx) : 1
  const fadeOut = tuning.fadeOutPx > 0 ? Math.min(1, life.remaining / tuning.fadeOutPx) : 1
  return smooth(fadeIn) * smooth(fadeOut)
}

export function expectedLifetime(speedPx: number, tuning: Pick<WindTuning, 'trailDistance' | 'maxAge'>): number {
  return speedPx > 0 ? Math.min(tuning.maxAge, tuning.trailDistance / speedPx) : tuning.maxAge
}

/**
 * Kopdemping voor harde wind. Iedere particle legt ~dezelfde inkt per leven
 * neer, en bij gelijkmatige koppendichtheid respawnen snelle particles vaker:
 * inkt per oppervlak ∝ snelheid. Demping (v_ref/v)^γ boven v_ref heft dat bij
 * γ = 1 op; zeestrepen worden zachter in plaats van schaarser.
 */
export function speedDamping(windSpeed: number, gamma: number): number {
  return windSpeed > DAMPING_REFERENCE_SPEED ? (DAMPING_REFERENCE_SPEED / windSpeed) ** gamma : 1
}

/**
 * Neemt de eerste kandidaat die `acceptance` (kans 0–1) haalt; na `attempts`
 * pogingen de laatste, zodat een respawn altijd begrensd is.
 */
export function pickSpawn(attempts: number, candidate: () => [number, number], random: () => number, acceptance: (x: number, y: number) => number): [number, number] {
  let x = 0
  let y = 0
  for (let attempt = 0; attempt < attempts; attempt++) {
    [x, y] = candidate()
    if (random() < acceptance(x, y)) break
  }
  return [x, y]
}

/** Raster van ~`target` bijna vierkante cellen over een beeld van width×height. */
export function occupancyGrid(width: number, height: number, target: number): [number, number] {
  const columns = Math.max(1, Math.round(Math.sqrt(target * Math.max(1, width) / Math.max(1, height))))
  return [columns, Math.max(1, Math.round(target / columns))]
}

/** De leegste cel; bij gelijkspel de eerste vanaf een willekeurig startpunt (`start` in [0, 1)). */
export function leastOccupiedCell(counts: ArrayLike<number>, cells: number, start: number): number {
  const offset = Math.floor(start * cells)
  let best = offset
  for (let step = 1; step < cells && counts[best]! > 0; step++) {
    const cell = (offset + step) % cells
    if (counts[cell]! < counts[best]!) best = cell
  }
  return best
}

/**
 * Punt binnen `cell` in het eenheidsvierkant: j = 0 is het celmidden, j = 1
 * uniform over de cel. De jitter blijft binnen de cel, anders vult de respawn
 * de gekozen lege cel niet en valt de gelijkmatigheid weg.
 */
export function jitteredCellPoint(cell: number, columns: number, rows: number, jitter: number, random: () => number): [number, number] {
  const amplitude = Math.max(0, Math.min(1, jitter))
  return [
    (cell % columns + 0.5 + amplitude * (random() - 0.5)) / columns,
    (Math.floor(cell / columns) + 0.5 + amplitude * (random() - 0.5)) / rows,
  ]
}

/** Spreidingsindex (variantie/gemiddelde) van aantallen per cel; ~1 bij uniform random, lager is gelijkmatiger. */
export function cellDispersion(xs: ArrayLike<number>, ys: ArrayLike<number>, count: number, columns: number, rows: number): number {
  const cells = new Float64Array(columns * rows)
  let inside = 0
  for (let index = 0; index < count; index++) {
    const x = xs[index]!
    const y = ys[index]!
    if (!(x >= 0 && x < 1 && y >= 0 && y < 1)) continue
    cells[Math.floor(y * rows) * columns + Math.floor(x * columns)]!++
    inside++
  }
  const mean = inside / cells.length
  if (mean === 0) return 0
  let variance = 0
  for (const value of cells) variance += (value - mean) ** 2
  return variance / cells.length / mean
}

/** Framefactor van de buffer-fade: `restPerSecond` blijft na één seconde over, ongeacht de framerate. */
export function bufferDecay(restPerSecond: number, seconds: number): number {
  return Math.max(0, restPerSecond) ** Math.max(0, seconds)
}

// Per frame minstens 0,6/255 zodat v·d − vloer ook bij 120 Hz nog onder v − ½/255
// uitkomt en afronding een pixel nooit op zijn waarde laat hangen.
export function trailFloor(seconds: number): number {
  return Math.max(0.6, seconds * 60) / 255
}

export function trailTargetSize(canvasWidth: number, canvasHeight: number, maxTextureSize: number, scale = 1): [number, number] {
  const width = Math.max(1, Math.round(canvasWidth * scale))
  const height = Math.max(1, Math.round(canvasHeight * scale))
  const clamp = Math.min(1, maxTextureSize / Math.max(width, height))
  return [Math.max(1, Math.round(width * clamp)), Math.max(1, Math.round(height * clamp))]
}

export function trailUvTransform(previous: TrailView, current: TrailView): { scaleX: number; scaleY: number; offsetX: number; offsetY: number; retention: number } {
  const zoomScale = 2 ** (previous.zoom - current.zoom)
  const scaleX = zoomScale * current.width / previous.width
  const scaleY = zoomScale * current.height / previous.height
  const previousWorldSize = WORLD_TILE_SIZE * 2 ** previous.zoom
  return {
    scaleX,
    scaleY,
    offsetX: 0.5 * (1 - scaleX) + (current.centerX - previous.centerX) * previousWorldSize / previous.width,
    offsetY: 0.5 * (1 - scaleY) - (current.centerY - previous.centerY) * previousWorldSize / previous.height,
    retention: Math.min(1, 1 / (zoomScale * zoomScale)),
  }
}

export function loadWindTuning(storage: Pick<Storage, 'getItem'> | undefined = globalThis.localStorage): WindTuning {
  try {
    const stored = storage?.getItem(WIND_TUNING_STORAGE_KEY)
    return sanitizeWindTuning(stored ? JSON.parse(stored) as unknown : undefined)
  } catch {
    return { ...DEFAULT_WIND_TUNING }
  }
}

// Defaults worden niet weggeschreven, zodat latere default-wijzigingen
// gebruikers bereiken die nooit aan de knoppen zaten.
export function storeWindTuning(tuning: WindTuning, storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined = globalThis.localStorage): void {
  try {
    const custom = WIND_TUNING_CONTROLS.some((control) => tuning[control.key] !== DEFAULT_WIND_TUNING[control.key])
    if (custom) storage?.setItem(WIND_TUNING_STORAGE_KEY, JSON.stringify(tuning))
    else storage?.removeItem(WIND_TUNING_STORAGE_KEY)
  } catch {
    // opslag vol of geblokkeerd: tuning blijft voor deze sessie gelden
  }
}

export function sanitizeWindTuning(value: unknown): WindTuning {
  const tuning = { ...DEFAULT_WIND_TUNING }
  if (!value || typeof value !== 'object') return tuning
  for (const control of WIND_TUNING_CONTROLS) {
    const candidate = (value as Record<string, unknown>)[control.key]
    if (typeof candidate === 'number' && Number.isFinite(candidate)) tuning[control.key] = Math.max(control.min, Math.min(control.max, candidate))
  }
  return tuning
}

export function windColor(speed: number, theme: MapTheme): [number, number, number] {
  const color = new Float32Array(3)
  setWindColor(speed, theme, color)
  return [color[0]!, color[1]!, color[2]!]
}

/** Schermsnelheid in CSS-px/s van `windSpeed` m/s; zoomonafhankelijk door windZoomCompensation. */
export function windScreenSpeed(windSpeed: number, speedScale = 1): number {
  return windSpeed * ADVECTION_SCALE * speedScale * MERCATOR_SCALE * WORLD_TILE_SIZE * 2 ** WIND_REFERENCE_ZOOM
}

export function particleCountForViewport(width: number, height: number, particlesPerMegapixel = WIND_PARTICLES_PER_MEGAPIXEL): number {
  const count = Math.round(Math.max(0, width) * Math.max(0, height) / 1_000_000 * particlesPerMegapixel)
  return Math.max(MIN_PARTICLES, Math.min(MAX_PARTICLES, count))
}

export function windZoomCompensation(zoom: number): number {
  return 2 ** (WIND_REFERENCE_ZOOM - zoom)
}

export function viewportParticleRetention(previous: ParticleBounds, current: ParticleBounds): number {
  const previousArea = Math.max(0, previous.east - previous.west) * Math.max(0, previous.south - previous.north)
  const currentArea = Math.max(0, current.east - current.west) * Math.max(0, current.south - current.north)
  return currentArea > previousArea && currentArea > 0 ? previousArea / currentArea : 1
}

function smooth(value: number): number {
  return value * value * (3 - 2 * value)
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

function createTrailTarget(gl: WebGL2RenderingContext, width: number, height: number): TrailTarget {
  const texture = gl.createTexture()!
  gl.bindTexture(gl.TEXTURE_2D, texture)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
  const previous = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
  const framebuffer = gl.createFramebuffer()!
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) throw new Error('Wind-trail-framebuffer is onvolledig')
  gl.bindFramebuffer(gl.FRAMEBUFFER, previous)
  return { texture, framebuffer }
}

function screenArray(gl: WebGL2RenderingContext, program: WebGLProgram, buffer: WebGLBuffer, upload: boolean): WebGLVertexArrayObject {
  const array = gl.createVertexArray()!
  gl.bindVertexArray(array)
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
  if (upload) gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
  const location = gl.getAttribLocation(program, 'a_pos')
  gl.enableVertexAttribArray(location)
  gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0)
  return array
}

function uniforms<Name extends string>(gl: WebGL2RenderingContext, program: WebGLProgram, names: Record<Name, string>): UniformMap<Name> {
  const locations = {} as UniformMap<Name>
  for (const key of Object.keys(names) as Name[]) locations[key] = gl.getUniformLocation(program, names[key])
  return locations
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
