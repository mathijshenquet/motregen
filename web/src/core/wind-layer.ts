import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl'
import type { MapTheme } from './basemap'
import type { Grid } from './contract'

export const WIND_PARTICLES_PER_MEGAPIXEL = 620
export const WIND_REFERENCE_ZOOM = 6.4
export const WIND_TUNING_STORAGE_KEY = 'motregen-wind-tuning'

// Staartlengte is een schermafstand (CSS-px), niet een fadetijd: iedere
// particle legt ongeveer `trailDistance` af en snelheid wordt tempo.
export interface WindTuning {
  particlesPerMegapixel: number
  trailDistance: number
  minTrail: number
  minAge: number
  maxAge: number
  fadeIn: number
  fadeOut: number
  taper: number
  speed: number
  lineWidth: number
  trailOpacity: number
  intensity: number
  visibility: number
}

export const DEFAULT_WIND_TUNING: WindTuning = {
  particlesPerMegapixel: WIND_PARTICLES_PER_MEGAPIXEL,
  trailDistance: 80,
  minTrail: 24,
  minAge: 0.6,
  maxAge: 4,
  fadeIn: 0.25,
  fadeOut: 0.35,
  taper: 1,
  speed: 1,
  lineWidth: 1.25,
  trailOpacity: 0.6,
  intensity: 0.8,
  visibility: 1,
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
  { key: 'trailDistance', label: 'Trailafstand', min: 10, max: 300, step: 5, unit: 'px' },
  { key: 'minTrail', label: 'Min. trail', min: 0, max: 150, step: 1, unit: 'px' },
  { key: 'minAge', label: 'Min. leeftijd', min: 0.1, max: 5, step: 0.05, unit: 's' },
  { key: 'maxAge', label: 'Max. leeftijd', min: 0.5, max: 15, step: 0.1, unit: 's' },
  { key: 'fadeIn', label: 'Fade-in', min: 0, max: 2, step: 0.05, unit: 's' },
  { key: 'fadeOut', label: 'Fade-out', min: 0, max: 2, step: 0.05, unit: 's' },
  { key: 'taper', label: 'Staartverloop', min: 0, max: 1, step: 0.05 },
  { key: 'speed', label: 'Tempo', min: 0.2, max: 3, step: 0.05, unit: '×' },
  { key: 'lineWidth', label: 'Lijnbreedte', min: 0.25, max: 6, step: 0.05, unit: 'px' },
  { key: 'trailOpacity', label: 'Trail-opacity', min: 0, max: 1, step: 0.01 },
  { key: 'intensity', label: 'Intensiteit', min: 0, max: 2, step: 0.01, unit: '×' },
  { key: 'visibility', label: 'Contrast', min: 0, max: 3, step: 0.1 },
]

const MIN_PARTICLES = 96
const MAX_PARTICLES = 2_400
// Punten per particle-polyline (incl. kop); samen met trailDistance bepaalt
// dit de segmentlengte en daarmee hoe glad bochten zijn.
const TRAIL_POINTS = 16
const VERTEX_BYTES = 20
const ADVECTION_SCALE = 7_000
const WORLD_TILE_SIZE = 512
const INITIAL_STAGGER_SECONDS = 2
const SPAWN_ATTEMPTS = 32
const MERCATOR_SCALE = 1 / (2 * Math.PI * 6_378_137)
const BEAUFORT_STOPS = [0, 3.4, 8, 13.9, 20.8, 32.7] as const
const LIGHT_RAMP = [
  [3, 48, 102], [0, 76, 108], [9, 91, 44], [119, 73, 0], [162, 39, 8], [108, 15, 73],
] as const
const DARK_RAMP = [
  [255, 255, 255], [255, 255, 255], [255, 255, 255], [255, 255, 255], [255, 255, 255], [255, 255, 255],
] as const

