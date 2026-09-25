import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl'
import type { MapTheme } from './basemap'
import type { Grid } from './contract'

export const WIND_PARTICLES_PER_MEGAPIXEL = 620
export const WIND_REFERENCE_ZOOM = 6.4
// v2: U3-waarden (polylinemodel) betekenen in het buffermodel iets anders.
// v3 (U20): alleen afwijkingen van de default worden bewaard; v2 wordt eenmalig gemigreerd.
export const WIND_TUNING_STORAGE_KEY = 'motregen-wind-tuning-v3'
export const LEGACY_WIND_TUNING_STORAGE_KEY = 'motregen-wind-tuning-v2'

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
  // Buffer nooit fijner dan 2 device-px per CSS-px: op een Pixel 5 (DPR 2,75) kostten fade +
  // composite op volle resolutie ~1 s warme TTFR in de 4G-gate. 1,5 (U3b) gaf een 2×-Mac een
  // 0,75×-buffer die LINEAR opgeschaald korrelig/zacht oogt (U24).
  bufferDpr: 2,
  headIntensity: 0.95,
  lineWidth: 2.5,
  speed: 1,
  // PO 2026-09-25 (U24): default een stuk subtieler, ~60 % van de inkt bij 1,27; windfocus (U19)
  // tweent naar WIND_FOCUS_INTENSITY, zoals vóór U24.
  intensity: 0.75,
  visibility: 1,
  maxFps: 60,
}