// Ieder punt heeft twee vertices (±normaal); de zijde volgt uit gl_VertexID
// zodat de vertex geen aparte attribuut-byte nodig heeft.
const trailVertexSource = `#version 300 es
in vec2 a_pos;
in vec2 a_normal;
in vec4 a_color;
uniform mat4 u_matrix;
uniform float u_world_px;
uniform float u_extent;
out vec4 v_color;
out float v_across;
void main() {
  float side = (gl_VertexID & 1) == 0 ? 1.0 : -1.0;
  // Offset apart door de matrix: bij hoge zoom verdwijnt een optelling bij
  // mercator ~0,5 anders in float32-afronding.
  gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0) + u_matrix * vec4(a_normal * side * u_extent / u_world_px, 0.0, 0.0);
  v_across = side * u_extent;
  v_color = a_color;
}`

const trailFragmentSource = `#version 300 es
precision mediump float;
in vec4 v_color;
in float v_across;
uniform float u_half_width;
uniform float u_aa;
uniform float u_opacity;
uniform float u_visibility;
uniform vec3 u_contrast;
out vec4 color;
void main() {
  float coverage = clamp((u_half_width + 0.5 * u_aa - abs(v_across)) / u_aa, 0.0, 1.0);
  float alpha = v_color.a * coverage * u_opacity * min(u_visibility, 1.0);
  vec3 rgb = mix(v_color.rgb, u_contrast, clamp((u_visibility - 1.0) * 0.5, 0.0, 1.0));
  color = vec4(rgb * alpha, alpha);
}`

export interface ParticleBounds {
  west: number
  north: number
  east: number
  south: number
}

export interface ParticleLife {
  age: number
  travelled: number
  dyingAt: number
  expected: number
}