/** Intensiteit bij volle windfocus met de default-tuning (U19: ×1,5 op de toenmalige 1,27). */
export const WIND_FOCUS_INTENSITY = 1.905

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
// Zoom/pan/resize (U12): aanvullers komen direct midden in hun leven binnen en faden in de
// tijd in; overtal (uitzoomen, kleiner budget) faded in de tijd uit. Nooit een lege kaart.
const FILL_FADE_SECONDS = 0.25
// U20: aanvullers van één zoomstap verschijnen gespreid over dit venster en met volle jitter in
// hun cel; tegelijk en op celmiddens verschenen ze als rooster van gelijke streepjes.
const FILL_SPREAD_SECONDS = 0.15
const RETIRE_SECONDS = 0.35
// Elke dood met een zichtbare kop dooft minstens zo lang uit (U24: geen wegvallers).
const DEATH_SECONDS = 0.35
// Tekeningen korter na de vorige gelden als dezelfde frame (U24).
const MIN_TRAIL_STEP_MS = 4
// Het anker van de trailbuffer volgt een beweging pas bij dit zoomverschil of als het beeld meer
// dan deze UV-marge buiten het anker valt; bij stilstand altijd.
const REBASE_ZOOM = 0.5
const REBASE_MARGIN = 0.05
const FILL_MAX_PHASE = 0.6
const SPAWN_ATTEMPTS = 32
const EMPTIEST_SAMPLES = 48
// PO 2026-09-25 (U24b): dit deel van de gewone respawns landt in een rand van één cel buiten het
// beeld, rondom, zodat trails van buiten binnenkomen (loefzijde en pannen).
const RIM_SHARE = 0.08
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
uniform vec2 u_uv_scale;
uniform vec2 u_uv_offset;
out vec4 v_color;
out float v_across;
// Van het huidige beeld naar het beeld waarin de trailbuffer verankerd is, in pixels van de buffer.
vec2 anchorPx(vec4 clip) {
  vec2 uv = (clip.xy / clip.w * 0.5 + 0.5) * u_uv_scale + u_uv_offset;
  return (uv - 0.5) * u_target;
}
void main() {
  vec2 fromPx = anchorPx(u_matrix * vec4(a_from, 0.0, 1.0));
  vec2 toPx = anchorPx(u_matrix * vec4(a_to, 0.0, 1.0));
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

// De vloer haalt 8-bit-waarden die door afronding nooit meer dalen (t3i-ghosts) weg. Zonder
// herankering (u_warp = 0) een exacte texelkopie: elke bilineaire hersampling vervaagt de staarten
// (U24). highp: in mediump (fp16 op Apple-GPU's) is een UV-coördinaat op een buffer van > 2048 px
// breed tot een halve texel onnauwkeurig.
const fadeFragmentSource = `#version 300 es
precision highp float;
uniform sampler2D u_trail;
uniform float u_fade;
uniform float u_floor;
uniform float u_warp;
uniform vec2 u_uv_scale;
uniform vec2 u_uv_offset;
in vec2 v_uv;
out vec4 color;
void main() {
  vec4 previous = texelFetch(u_trail, ivec2(gl_FragCoord.xy), 0);
  float inside = 1.0;
  if (u_warp > 0.5) {
    vec2 previousUv = v_uv * u_uv_scale + u_uv_offset;
    inside = step(0.0, previousUv.x) * step(previousUv.x, 1.0) * step(0.0, previousUv.y) * step(previousUv.y, 1.0);
    previous = texture(u_trail, clamp(previousUv, vec2(0.0), vec2(1.0)));
  }
  color = max(vec4(0.0), previous * u_fade - vec4(u_floor)) * inside;
}`

const compositeFragmentSource = `#version 300 es
precision highp float;
uniform sampler2D u_trail;
uniform float u_opacity;
uniform vec2 u_uv_scale;
uniform vec2 u_uv_offset;
in vec2 v_uv;
out vec4 color;
void main() {
  vec2 uv = v_uv * u_uv_scale + u_uv_offset;
  float inside = step(0.0, uv.x) * step(uv.x, 1.0) * step(0.0, uv.y) * step(uv.y, 1.0);
  color = texture(u_trail, clamp(uv, vec2(0.0), vec2(1.0))) * u_opacity * inside;
}`

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
  private segmentUniforms?: UniformMap<'matrix' | 'target' | 'extent' | 'halfWidth' | 'head' | 'visibility' | 'contrast' | 'uvScale' | 'uvOffset'>
  private fadeUniforms?: UniformMap<'trail' | 'fade' | 'floor' | 'warp' | 'uvScale' | 'uvOffset'>
  private compositeUniforms?: UniformMap<'trail' | 'opacity' | 'uvScale' | 'uvOffset'>
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
  private renderedView?: TrailView
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
  /** Levensschaal (0,8–1,2) op afstand én maxAge: waar maxAge de dood bepaalt (zwakke wind) blijft een cohort anders synchroon. */
  private lifeScales = new Float32Array(MAX_PARTICLES).fill(1)
  private lifeLimit = { maxAge: 0 }
  /** Tijdsfade (0–1) bovenop de afstandsfades; `rampRates` > 0 = aanvuller, < 0 = overtal. */
  private ramps = new Float32Array(MAX_PARTICLES).fill(1)
  private rampRates = new Float32Array(MAX_PARTICLES)
  private retiring = 0
  /** Getoonde kop-alpha (0–1), die hooguit met 1/DEATH_SECONDS per seconde daalt. */
  private shown = new Float32Array(MAX_PARTICLES)
  /** 1 = leven voorbij, de kop dooft uit (telt mee in `retiring`). */
  private dying = new Uint8Array(MAX_PARTICLES)
  private instanceData = new ArrayBuffer(MAX_PARTICLES * INSTANCE_BYTES)
  private instanceFloats = new Float32Array(this.instanceData)
  private instanceBytes = new Uint8Array(this.instanceData)
  private life: ParticleLife = { age: 0, travelled: 0, distance: 0, remaining: 0 }
  private color = new Float32Array(3)
  /** Gesimuleerde slots: `budget` levende particles plus het overtal dat nog uitfadet. */
  private active = MIN_PARTICLES
  private target = MIN_PARTICLES
  private budget = MIN_PARTICLES
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
  /** Het zichtbare beeld in gridfracties: bezettingsraster, leegste-cel-respawn en metingen. */
  private viewBounds: ParticleBounds = { west: 0, north: 0, east: 1, south: 1 }
  /** Beeld plus een rand van één cel (U24b): hierbuiten sterft een particle. */
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
      uvScale: 'u_uv_scale', uvOffset: 'u_uv_offset',
    })
    this.fadeUniforms = uniforms(gl, fade, { trail: 'u_trail', fade: 'u_fade', floor: 'u_floor', warp: 'u_warp', uvScale: 'u_uv_scale', uvOffset: 'u_uv_offset' })
    this.compositeUniforms = uniforms(gl, composite, { trail: 'u_trail', opacity: 'u_opacity', uvScale: 'u_uv_scale', uvOffset: 'u_uv_offset' })

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
    const bounds = this.viewBounds
    const xs: number[] = []
    const ys: number[] = []
    for (let index = 0; index < this.active; index++) {
      if (this.ages[index]! <= 0 || this.instanceBytes[index * INSTANCE_BYTES + 19] === 0) continue
      xs.push((this.x[index]! - bounds.west) / (bounds.east - bounds.west))
      ys.push((this.y[index]! - bounds.north) / (bounds.south - bounds.north))
    }
    return { particles: xs.length, dispersion: cellDispersion(xs, ys, xs.length, columns, rows) }
  }

  /**
   * Meethaak (U24): dichtheid van de zichtbare koppen langs de gemiddelde windrichting, van loef
   * naar lij in banden van gelijk oppervlak; `ratio` = loef/lij (buitenste 20 % aan elke kant).
   */
  windProfile(bins = 10): WindProfile & { particles: number } {
    const bounds = this.viewBounds
    const xs: number[] = []
    const ys: number[] = []
    const weights: number[] = []
    let east = 0
    let north = 0
    for (let index = 0; index < this.active; index++) {
      const alpha = this.instanceBytes[index * INSTANCE_BYTES + 19]!
      if (this.ages[index]! <= 0 || alpha === 0) continue
      const u = (this.x[index]! - bounds.west) / (bounds.east - bounds.west)
      const v = (this.y[index]! - bounds.north) / (bounds.south - bounds.north)
      if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1)) continue
      xs.push(u)
      ys.push(v)
      weights.push(alpha / 255)
      if (this.sampleWind(this.x[index]!, this.y[index]!)) {
        east += this.east
        north += this.north
      }
    }
    const canvas = this.map?.getCanvas()
    const aspect = canvas ? Math.max(1, canvas.clientWidth) / Math.max(1, canvas.clientHeight) : 1
    return { particles: xs.length, ...downwindProfile(xs, ys, weights, east, -north, aspect, bins) }
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
    // De focus-tween (U19) zet elke frame een nieuwe intensiteit; alleen de dichtheid raakt de particles.
    const densityChanged = tuning.particlesPerMegapixel !== this.tuning.particlesPerMegapixel
    this.tuning = { ...tuning }
    if (!this.map) return
    if (densityChanged) this.resetViewport()
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
    // Een tweede tekening in dezelfde frame (kaartrender én eigen frame) laat de tijd niet lopen:
    // anders trekt de vloer er per frame dubbel af en stempelt een kop een segment van niets.
    const stepping = elapsed >= MIN_TRAIL_STEP_MS
    const seconds = stepping ? elapsed / 1_000 : 0
    if (stepping) {
      this.previousTime = now
      this.adjustBudget(elapsed)
      this.advance(seconds, WORLD_TILE_SIZE * 2 ** this.map.getZoom())
    }

    const viewport = gl.getParameter(gl.VIEWPORT) as Int32Array
    const framebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
    const depthEnabled = gl.isEnabled(gl.DEPTH_TEST)
    const scissorEnabled = gl.isEnabled(gl.SCISSOR_TEST)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.SCISSOR_TEST)

    // De buffer blijft verankerd in `trailView` zolang de kaart beweegt en wordt pas geherprojecteerd
    // (één bilineaire hersampling) bij stilstand of als het anker te ver afwijkt. Per frame
    // mee-warpen vervaagde de staarten bij een doorlopende zoom tot minder dan de helft (U24).
    const currentView = this.currentTrailView()
    const moving = !sameTrailView(currentView, this.renderedView)
    this.renderedView = currentView
    const anchor = this.trailView ?? currentView
    const drift = trailUvTransform(anchor, currentView)
    const rebase = !sameTrailView(anchor, currentView) && (!moving || anchorExhausted(anchor, currentView, drift))
    const bufferTransform = rebase ? trailUvTransform(currentView, currentView) : drift
    let shown = this.trails[this.trailIndex]
    if (stepping || rebase) {
      const previous = shown
      const nextIndex = 1 - this.trailIndex
      const next = this.trails[nextIndex]!
      gl.bindFramebuffer(gl.FRAMEBUFFER, next.framebuffer)
      gl.viewport(0, 0, this.trailWidth, this.trailHeight)
      gl.disable(gl.BLEND)
      gl.useProgram(this.fadeProgram!)
      gl.bindVertexArray(this.fadeArray)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, previous.texture)
      gl.uniform1i(this.fadeUniforms!.trail, 0)
      gl.uniform1f(this.fadeUniforms!.fade, bufferDecay(this.tuning.bufferFade, seconds) * (rebase ? drift.retention : 1))
      gl.uniform1f(this.fadeUniforms!.floor, stepping ? trailFloor(seconds) : 0)
      gl.uniform1f(this.fadeUniforms!.warp, rebase ? 1 : 0)
      gl.uniform2f(this.fadeUniforms!.uvScale, drift.scaleX, drift.scaleY)
      gl.uniform2f(this.fadeUniforms!.uvOffset, drift.offsetX, drift.offsetY)
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)

      if (stepping) this.drawHeads(gl, options, bufferTransform)
      this.trailIndex = nextIndex
      if (rebase) this.trailView = currentView
      shown = next
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.viewport(viewport[0]!, viewport[1]!, viewport[2]!, viewport[3]!)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    gl.useProgram(this.compositeProgram!)
    gl.bindVertexArray(this.compositeArray)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, shown.texture)
    gl.uniform1i(this.compositeUniforms!.trail, 0)
    gl.uniform1f(this.compositeUniforms!.opacity, this.tuning.intensity * Math.min(this.tuning.visibility, 1))
    gl.uniform2f(this.compositeUniforms!.uvScale, bufferTransform.scaleX, bufferTransform.scaleY)
    gl.uniform2f(this.compositeUniforms!.uvOffset, bufferTransform.offsetX, bufferTransform.offsetY)
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4)
    gl.bindVertexArray(null)
    if (depthEnabled) gl.enable(gl.DEPTH_TEST)
    if (scissorEnabled) gl.enable(gl.SCISSOR_TEST)
    if (this.requestRepaint) this.requestRepaint()
    else this.requestNextFrame(now)
  }

  /** De koppen van deze tijdstap als segmenten in de (verankerde) trailbuffer. */
  private drawHeads(gl: WebGL2RenderingContext, options: CustomRenderMethodInput, bufferTransform: UvTransform): void {
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    // lineWidth in device-px van het huidige beeld, omgerekend naar pixels van de verankerde buffer.
    const halfWidth = this.tuning.lineWidth / 2 * bufferTransform.scaleX * this.trailWidth / Math.max(1, this.map!.getCanvas().width)
    gl.useProgram(this.segmentProgram!)
    gl.bindVertexArray(this.segmentArray!)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceBuffer!)
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceBytes, 0, this.active * INSTANCE_BYTES)
    const segmentUniforms = this.segmentUniforms!
    gl.uniformMatrix4fv(segmentUniforms.matrix, false, options.defaultProjectionData.mainMatrix)
    gl.uniform2f(segmentUniforms.target, this.trailWidth, this.trailHeight)
    gl.uniform1f(segmentUniforms.extent, halfWidth + 1)
    gl.uniform1f(segmentUniforms.halfWidth, halfWidth)
    gl.uniform1f(segmentUniforms.head, this.tuning.headIntensity)
    gl.uniform1f(segmentUniforms.visibility, this.tuning.visibility)
    gl.uniform2f(segmentUniforms.uvScale, bufferTransform.scaleX, bufferTransform.scaleY)
    gl.uniform2f(segmentUniforms.uvOffset, bufferTransform.offsetX, bufferTransform.offsetY)
    const contrast = this.theme === 'dark' ? 1 : 0
    gl.uniform3f(segmentUniforms.contrast, contrast, contrast, contrast)
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.active)
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
      const rate = this.rampRates[index]!
      const dying = this.dying[index] === 1
      if (dying) {
        this.shown[index] = this.shown[index]! - seconds / DEATH_SECONDS
        if (this.shown[index]! <= 0) {
          if (this.retire(index)) index--
          continue
        }
      } else if (rate !== 0) {
        const ramp = this.ramps[index]! + rate * seconds
        if (rate < 0 && ramp <= 0) {
          // De begrensde kop-alpha loopt achter op de ramp: eerst uitdoven, dan pas weg.
          if (this.shown[index]! * 255 >= 1) this.dying[index] = 1
          else if (this.retire(index)) index--
          continue
        }
        this.ramps[index] = Math.min(1, ramp)
        if (ramp >= 1) this.rampRates[index] = 0
      }
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
      this.lifeLimit.maxAge = tuning.maxAge * this.lifeScales[index]!
      if (!dying && (outside || !advanceLife(life, stepPx, seconds, this.lifeLimit))) {
        if (this.die(index, oldX, oldY)) index--
        continue
      }
      this.x[index] = nextX
      this.y[index] = nextY
      floats[offset] = floats[offset + 2]!
      floats[offset + 1] = floats[offset + 3]!
      floats[offset + 2] = 0.5 + (this.grid.x0 + gridWidth * nextX) * MERCATOR_SCALE
      floats[offset + 3] = 0.5 - (this.grid.y0 + gridHeight * nextY) * MERCATOR_SCALE
      const byte = index * INSTANCE_BYTES + 16
      if (dying) {
        // Uitlopend: de kop drijft door en dooft in de tijd; kleur blijft die van zijn laatste leven.
        this.instanceBytes[byte + 3] = Math.round(this.shown[index]! * 255)
        continue
      }
      this.ages[index] = life.age
      this.travelled[index] = life.travelled
      setWindColor(speed, this.theme, this.color)
      this.instanceBytes[byte] = Math.round(this.color[0]! * 255)
      this.instanceBytes[byte + 1] = Math.round(this.color[1]! * 255)
      this.instanceBytes[byte + 2] = Math.round(this.color[2]! * 255)
      // Omhoog direct, omlaag hooguit 1/DEATH_SECONDS per seconde: een snelheidssprong naar (bijna)
      // windstil of een gat in het veld liet de kop anders in één frame verdwijnen (U24).
      const target = headAlpha(life, tuning) * smooth(Math.max(0, this.ramps[index]!)) * speedDamping(speed, tuning.speedDamping)
      this.shown[index] = Math.max(target, this.shown[index]! - seconds / DEATH_SECONDS)
      this.instanceBytes[byte + 3] = Math.round(this.shown[index]! * 255)
    }
  }

  private adjustBudget(elapsed: number): void {
    this.frameTotal += elapsed
    this.frameCount++
    if (this.frameCount < 45) return
    const average = this.frameTotal / this.frameCount
    // Tegen het eigen framebudget: een bewust lagere maxFps is geen trage GPU.
    const budget = Math.max(16.7, 1_000 / this.tuning.maxFps)
    if (average > budget * 1.14 && this.budget > MIN_PARTICLES) {
      this.budget = Math.max(MIN_PARTICLES, Math.floor(this.budget * 0.78))
      this.balance()
    } else if (average < budget * 1.03 && this.budget < this.target) {
      this.budget = Math.min(this.target, this.budget + Math.max(12, Math.floor(this.target * 0.06)))
      this.balance()
    }
    this.frameTotal = 0
    this.frameCount = 0
  }

  // Respawn in de leegste cel van een raster met
  // ~1 particle per cel, op een gejitterde positie: gelijkmatige koppendichtheid
  // zonder zichtbaar raster. Dat maakt de inkt ∝ windsnelheid; speedDamping
  // compenseert dat in de kopintensiteit.
  private respawn(index: number, delaySeconds: number, fill = false): void {
    const bounds = this.viewBounds
    let cell = -1
    const rim = !fill && this.random() < RIM_SHARE ? this.rimPoint() : undefined
    const [x, y] = rim ?? pickSpawn(SPAWN_ATTEMPTS, () => {
      // Aanvullers (pan/zoom) in de leegste omgeving, zodat een binnengeschoven strook meteen vol is;
      // gewone respawns in een willekeurige lege cel: de omgevingskeuze stuurde alle pasgeborenen
      // (nog in fade-in, zonder staart) naar loef, en maakte de inkt daar juist dunner (U24b).
      cell = fill
        ? emptiestCell(this.cellCounts, this.columns, this.rows, () => this.random())
        : leastOccupiedCell(this.cellCounts, this.columns * this.rows, this.random())
      const [u, v] = jitteredCellPoint(cell, this.columns, this.rows, fill ? 1 : this.tuning.spawnJitter, () => this.random())
      return [bounds.west + u * (bounds.east - bounds.west), bounds.north + v * (bounds.south - bounds.north)]
    }, () => this.random(), (candidateX, candidateY) => !this.left || this.sampleWind(candidateX, candidateY) ? 1 : 0)
    if (cell >= 0) this.cellCounts[cell]!++
    this.x[index] = x
    this.y[index] = y
    this.ages[index] = -delaySeconds
    this.travelled[index] = 0
    // ±20 %: anders sterft een homogeen zeeveld in synchrone golven.
    const lifeScale = 0.8 + this.random() * 0.4
    this.lifeScales[index] = lifeScale
    this.distances[index] = this.tuning.trailDistance * lifeScale
    this.ramps[index] = 1
    this.rampRates[index] = 0
    this.shown[index] = 0
    this.dying[index] = 0
    if (fill) {
      // Een willekeurige levensfase in afstand én leeftijd, anders sterven alle aanvullers van
      // één zoomstap tegelijk: bij zwakke wind (land) is maxAge de doodsoorzaak (U20).
      const phase = this.random() * FILL_MAX_PHASE
      this.ages[index] = Math.max(1e-3, phase * this.tuning.maxAge * lifeScale)
      this.travelled[index] = phase * this.distances[index]!
      this.ramps[index] = -this.random() * FILL_SPREAD_SECONDS / FILL_FADE_SECONDS
      this.rampRates[index] = 1 / FILL_FADE_SECONDS
    }
    this.instanceBytes[index * INSTANCE_BYTES + 19] = 0
    const offset = index * INSTANCE_BYTES / 4
    this.instanceFloats[offset + 2] = 0.5 + (this.grid.x0 + this.grid.dx * this.grid.width * x) * MERCATOR_SCALE
    this.instanceFloats[offset + 3] = 0.5 - (this.grid.y0 + this.grid.dy * this.grid.height * y) * MERCATOR_SCALE
  }

  /** Uniform punt in de rand rond het beeld (buiten het bezettingsraster), of undefined. */
  private rimPoint(): [number, number] | undefined {
    const outer = this.particleBounds
    for (let attempt = 0; attempt < SPAWN_ATTEMPTS; attempt++) {
      const x = outer.west + this.random() * (outer.east - outer.west)
      const y = outer.north + this.random() * (outer.south - outer.north)
      if (!this.inView(x, y) && (!this.left || this.sampleWind(x, y))) return [x, y]
    }
    return undefined
  }

  /**
   * Kaartbeweging en resize. Particles leven in gridfracties (Mercator) en blijven gewoon staan;
   * alleen wie buiten beeld valt komt als aanvuller terug in de leegste cel, en bij uitzoomen
   * gaat het overtal uit de volste cellen in een fade weg terwijl aanvullers de nieuwe rand vullen.
   */
  private resetViewport(resetAll = false): void {
    if (!this.map) return
    this.ensureTrailTargets()
    const previousBounds = this.viewBounds
    const previousBudget = this.budget
    this.viewBounds = viewBounds(this.map, this.grid)
    const canvas = this.map.getCanvas()
    const inView = particleCountForViewport(canvas.clientWidth, canvas.clientHeight, this.tuning.particlesPerMegapixel)
    // ~RIM_SHARE van de levende particles zit in de rand (gemeten 7,7–8,1 % bij 1–12 m/s): het
    // budget groeit mee, zodat de dichtheid in beeld blijft wat hij was.
    const target = Math.min(MAX_PARTICLES, Math.round(inView / (1 - RIM_SHARE)))
    if (resetAll || target !== this.target) this.budget = target
    const retention = viewportParticleRetention(previousBounds, this.viewBounds, previousBudget, this.budget)
    this.target = target
    ;[this.columns, this.rows] = occupancyGrid(canvas.clientWidth, canvas.clientHeight, inView)
    this.particleBounds = withRim(this.viewBounds, this.columns, this.rows)
    if (resetAll) {
      this.active = this.budget
      this.retiring = 0
      this.countCells()
      for (let index = 0; index < this.active; index++) this.respawn(index, this.random() * INITIAL_STAGGER_SECONDS)
      this.clearTrails()
      return
    }
    this.countCells()
    let survivors = 0
    for (let index = 0; index < this.active; index++) {
      if (this.inside(this.x[index]!, this.y[index]!)) {
        if (!this.fading(index)) survivors++
      } else if (this.fading(index)) {
        if (this.retire(index)) index--
      } else {
        this.respawn(index, 0, true)
      }
    }
    this.retireSurplus(Math.round(survivors * (1 - retention)))
    this.balance()
  }

  /** Brengt het aantal levende particles naar `budget`: aanvullen in extra slots, overtal uitfaden. */
  private balance(): void {
    const live = this.active - this.retiring
    if (live > this.budget) this.retireSurplus(live - this.budget)
    for (let count = live; count < this.budget && this.active < MAX_PARTICLES; count++) this.respawn(this.active++, 0, true)
  }

  /** Laat `count` levende particles uitfaden, bij voorkeur uit cellen met meer dan één. */
  private retireSurplus(count: number): void {
    if (count <= 0 || this.active === 0) return
    const offset = Math.floor(this.random() * this.active)
    for (const minimum of [2, 0]) {
      for (let step = 0; step < this.active && count > 0; step++) {
        const index = (offset + step) % this.active
        if (this.fading(index)) continue
        const cell = this.cellOf(this.x[index]!, this.y[index]!)
        if (minimum > 0 && (cell < 0 || this.cellCounts[cell]! < minimum)) continue
        if (cell >= 0 && this.cellCounts[cell]! > 0) this.cellCounts[cell]!--
        this.rampRates[index] = -1 / RETIRE_SECONDS
        this.retiring++
        count--
      }
    }
  }

  /** Einde van een leven; true als het slot is opgeheven en `index` nu een ander particle bevat. */
  private die(index: number, x: number, y: number): boolean {
    const surplus = this.rampRates[index]! < 0
    // Buiten beeld (in de rand) is een kop onzichtbaar: geen uitloop nodig.
    if (this.shown[index]! * 255 >= 1 && this.inView(x, y)) {
      // Zichtbare kop: het slot dooft als uitloper uit (telt als overtal) en een vervanger wordt
      // meteen geboren, zodat de dichtheid niet zakt.
      this.dying[index] = 1
      if (surplus) return false
      this.leaveCell(x, y)
      this.retiring++
      if (this.active < MAX_PARTICLES) this.respawn(this.active++, 0)
      return false
    }
    if (surplus) return this.retire(index)
    this.leaveCell(x, y)
    if (this.active - this.retiring > this.budget) {
      this.removeSlot(index)
      return true
    }
    this.respawn(index, 0)
    return false
  }

  /** Een uitgefade overtal-particle: weg, of als aanvuller terug als het budget tekortkomt. */
  private retire(index: number): boolean {
    this.retiring--
    if (this.active - this.retiring > this.budget) {
      this.removeSlot(index)
      return true
    }
    this.respawn(index, 0, true)
    return false
  }

  private removeSlot(index: number): void {
    const last = --this.active
    if (index === last) return
    for (const values of [this.x, this.y, this.ages, this.travelled, this.distances, this.lifeScales, this.ramps, this.rampRates, this.shown, this.dying]) values[index] = values[last]!
    this.instanceBytes.copyWithin(index * INSTANCE_BYTES, last * INSTANCE_BYTES, (last + 1) * INSTANCE_BYTES)
  }

  /** Telt niet meer mee: overtal dat uitfadet of een uitlopende dode kop. */
  private fading(index: number): boolean {
    return this.rampRates[index]! < 0 || this.dying[index] === 1
  }

  private inside(x: number, y: number): boolean {
    const bounds = this.particleBounds
    return x >= bounds.west && x <= bounds.east && y >= bounds.north && y <= bounds.south
  }

  private inView(x: number, y: number): boolean {
    const bounds = this.viewBounds
    return x >= bounds.west && x <= bounds.east && y >= bounds.north && y <= bounds.south
  }

  private countCells(): void {
    this.cellCounts.fill(0, 0, this.columns * this.rows)
    for (let index = 0; index < this.active; index++) {
      if (this.fading(index)) continue
      const cell = this.cellOf(this.x[index]!, this.y[index]!)
      if (cell >= 0) this.cellCounts[cell]!++
    }
  }

  private leaveCell(x: number, y: number): void {
    const cell = this.cellOf(x, y)
    if (cell >= 0 && this.cellCounts[cell]! > 0) this.cellCounts[cell]!--
  }

  private cellOf(x: number, y: number): number {
    const bounds = this.viewBounds
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
    const previous = this.trails?.[this.trailIndex]
    const previousWidth = this.trailWidth
    const previousHeight = this.trailHeight
    const view = this.trailView
    const trails: [TrailTarget, TrailTarget] = [createTrailTarget(this.gl, width, height), createTrailTarget(this.gl, width, height)]
    this.trailIndex = 0
    if (previous && view) {
      // Resize: de buffer beschrijft het beeld in UV, dus oprekken houdt de staarten op hun plek;
      // de volgende fadepass warpt hem naar de nieuwe verhouding.
      this.clearTargets(trails, width, height)
      blitTrail(this.gl, previous, trails[0], previousWidth, previousHeight, width, height)
    }
    this.deleteTrailTargets()
    this.trailWidth = width
    this.trailHeight = height
    this.trails = trails
    if (previous && view) this.trailView = view
    else this.clearTrails()
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
    if (!this.trails || !this.map) return
    this.clearTargets(this.trails, this.trailWidth, this.trailHeight)
    this.trailView = this.currentTrailView()
  }

  private clearTargets(targets: readonly TrailTarget[], width: number, height: number): void {
    const gl = this.gl
    if (!gl) return
    const framebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
    const viewport = gl.getParameter(gl.VIEWPORT) as Int32Array
    const clearColor = gl.getParameter(gl.COLOR_CLEAR_VALUE) as Float32Array
    const scissorEnabled = gl.isEnabled(gl.SCISSOR_TEST)
    gl.disable(gl.SCISSOR_TEST)
    gl.viewport(0, 0, width, height)
    gl.clearColor(0, 0, 0, 0)
    for (const trail of targets) {
      gl.bindFramebuffer(gl.FRAMEBUFFER, trail.framebuffer)
      gl.clear(gl.COLOR_BUFFER_BIT)
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.viewport(viewport[0]!, viewport[1]!, viewport[2]!, viewport[3]!)
    gl.clearColor(clearColor[0]!, clearColor[1]!, clearColor[2]!, clearColor[3]!)
    if (scissorEnabled) gl.enable(gl.SCISSOR_TEST)
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
 * Cel met de leegste omgeving: eigen bezetting plus het gemiddelde van de buren binnen het raster,
 * onder `samples` willekeurige cellen. Bij ~1 particle per cel is een derde van alle cellen leeg;
 * "de eerste lege cel" strooide aanvullers daardoor over het hele beeld en liet een net
 * binnengepande strook seconden half leeg (U24b). Een lege cel tussen bezette buren scoort slecht.
 */
export function emptiestCell(counts: ArrayLike<number>, columns: number, rows: number, random: () => number, samples = EMPTIEST_SAMPLES): number {
  const cells = columns * rows
  let best = 0
  let bestScore = Infinity
  for (let sample = 0; sample < samples; sample++) {
    const cell = Math.min(cells - 1, Math.floor(random() * cells))
    const column = cell % columns
    const row = Math.floor(cell / columns)
    let neighbours = 0
    let sum = 0
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if ((dx === 0 && dy === 0) || column + dx < 0 || column + dx >= columns || row + dy < 0 || row + dy >= rows) continue
        sum += counts[cell + dy * columns + dx]!
        neighbours++
      }
    }
    const score = counts[cell]! + (neighbours ? sum / neighbours : 0)
    if (score < bestScore) {
      best = cell
      bestScore = score
      if (score === 0) break
    }
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

export interface WindProfile {
  /** Relatieve koppendichtheid per band van loef naar lij (gemiddelde 1). */
  density: number[]
  /** Idem, gewogen met kop-alpha: wat je ziet. */
  ink: number[]
  ratio: number
  inkRatio: number
}

/**
 * Profiel van punten (u, v in het eenheidsvierkant, v omlaag) langs richting (dx, dy) in
 * schermruimte, in `bins` banden van gelijk beeldoppervlak. `aspect` = breedte/hoogte.
 */
export function downwindProfile(us: ArrayLike<number>, vs: ArrayLike<number>, weights: ArrayLike<number>, dx: number, dy: number, aspect: number, bins = 10): WindProfile {
  const length = Math.hypot(dx * aspect, dy)
  const empty = { density: new Array<number>(bins).fill(0), ink: new Array<number>(bins).fill(0), ratio: Number.NaN, inkRatio: Number.NaN }
  if (!(length > 0) || us.length === 0) return empty
  const ux = dx * aspect / length
  const uy = dy / length
  const project = (u: number, v: number) => u * aspect * ux + v * uy
  // Bandgrenzen als kwantielen van een uniform raster over het beeld: gelijk oppervlak per band.
  const samples: number[] = []
  for (let row = 0; row < 64; row++) for (let column = 0; column < 64; column++) samples.push(project((column + 0.5) / 64, (row + 0.5) / 64))
  samples.sort((left, right) => left - right)
  const edges = Array.from({ length: bins - 1 }, (_, band) => samples[Math.floor((band + 1) * samples.length / bins)]!)
  const counts = new Array<number>(bins).fill(0)
  const inks = new Array<number>(bins).fill(0)
  let total = 0
  let totalInk = 0
  for (let index = 0; index < us.length; index++) {
    const t = project(us[index]!, vs[index]!)
    let band = 0
    while (band < edges.length && t > edges[band]!) band++
    counts[band]!++
    inks[band]! += weights[index]!
    total++
    totalInk += weights[index]!
  }
  const density = counts.map((count) => count / total * bins)
  const ink = inks.map((value) => totalInk > 0 ? value / totalInk * bins : 0)
  const edge = Math.max(1, Math.round(bins / 5))
  const ratioOf = (values: number[]) => mean(values.slice(0, edge)) / mean(values.slice(bins - edge))
  return { density, ink, ratio: ratioOf(density), inkRatio: ratioOf(ink) }
}

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / Math.max(1, values.length)
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

export interface UvTransform { scaleX: number; scaleY: number; offsetX: number; offsetY: number; retention: number }

export function sameTrailView(left: TrailView, right: TrailView | undefined): boolean {
  return !!right && left.centerX === right.centerX && left.centerY === right.centerY && left.zoom === right.zoom &&
    left.width === right.width && left.height === right.height
}

/** Moet de verankerde buffer tijdens een beweging al herprojecteren? Zoomverschil of beeld buiten het anker. */
export function anchorExhausted(anchor: TrailView, current: TrailView, drift: UvTransform): boolean {
  return Math.abs(anchor.zoom - current.zoom) > REBASE_ZOOM ||
    drift.offsetX < -REBASE_MARGIN || drift.offsetX + drift.scaleX > 1 + REBASE_MARGIN ||
    drift.offsetY < -REBASE_MARGIN || drift.offsetY + drift.scaleY > 1 + REBASE_MARGIN
}

export function trailUvTransform(previous: TrailView, current: TrailView): UvTransform {
  const zoomScale = 2 ** (previous.zoom - current.zoom)
  const scaleX = zoomScale * current.width / previous.width
  const scaleY = zoomScale * current.height / previous.height
  const previousWorldSize = WORLD_TILE_SIZE * 2 ** previous.zoom
  return {
    scaleX,
    scaleY,
    offsetX: 0.5 * (1 - scaleX) + (current.centerX - previous.centerX) * previousWorldSize / previous.width,
    offsetY: 0.5 * (1 - scaleY) - (current.centerY - previous.centerY) * previousWorldSize / previous.height,
    // Uitzoomen perst een staart in lengte, niet in breedte: inkt per oppervlak ×schaal.
    retention: Math.min(1, 1 / zoomScale),
  }
}

type TuningStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function loadWindTuning(storage: TuningStorage | undefined = globalThis.localStorage): WindTuning {
  try {
    const stored = storage?.getItem(WIND_TUNING_STORAGE_KEY)
    if (stored) return sanitizeWindTuning(JSON.parse(stored) as unknown)
    const legacy = storage?.getItem(LEGACY_WIND_TUNING_STORAGE_KEY)
    if (!legacy) return { ...DEFAULT_WIND_TUNING }
    const tuning = migrateWindTuningV2(JSON.parse(legacy) as unknown)
    storage?.removeItem(LEGACY_WIND_TUNING_STORAGE_KEY)
    storeWindTuning(tuning, storage)
    return tuning
  } catch {
    return { ...DEFAULT_WIND_TUNING }
  }
}

// Alleen afwijkingen van de default worden weggeschreven, zodat latere default-wijzigingen
// ook gebruikers bereiken die aan één andere knop zaten.
export function storeWindTuning(tuning: WindTuning, storage: Pick<Storage, 'setItem' | 'removeItem'> | undefined = globalThis.localStorage): void {
  try {
    const custom: Partial<WindTuning> = {}
    for (const control of WIND_TUNING_CONTROLS) if (tuning[control.key] !== DEFAULT_WIND_TUNING[control.key]) custom[control.key] = tuning[control.key]
    if (Object.keys(custom).length) storage?.setItem(WIND_TUNING_STORAGE_KEY, JSON.stringify(custom))
    else storage?.removeItem(WIND_TUNING_STORAGE_KEY)
  } catch {
    // opslag vol of geblokkeerd: tuning blijft voor deze sessie gelden
  }
}

// Defaults uit de v2-periode (U3b–U12). v2 schreef de hele tuning weg zodra één knop afweek,
// dus een waarde gelijk aan een toenmalige default is nooit gekozen en volgt de huidige default.
const V2_DEFAULTS: Partial<Record<keyof WindTuning, readonly number[]>> = { intensity: [0.5, 1.4, 1.9, 1.27], lineWidth: [1.5] }
// Een zelfgekozen v2-intensiteit (van vóór de windfocus) wordt de focuswaarde; de rust schaalt
// met dezelfde verhouding als de default.
const V2_INTENSITY_SCALE = DEFAULT_WIND_TUNING.intensity / WIND_FOCUS_INTENSITY

export function migrateWindTuningV2(value: unknown): WindTuning {
  const stored = sanitizeWindTuning(value)
  const tuning = { ...DEFAULT_WIND_TUNING }
  const raw = value && typeof value === 'object' ? value as Record<string, unknown> : {}
  for (const control of WIND_TUNING_CONTROLS) {
    if (typeof raw[control.key] !== 'number') continue
    const candidate = stored[control.key]
    if (V2_DEFAULTS[control.key]?.includes(candidate)) continue
    tuning[control.key] = control.key === 'intensity' ? Math.round(candidate * V2_INTENSITY_SCALE * 100) / 100 : candidate
  }
  return tuning
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

/**
 * Deel van de overlevers dat mag blijven: nieuwe over oude dichtheid (particles per
 * gridoppervlak), hooguit 1. Uitzoomen ×2 laat een kwart; een resize die het budget
 * met het beeld laat meegroeien niets weg.
 */
export function viewportParticleRetention(previous: ParticleBounds, current: ParticleBounds, previousCount = 1, currentCount = 1): number {
  const previousArea = Math.max(0, previous.east - previous.west) * Math.max(0, previous.south - previous.north)
  const currentArea = Math.max(0, current.east - current.west) * Math.max(0, current.south - current.north)
  if (previousArea <= 0 || currentArea <= 0 || previousCount <= 0) return 1
  return Math.min(1, currentCount / currentArea / (previousCount / previousArea))
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

function blitTrail(gl: WebGL2RenderingContext, from: TrailTarget, to: TrailTarget, fromWidth: number, fromHeight: number, toWidth: number, toHeight: number): void {
  const read = gl.getParameter(gl.READ_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
  const draw = gl.getParameter(gl.DRAW_FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
  const scissorEnabled = gl.isEnabled(gl.SCISSOR_TEST)
  gl.disable(gl.SCISSOR_TEST)
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, from.framebuffer)
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, to.framebuffer)
  gl.blitFramebuffer(0, 0, fromWidth, fromHeight, 0, 0, toWidth, toHeight, gl.COLOR_BUFFER_BIT, gl.LINEAR)
  gl.bindFramebuffer(gl.READ_FRAMEBUFFER, read)
  gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, draw)
  if (scissorEnabled) gl.enable(gl.SCISSOR_TEST)
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

/** `bounds` plus één cel van een `columns`×`rows`-raster rondom, binnen het grid. */
export function withRim(bounds: ParticleBounds, columns: number, rows: number): ParticleBounds {
  const width = (bounds.east - bounds.west) / columns
  const height = (bounds.south - bounds.north) / rows
  return {
    west: Math.max(0, bounds.west - width),
    east: Math.min(1, bounds.east + width),
    north: Math.max(0, bounds.north - height),
    south: Math.min(1, bounds.south + height),
  }
}

function viewBounds(map: MapLibreMap, grid: Grid): ParticleBounds {
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