export class WindLayer implements CustomLayerInterface {
  readonly id = 'motregen-wind'
  readonly type = 'custom' as const
  readonly renderingMode = '2d' as const
  private map?: MapLibreMap
  private gl?: WebGL2RenderingContext
  private program?: WebGLProgram
  private vertexArray?: WebGLVertexArrayObject
  private vertexBuffer?: WebGLBuffer
  private indexBuffer?: WebGLBuffer
  private uniforms: Record<'matrix' | 'worldPx' | 'extent' | 'halfWidth' | 'aa' | 'opacity' | 'visibility' | 'contrast', WebGLUniformLocation | null> = {
    matrix: null, worldPx: null, extent: null, halfWidth: null, aa: null, opacity: null, visibility: null, contrast: null,
  }
  private left?: Float32Array
  private right?: Float32Array
  private mix = 0
  private east = 0
  private north = 0
  private x = new Float32Array(MAX_PARTICLES)
  private y = new Float32Array(MAX_PARTICLES)
  private historyX = new Float64Array(MAX_PARTICLES * (TRAIL_POINTS - 1))
  private historyY = new Float64Array(MAX_PARTICLES * (TRAIL_POINTS - 1))
  private historyCount = new Uint8Array(MAX_PARTICLES)
  private ages = new Float32Array(MAX_PARTICLES)
  private travelled = new Float32Array(MAX_PARTICLES)
  private dyingAt = new Float32Array(MAX_PARTICLES)
  private expected = new Float32Array(MAX_PARTICLES)
  private jitter = new Float32Array(MAX_PARTICLES)
  private speeds = new Float32Array(MAX_PARTICLES)
  private vertexData = new ArrayBuffer(MAX_PARTICLES * TRAIL_POINTS * 2 * VERTEX_BYTES)
  private vertexFloats = new Float32Array(this.vertexData)
  private vertexBytes = new Uint8Array(this.vertexData)
  private pathX = new Float64Array(TRAIL_POINTS)
  private pathY = new Float64Array(TRAIL_POINTS)
  private trailX = new Float64Array(TRAIL_POINTS)
  private trailY = new Float64Array(TRAIL_POINTS)
  private trailFade = new Float32Array(TRAIL_POINTS)
  private life: ParticleLife = { age: 0, travelled: 0, dyingAt: -1, expected: 0 }
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
    for (let index = 0; index < MAX_PARTICLES; index++) this.respawn(index, this.random() * INITIAL_STAGGER_SECONDS)
  }

  onAdd(map: MapLibreMap, context: WebGLRenderingContext | WebGL2RenderingContext): void {
    this.map = map
    const gl = this.gl = context as WebGL2RenderingContext
    const program = this.program = link(gl, trailVertexSource, trailFragmentSource)
    this.uniforms = {
      matrix: gl.getUniformLocation(program, 'u_matrix'),
      worldPx: gl.getUniformLocation(program, 'u_world_px'),
      extent: gl.getUniformLocation(program, 'u_extent'),
      halfWidth: gl.getUniformLocation(program, 'u_half_width'),
      aa: gl.getUniformLocation(program, 'u_aa'),
      opacity: gl.getUniformLocation(program, 'u_opacity'),
      visibility: gl.getUniformLocation(program, 'u_visibility'),
      contrast: gl.getUniformLocation(program, 'u_contrast'),
    }
    // Eigen VAO: de indexbuffer-binding is VAO-state en mag die van MapLibre niet overschrijven.
    this.vertexArray = gl.createVertexArray()!
    gl.bindVertexArray(this.vertexArray)
    this.vertexBuffer = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer)
    gl.bufferData(gl.ARRAY_BUFFER, this.vertexData.byteLength, gl.DYNAMIC_DRAW)
    const position = gl.getAttribLocation(program, 'a_pos')
    const normal = gl.getAttribLocation(program, 'a_normal')
    const color = gl.getAttribLocation(program, 'a_color')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, VERTEX_BYTES, 0)
    gl.enableVertexAttribArray(normal)
    gl.vertexAttribPointer(normal, 2, gl.FLOAT, false, VERTEX_BYTES, 8)
    gl.enableVertexAttribArray(color)
    gl.vertexAttribPointer(color, 4, gl.UNSIGNED_BYTE, true, VERTEX_BYTES, 16)
    this.indexBuffer = gl.createBuffer()!
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer)
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, trailIndices(MAX_PARTICLES, TRAIL_POINTS), gl.STATIC_DRAW)
    gl.bindVertexArray(null)
    map.on('move', this.viewportChanged)
    map.on('resize', this.viewportChanged)
    this.resetViewport(true)
  }

  onRemove(): void {
    const gl = this.gl
    if (!gl) return
    this.map?.off('move', this.viewportChanged)
    this.map?.off('resize', this.viewportChanged)
    for (const buffer of [this.vertexBuffer, this.indexBuffer]) if (buffer) gl.deleteBuffer(buffer)
    if (this.vertexArray) gl.deleteVertexArray(this.vertexArray)
    if (this.program) gl.deleteProgram(this.program)
    this.vertexBuffer = undefined
    this.indexBuffer = undefined
    this.vertexArray = undefined
    this.program = undefined
    this.gl = undefined
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
    this.map?.triggerRepaint()
  }

  setTuning(tuning: WindTuning): void {
    const previousActive = this.active
    this.tuning = { ...tuning }
    if (!this.map) return
    const canvas = this.map.getCanvas()
    this.target = particleCountForViewport(canvas.clientWidth, canvas.clientHeight, tuning.particlesPerMegapixel)
    this.active = this.target
    for (let index = previousActive; index < this.active; index++) this.respawn(index, this.random() * INITIAL_STAGGER_SECONDS)
    this.map.triggerRepaint()
  }

  render(context: WebGLRenderingContext | WebGL2RenderingContext, options: CustomRenderMethodInput): void {
    const gl = context as WebGL2RenderingContext
    if (!this.map || !this.program || !this.vertexArray || !this.vertexBuffer || !this.left || !this.right) return
    const now = performance.now()
    const elapsed = this.previousTime ? Math.min(40, now - this.previousTime) : 16
    this.previousTime = now
    this.adjustBudget(elapsed)
    const worldPx = WORLD_TILE_SIZE * 2 ** this.map.getZoom()
    this.advance(elapsed / 1_000, worldPx)

    const halfWidth = Math.max(0.05, this.tuning.lineWidth) / 2
    const aa = 1 / Math.max(1, this.map.getPixelRatio())
    const depthEnabled = gl.isEnabled(gl.DEPTH_TEST)
    gl.disable(gl.DEPTH_TEST)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.useProgram(this.program)
    gl.bindVertexArray(this.vertexArray)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertexBytes, 0, this.active * TRAIL_POINTS * 2 * VERTEX_BYTES)
    gl.uniformMatrix4fv(this.uniforms.matrix, false, options.defaultProjectionData.mainMatrix)
    gl.uniform1f(this.uniforms.worldPx, worldPx)
    gl.uniform1f(this.uniforms.extent, halfWidth + aa)
    gl.uniform1f(this.uniforms.halfWidth, halfWidth)
    gl.uniform1f(this.uniforms.aa, aa)
    gl.uniform1f(this.uniforms.opacity, this.tuning.trailOpacity * this.tuning.intensity)
    gl.uniform1f(this.uniforms.visibility, this.tuning.visibility)
    const contrast = this.theme === 'dark' ? 1 : 0
    gl.uniform3f(this.uniforms.contrast, contrast, contrast, contrast)
    gl.drawElements(gl.TRIANGLES, this.active * (TRAIL_POINTS - 1) * 6, gl.UNSIGNED_INT, 0)
    gl.bindVertexArray(null)
    if (depthEnabled) gl.enable(gl.DEPTH_TEST)
    this.map.triggerRepaint()
  }

  private advance(seconds: number, worldPx: number): void {
    const tuning = this.tuning
    const gridWidth = this.grid.dx * this.grid.width
    const gridHeight = this.grid.dy * this.grid.height
    const advectionScale = ADVECTION_SCALE * tuning.speed * windZoomCompensation(this.map?.getZoom() ?? WIND_REFERENCE_ZOOM)
    const unitX = gridWidth * MERCATOR_SCALE
    const unitY = -gridHeight * MERCATOR_SCALE
    const life = this.life
    for (let index = 0; index < this.active; index++) {
      const distance = tuning.trailDistance * this.jitter[index]!
      life.age = this.ages[index]!
      life.travelled = this.travelled[index]!
      life.dyingAt = this.dyingAt[index]!
      life.expected = this.expected[index]!
      let stepPx = 0
      let nextX = this.x[index]!
      let nextY = this.y[index]!
      if (life.age + seconds > 0) {
        if (!this.sampleWind(nextX, nextY)) {
          if (life.dyingAt < 0) life.dyingAt = Math.max(0, life.age)
        } else {
          nextX += this.east * seconds * advectionScale / Math.abs(gridWidth)
          nextY -= this.north * seconds * advectionScale / Math.abs(gridHeight)
          stepPx = Math.hypot((nextX - this.x[index]!) * unitX, (nextY - this.y[index]!) * unitY) * worldPx
          this.speeds[index] = Math.hypot(this.east, this.north)
        }
      }
      const outside = nextX < this.particleBounds.west || nextX > this.particleBounds.east ||
        nextY < this.particleBounds.north || nextY > this.particleBounds.south
      if (outside || !advanceLife(life, stepPx, seconds, distance, tuning)) {
        this.respawn(index, 0)
        this.clearSlot(index)
        continue
      }
      this.x[index] = nextX
      this.y[index] = nextY
      this.ages[index] = life.age
      this.travelled[index] = life.travelled
      this.dyingAt[index] = life.dyingAt
      this.expected[index] = life.expected
      const headX = 0.5 + (this.grid.x0 + gridWidth * nextX) * MERCATOR_SCALE
      const headY = 0.5 - (this.grid.y0 + gridHeight * nextY) * MERCATOR_SCALE
      this.commitHistory(index, headX, headY, distance / (TRAIL_POINTS - 2) / worldPx)
      const alpha = lifeAlpha(life, tuning) * shortTrailAlpha(life.expected, tuning.minTrail)
      if (alpha <= 0) {
        this.clearSlot(index)
        continue
      }
      setWindColor(this.speeds[index]!, this.theme, this.color)
      this.writeSlot(index, headX, headY, distance / worldPx, alpha)
    }
  }

  private commitHistory(index: number, headX: number, headY: number, spacing: number): void {
    const base = index * (TRAIL_POINTS - 1)
    let count = this.historyCount[index]!
    const lastX = this.historyX[base + count - 1]!
    const lastY = this.historyY[base + count - 1]!
    if (Math.hypot(headX - lastX, headY - lastY) < spacing) return
    if (count === TRAIL_POINTS - 1) {
      this.historyX.copyWithin(base, base + 1, base + count)
      this.historyY.copyWithin(base, base + 1, base + count)
      count--
    }
    this.historyX[base + count] = headX
    this.historyY[base + count] = headY
    this.historyCount[index] = count + 1
  }

  private writeSlot(index: number, headX: number, headY: number, maxLength: number, alpha: number): void {
    const base = index * (TRAIL_POINTS - 1)
    const count = this.historyCount[index]!
    const pathX = this.pathX
    const pathY = this.pathY
    pathX[0] = headX
    pathY[0] = headY
    let points = 1
    for (let point = count - 1; point >= 0; point--) {
      const px = this.historyX[base + point]!
      const py = this.historyY[base + point]!
      if (px === pathX[points - 1] && py === pathY[points - 1]) continue
      pathX[points] = px
      pathY[points] = py
      points++
    }
    const length = clipTrail(pathX, pathY, points, maxLength, this.tuning.taper, this.trailX, this.trailY, this.trailFade)
    writeTrailVertices(this.vertexFloats, this.vertexBytes, index * TRAIL_POINTS * 2, this.trailX, this.trailY, this.trailFade, length, alpha, this.color)
  }

  private clearSlot(index: number): void {
    const start = index * TRAIL_POINTS * 2 * VERTEX_BYTES
    this.vertexBytes.fill(0, start, start + TRAIL_POINTS * 2 * VERTEX_BYTES)
  }

  private adjustBudget(elapsed: number): void {
    this.frameTotal += elapsed
    this.frameCount++
    if (this.frameCount < 45) return
    const average = this.frameTotal / this.frameCount
    if (average > 19 && this.active > MIN_PARTICLES) this.active = Math.max(MIN_PARTICLES, Math.floor(this.active * 0.78))
    else if (average < 17.2 && this.active < this.target) {
      const previousActive = this.active
      this.active = Math.min(this.target, this.active + Math.max(12, Math.floor(this.target * 0.06)))
      for (let index = previousActive; index < this.active; index++) this.respawn(index, this.random() * INITIAL_STAGGER_SECONDS)
    }
    this.frameTotal = 0
    this.frameCount = 0
  }

  // Spawnkans ∝ 1/verwachte levensduur:
  // anders hopen particles zich op waar de wind zwak is (lang leven) en loopt
  // harde wind (zee) leeg, en verschuift de snelheidsafhankelijkheid van
  // staartlengte naar dichtheid.
  private respawn(index: number, delaySeconds: number): void {
    const [x, y] = pickSpawn(this.particleBounds, SPAWN_ATTEMPTS, () => this.random(), (candidateX, candidateY) => !this.left ? 1
      : this.sampleWind(candidateX, candidateY) ? spawnAcceptance(windScreenSpeed(Math.hypot(this.east, this.north), this.tuning.speed), this.tuning)
        : 0)
    this.x[index] = x
    this.y[index] = y
    this.ages[index] = -delaySeconds
    this.travelled[index] = 0
    this.dyingAt[index] = -1
    this.expected[index] = 0
    this.jitter[index] = 0.8 + this.random() * 0.4
    const base = index * (TRAIL_POINTS - 1)
    this.historyX[base] = 0.5 + (this.grid.x0 + this.grid.dx * this.grid.width * x) * MERCATOR_SCALE
    this.historyY[base] = 0.5 - (this.grid.y0 + this.grid.dy * this.grid.height * y) * MERCATOR_SCALE
    this.historyCount[index] = 1
  }

  private resetViewport(resetAll = false): void {
    if (!this.map) return
    const previousBounds = this.particleBounds
    const nextBounds = particleBounds(this.map, this.grid)
    const retention = viewportParticleRetention(previousBounds, nextBounds)
    this.particleBounds = nextBounds
    const canvas = this.map.getCanvas()
    const previousActive = this.active
    this.target = particleCountForViewport(canvas.clientWidth, canvas.clientHeight, this.tuning.particlesPerMegapixel)
    this.active = this.target
    for (let index = 0; index < this.active; index++) {
      const outside = this.x[index]! < this.particleBounds.west || this.x[index]! > this.particleBounds.east ||
        this.y[index]! < this.particleBounds.north || this.y[index]! > this.particleBounds.south
      if (resetAll || index >= previousActive || outside || (retention < 1 && this.random() > retention)) {
        this.respawn(index, this.random() * INITIAL_STAGGER_SECONDS)
        this.clearSlot(index)
      }
    }
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
 * Leeftijdsstap van één particle. De particle sterft zodra hij zijn doelafstand
 * heeft afgelegd, begrensd door [minAge, maxAge]; de fade-out start zo dat hij
 * precies op dat voorspelde eind op nul staat. Geeft false als hij dood is.
 */
export function advanceLife(life: ParticleLife, stepPx: number, seconds: number, distance: number, tuning: WindTuning): boolean {
  life.age += seconds
  if (life.age <= 0) return true
  life.travelled += stepPx
  const speed = seconds > 0 ? stepPx / seconds : 0
  const remaining = speed > 1e-6 ? Math.max(0, distance - life.travelled) / speed : Infinity
  const end = Math.max(tuning.minAge, Math.min(tuning.maxAge, life.age + remaining))
  life.expected = life.travelled + speed * Math.max(0, end - life.age)
  if (life.dyingAt < 0 && end - life.age <= tuning.fadeOut) life.dyingAt = life.age
  return life.dyingAt < 0 || life.age - life.dyingAt < tuning.fadeOut
}

export function expectedLifetime(speedPx: number, tuning: Pick<WindTuning, 'trailDistance' | 'minAge' | 'maxAge'>): number {
  const travelTime = speedPx > 0 ? tuning.trailDistance / speedPx : Infinity
  return Math.max(tuning.minAge, Math.min(tuning.maxAge, travelTime))
}

/** Spawnkans zodat (spawnkans × levensduur) — de zichtbare dichtheid — niet van windsnelheid afhangt. */
export function spawnAcceptance(speedPx: number, tuning: Pick<WindTuning, 'trailDistance' | 'minAge' | 'maxAge'>): number {
  return tuning.minAge / expectedLifetime(speedPx, tuning)
}

/**
 * Rejection sampling: een kandidaat wordt aangenomen met kans `acceptance`
 * (0–1). Exact zolang een poging slaagt; na `attempts` pogingen valt hij terug
 * op de laatste kandidaat, zodat een respawn altijd begrensd is.
 */
export function pickSpawn(bounds: ParticleBounds, attempts: number, random: () => number, acceptance: (x: number, y: number) => number): [number, number] {
  let x = 0
  let y = 0
  for (let attempt = 0; attempt < attempts; attempt++) {
    x = bounds.west + random() * (bounds.east - bounds.west)
    y = bounds.north + random() * (bounds.south - bounds.north)
    if (random() < acceptance(x, y)) break
  }
  return [x, y]
}

export function lifeAlpha(life: ParticleLife, tuning: Pick<WindTuning, 'fadeIn' | 'fadeOut'>): number {
  if (life.age <= 0) return 0
  const fadeIn = tuning.fadeIn > 0 ? Math.min(1, life.age / tuning.fadeIn) : 1
  const fadeOut = life.dyingAt < 0 ? 1 : tuning.fadeOut > 0 ? Math.max(0, 1 - (life.age - life.dyingAt) / tuning.fadeOut) : 0
  return smooth(fadeIn) * smooth(fadeOut)
}

// Windstil: een particle die in zijn hele leven minder dan minTrail aflegt
// wordt een stipje; die dimmen we weg in plaats van stompjes te tonen.
export function shortTrailAlpha(expectedPx: number, minTrail: number): number {
  return minTrail > 0 ? smooth(Math.min(1, expectedPx / minTrail)) : 1
}

/**
 * Knipt een polyline (kop eerst, in wereldcoördinaten) af op booglengte
 * `maxLength` en geeft per punt de staartfactor 1 − taper·s/maxLength.
 */
export function clipTrail(
  pathX: ArrayLike<number>, pathY: ArrayLike<number>, count: number, maxLength: number, taper: number,
  outX: Float64Array, outY: Float64Array, outFade: Float32Array,
): number {
  if (count === 0) return 0
  outX[0] = pathX[0]!
  outY[0] = pathY[0]!
  outFade[0] = 1
  let travelled = 0
  let points = 1
  for (let index = 1; index < count; index++) {
    const dx = pathX[index]! - pathX[index - 1]!
    const dy = pathY[index]! - pathY[index - 1]!
    const segment = Math.hypot(dx, dy)
    if (segment === 0) continue
    const cut = travelled + segment > maxLength
    const fraction = cut ? (maxLength - travelled) / segment : 1
    travelled += segment * fraction
    outX[points] = pathX[index - 1]! + dx * fraction
    outY[points] = pathY[index - 1]! + dy * fraction
    outFade[points] = 1 - taper * Math.min(1, travelled / maxLength)
    points++
    if (cut) break
  }
  return points
}

export function trailIndices(particles: number, points: number): Uint32Array {
  const indices = new Uint32Array(particles * (points - 1) * 6)
  let offset = 0
  for (let particle = 0; particle < particles; particle++) {
    const base = particle * points * 2
    for (let point = 0; point < points - 1; point++) {
      const vertex = base + point * 2
      indices.set([vertex, vertex + 1, vertex + 2, vertex + 1, vertex + 3, vertex + 2], offset)
      offset += 6
    }
  }
  return indices
}

function writeTrailVertices(
  floats: Float32Array, bytes: Uint8Array, firstVertex: number,
  xs: Float64Array, ys: Float64Array, fades: Float32Array, count: number, alpha: number, color: Float32Array,
): void {
  const red = Math.round(color[0]! * 255)
  const green = Math.round(color[1]! * 255)
  const blue = Math.round(color[2]! * 255)
  for (let point = 0; point < TRAIL_POINTS; point++) {
    const source = Math.min(point, count - 1)
    let normalX = 0
    let normalY = 0
    if (point < count && count > 1) {
      const previous = Math.max(0, source - 1)
      const next = Math.min(count - 1, source + 1)
      let inX = xs[source]! - xs[previous]!
      let inY = ys[source]! - ys[previous]!
      let outX = xs[next]! - xs[source]!
      let outY = ys[next]! - ys[source]!
      const inLength = Math.hypot(inX, inY) || 1
      const outLength = Math.hypot(outX, outY) || 1
      inX /= inLength
      inY /= inLength
      outX /= outLength
      outY /= outLength
      const tangentLength = Math.hypot(inX + outX, inY + outY) || 1
      normalX = -(inY + outY) / tangentLength
      normalY = (inX + outX) / tangentLength
      // Miter: verbreed in knikken zodat de lijn overal gelijk dik oogt, begrensd tegen spikes.
      const miter = 1 / Math.max(0.5, source === previous ? normalX * -outY + normalY * outX : normalX * -inY + normalY * inX)
      normalX *= miter
      normalY *= miter
    }
    const pointAlpha = point < count ? Math.round(255 * alpha * Math.max(0, fades[source]!)) : 0
    for (let side = 0; side < 2; side++) {
      const vertex = firstVertex + point * 2 + side
      const floatOffset = vertex * VERTEX_BYTES / 4
      floats[floatOffset] = xs[source]!
      floats[floatOffset + 1] = ys[source]!
      floats[floatOffset + 2] = normalX
      floats[floatOffset + 3] = normalY
      const byteOffset = vertex * VERTEX_BYTES + 16
      bytes[byteOffset] = red
      bytes[byteOffset + 1] = green
      bytes[byteOffset + 2] = blue
      bytes[byteOffset + 3] = pointAlpha
    }
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
