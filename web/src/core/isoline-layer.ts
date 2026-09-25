import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl'
import { MercatorCoordinate } from 'maplibre-gl'
import type { Grid } from './contract'
import type { PreparedField } from './isoline-field'
import { SEGMENT_FLOATS, type ShortRing } from './isoline-contours'
import { ContourTracer, type TraceRequest, type TraceResult } from './isoline-tracer'
import { ISOLINE_FILL_RESOLUTION, ISOLINE_GRADIENT, ISOLINE_LINE_OPACITY, ISOLINE_RING_KM, ISOLINE_TOLERANCE_PX, ISOLINE_WINDOW } from './isolines'
import { PALETTE_STOPS, paletteUniforms, type PaletteStops } from './temperature-palette'

export interface IsolineStyle {
  step: number
  color: [number, number, number]
  /** Dekking van de bandvulling tussen de lijnen (0 = geen vulling). */
  fill: number
  /** Continu verloop op de veldwaarde i.p.v. vlakke banden (PO-optie 2026-09-25). */
  fillSmooth?: boolean
  /** Bandkleuren over het actuele bereik; zonder palet geen vulling. */
  palette?: PaletteStops
  /** Lijnen en vulling vervagen op |∇T| (ISOLINE_GRADIENT). */
  gradientFade: boolean
}

const EQUATOR_KM = 40_075.017

const quadVertex = `#version 300 es
in vec2 a_pos;
in vec2 a_uv;
uniform mat4 u_matrix;
out vec2 v_uv;
void main() {
  v_uv = a_uv;
  gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
}`

// De tijd is de derde texture-as: de snede t = scrubber kost twee trilineaire fetches per tap
// (B-spline), ruimtelijk bicubisch met vier taps.
const fieldSampling = `precision highp float;
precision highp sampler3D;
uniform sampler3D u_field;
uniform vec2 u_grid_size;
uniform float u_depth;
uniform float u_time;
uniform float u_step;
uniform float u_fade;
uniform vec2 u_fade_gradient;
uniform float u_km_per_px;
in vec2 v_uv;
out vec4 color;

// Eén mipniveau: textureLod mag ook na de (niet-uniforme) vroege return.
vec2 fetchAt(vec2 uv, float index) {
  return textureLod(u_field, vec3(uv, (index + 0.5) / u_depth), 0.0).rg;
}

// Kubische B-spline in de tijd met twee lineaire fetches (GPU Gems 2, hfst. 20): C2, dus de
// lijnen veranderen niet op elk heel uur van richting.
vec2 sampleTime(vec2 uv, float time) {
  float i = floor(time);
  float f = time - i;
  float f2 = f * f, f3 = f2 * f;
  float w0 = (1.0 - 3.0 * f + 3.0 * f2 - f3) / 6.0;
  float w1 = (4.0 - 6.0 * f2 + 3.0 * f3) / 6.0;
  float w2 = (1.0 + 3.0 * f + 3.0 * f2 - 3.0 * f3) / 6.0;
  float w3 = f3 / 6.0;
  float g0 = w0 + w1, g1 = w2 + w3;
  return g0 * fetchAt(uv, i - 1.0 + w1 / g0) + g1 * fetchAt(uv, i + 1.0 + w3 / g1);
}

vec2 sampleField(vec2 uv, float time) {
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
  return g0.y * (g0.x * sampleTime(vec2(h0.x, h0.y), time) + g1.x * sampleTime(vec2(h1.x, h0.y), time))
       + g1.y * (g0.x * sampleTime(vec2(h0.x, h1.y), time) + g1.x * sampleTime(vec2(h1.x, h1.y), time));
}

// Waar |∇T| klein is dragen de lijnen weinig informatie en bewegen ze het snelst: daar vervagen
// ze (Vervagen = gradiënt). ds = ∇(T/stap) per pixel.
float gradientFade(vec2 ds) {
  if (u_fade < 0.5) return 1.0;
  return smoothstep(u_fade_gradient.x, u_fade_gradient.y, length(ds) * u_step / u_km_per_px);
}`

// Vulling per band (bandmidden → palet), zie fillSample in temperature-palette.ts: dezelfde
// formule, hier per pixel. De lijnfade f komt uit het veld (gradiënt) en uit het ringraster
// van de tracer (lusjes), zodat kleur en lijn met dezelfde factor vervagen.
const fillFragment = `#version 300 es
${fieldSampling}
uniform float u_fill_base;
uniform float u_fill_smooth;
uniform float u_palette_t[${PALETTE_STOPS}];
uniform vec3 u_palette_c[${PALETTE_STOPS}];
uniform sampler2D u_ring;
uniform float u_has_ring;

vec3 palette(float temperature) {
  if (temperature <= u_palette_t[0]) return u_palette_c[0];
  for (int i = 1; i < ${PALETTE_STOPS}; i++) {
    if (temperature <= u_palette_t[i]) return mix(u_palette_c[i - 1], u_palette_c[i], (temperature - u_palette_t[i - 1]) / (u_palette_t[i] - u_palette_t[i - 1]));
  }
  return u_palette_c[${PALETTE_STOPS - 1}];
}

vec3 band(float index) {
  return palette((index + 0.5) * u_step);
}

void main() {
  vec2 field = sampleField(v_uv, u_time);
  float s = field.r / u_step;
  vec2 ds = vec2(dFdx(s), dFdy(s));
  float level = floor(s + 0.5);
  float offset = s - level;
  float fade = gradientFade(ds);
  if (u_has_ring > 0.5) {
    float ringLevel = texelFetch(u_ring, min(ivec2(v_uv * u_grid_size), ivec2(u_grid_size) - 1), 0).r;
    if (abs(ringLevel - level * u_step) < 0.01) fade *= texture(u_ring, v_uv).g;
  }
  float width = 1.0 - clamp(fade, 0.0, 1.0);
  float upper = width <= 0.0 ? step(0.0, offset) : clamp(0.5 + offset / width, 0.0, 1.0);
  float opacity = u_fill_base * smoothstep(0.3, 0.7, field.g);
  // Verloop (PO-optie): kleur op de veldwaarde zelf i.p.v. per band.
  vec3 rgb = u_fill_smooth > 0.5 ? palette(field.r) : mix(band(level - 1.0), band(level), upper);
  color = vec4(rgb * opacity, opacity);
}`

const compositeVertex = `#version 300 es
in vec2 a_clip;
out vec2 v_uv;
void main() {
  v_uv = a_clip * 0.5 + 0.5;
  gl_Position = vec4(a_clip, 0.0, 1.0);
}`

// Lijnen over de vulling (beide voorvermenigvuldigd); de vulling heeft een eigen, lagere resolutie.
const compositeFragment = `#version 300 es
precision mediump float;
uniform sampler2D u_result;
uniform sampler2D u_fill;
uniform float u_has_fill;
uniform float u_line_opacity;
uniform float u_opacity;
in vec2 v_uv;
out vec4 color;
void main() {
  vec4 line = texture(u_result, v_uv) * u_line_opacity;
  vec4 fill = u_has_fill > 0.5 ? texture(u_fill, v_uv) : vec4(0.0);
  color = (line + fill * (1.0 - line.a)) * u_opacity;
}`

// Vector: één instanced quad per segment, in schermpixels verbreed; de fragmentshader rekent de
// afstand tot het segment (capsule: ronde koppen), dus naden tussen segmenten zijn naadloos
// onder MAX-blending.
const lineVertex = `#version 300 es
in vec2 a_corner;
in vec4 a_segment;
in vec2 a_alpha;
uniform mat4 u_matrix;
uniform vec2 u_viewport;
uniform float u_extent;
flat out vec2 v_a;
flat out vec2 v_b;
flat out vec2 v_alpha;
out vec2 v_px;
vec2 toPx(vec2 p) {
  vec4 clip = u_matrix * vec4(p, 0.0, 1.0);
  return (clip.xy / clip.w * 0.5 + 0.5) * u_viewport;
}
void main() {
  vec2 a = toPx(a_segment.xy), b = toPx(a_segment.zw);
  vec2 d = b - a;
  float len = length(d);
  vec2 dir = len > 1e-4 ? d / len : vec2(1.0, 0.0);
  vec2 normal = vec2(-dir.y, dir.x);
  vec2 p = mix(a - dir * u_extent, b + dir * u_extent, a_corner.x) + normal * u_extent * a_corner.y;
  v_a = a; v_b = b; v_alpha = a_alpha; v_px = p;
  gl_Position = vec4(p / u_viewport * 2.0 - 1.0, 0.0, 1.0);
}`

const lineFragment = `#version 300 es
precision highp float;
uniform float u_half_width;
uniform float u_line_alpha;
uniform vec3 u_color;
flat in vec2 v_a;
flat in vec2 v_b;
flat in vec2 v_alpha;
in vec2 v_px;
out vec4 color;
void main() {
  vec2 ab = v_b - v_a;
  float t = clamp(dot(v_px - v_a, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
  float d = length(v_px - (v_a + ab * t));
  float line = clamp(u_half_width + 0.5 - d, 0.0, 1.0) * u_line_alpha * mix(v_alpha.x, v_alpha.y, t);
  if (line <= 0.0) discard;
  color = vec4(u_color * line, line);
}`

export interface IsolinePassStats {
  passes: number
  composites: number
  uploads: number
  /** Opgetelde fragmenten (offscreen pixels) van alle contour-passes resp. blits. */
  passPixels: number
  compositePixels: number
  /** Voortschrijdend gemiddelde ms per contour-pass resp. blit; `timing` zegt of het GPU-tijd is. */
  passMs: number
  compositeMs: number
  /** Vlakvulling: passes (altijd samen met een contour-pass) en ms per pass. */
  fillPasses: number
  fillMs: number
  timing: 'gpu' | 'cpu'
  /** Vector: tracer-tijd (worker) van de laatste snede, segmenten en lusjes. */
  traceMs?: number
  traces?: number
  segments?: number
  rings?: number
  fadedRings?: number
}

/**
 * Isolijnen als snede door het (x, y, t)-volume van uurframes. De tracer-worker levert de
 * lijnen als segmenten; die en de vulling gaan naar offscreen textures, alleen als de snede
 * verandert: nieuwe geometrie, kaartbeeld, stijl of nieuwe uurframes. Elke andere repaint
 * (bv. windpartikels) kost één texture-blit; zonder focus niets.
 */
export class IsolineLayer implements CustomLayerInterface {
  readonly id = 'motregen-isolines'
  readonly type = 'custom' as const
  readonly renderingMode = '2d' as const
  readonly stats: IsolinePassStats = { passes: 0, composites: 0, uploads: 0, passPixels: 0, compositePixels: 0, passMs: 0, compositeMs: 0, fillPasses: 0, fillMs: 0, timing: 'cpu' }
  private timer?: GpuTimer
  /** Na elke contour-pass: de snede is veranderd (tijd, kaartbeeld, stijl of lagen). */
  onPass?: () => void
  /** Gezet door een `LayerOverlay`: de isolijnen tekenen dan zonder MapLibre-render. */
  requestRepaint?: () => void
  private map?: MapLibreMap
  private gl?: WebGL2RenderingContext
  private composite?: WebGLProgram
  private quad?: WebGLBuffer
  private screen?: WebGLBuffer
  private volume?: WebGLTexture
  /** Lijnen (device-resolutie) en vulling (ISOLINE_FILL_RESOLUTION). */
  private result?: RenderTarget
  private fillTarget?: RenderTarget
  private fill?: WebGLProgram
  private ringTexture?: WebGLTexture
  private hasRing = false
  private filled = false
  private readonly loaded: Uint8Array
  private frameKeys: string[] = []
  private time = 0
  private opacity = 0
  private version = 1
  private passedVersion = 0
  private passedCamera = ''
  private line?: WebGLProgram
  private corners?: WebGLBuffer
  private segments?: WebGLBuffer
  private segmentCount = 0
  private readonly tracer: ContourTracer
  private requestedTrace = ''
  private pendingTrace?: TraceResult
  /** Tracer-resultaten tot nu toe: nieuwe geometrie is ook een nieuwe snede. */
  private geometryVersion = 0
  private shownRings: ShortRing[] = []
  private shownTime = 0

  constructor(readonly grid: Grid, readonly depth: number, private style: IsolineStyle) {
    this.loaded = new Uint8Array(depth)
    this.tracer = new ContourTracer(grid, depth, (result) => this.traced(result))
  }

  onAdd(map: MapLibreMap, context: WebGLRenderingContext | WebGL2RenderingContext): void {
    const gl = context as WebGL2RenderingContext
    this.map = map
    this.gl = gl
    this.fill = link(gl, quadVertex, fillFragment)
    this.composite = link(gl, compositeVertex, compositeFragment)
    const west = this.grid.x0
    const east = west + this.grid.dx * this.grid.width
    const north = this.grid.y0
    const south = north + this.grid.dy * this.grid.height
    const nw = mercator(west, north), se = mercator(east, south)
    this.quad = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([nw.x, nw.y, 0, 0, se.x, nw.y, 1, 0, nw.x, se.y, 0, 1, se.x, se.y, 1, 1]), gl.STATIC_DRAW)
    this.screen = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.screen)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW)
    this.volume = gl.createTexture()!
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_3D, this.volume)
    // RG16F is in WebGL2 altijd lineair filterbaar, ook als 3D-texture (RG32F niet zonder extensie).
    gl.texStorage3D(gl.TEXTURE_3D, 1, gl.RG16F, this.grid.width, this.grid.height, this.depth)
    for (const parameter of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_3D, parameter, gl.LINEAR)
    for (const parameter of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T, gl.TEXTURE_WRAP_R]) gl.texParameteri(gl.TEXTURE_3D, parameter, gl.CLAMP_TO_EDGE)
    this.line = link(gl, lineVertex, lineFragment)
    this.corners = gl.createBuffer()!
    gl.bindBuffer(gl.ARRAY_BUFFER, this.corners)
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]), gl.STATIC_DRAW)
    this.segments = gl.createBuffer()!
    this.segmentCount = 0
    this.requestedTrace = ''
    this.result = renderTarget(gl)
    this.fillTarget = renderTarget(gl)
    this.filled = false
    this.ringTexture = gl.createTexture()!
    gl.bindTexture(gl.TEXTURE_2D, this.ringTexture)
    for (const parameter of [gl.TEXTURE_MIN_FILTER, gl.TEXTURE_MAG_FILTER]) gl.texParameteri(gl.TEXTURE_2D, parameter, gl.LINEAR)
    for (const parameter of [gl.TEXTURE_WRAP_S, gl.TEXTURE_WRAP_T]) gl.texParameteri(gl.TEXTURE_2D, parameter, gl.CLAMP_TO_EDGE)
    this.hasRing = false
    this.timer = GpuTimer.create(gl)
    this.stats.timing = this.timer ? 'gpu' : 'cpu'
    this.loaded.fill(0)
    this.passedVersion = 0
    this.version++
  }

  onRemove(_map: MapLibreMap, context: WebGLRenderingContext | WebGL2RenderingContext): void {
    const gl = context as WebGL2RenderingContext
    for (const texture of [this.volume, this.ringTexture, this.result?.texture, this.fillTarget?.texture]) if (texture) gl.deleteTexture(texture)
    for (const target of [this.result, this.fillTarget]) if (target) gl.deleteFramebuffer(target.framebuffer)
    this.result = this.fillTarget = undefined
    this.timer?.dispose()
    this.timer = undefined
    for (const buffer of [this.quad, this.screen, this.corners, this.segments]) if (buffer) gl.deleteBuffer(buffer)
    this.map = undefined
    this.gl = undefined
  }

  /** De tracer-worker leeft met de laag mee (onRemove kan gevolgd worden door een nieuwe onAdd). */
  dispose(): void {
    this.tracer.dispose()
  }

  hasLayer(index: number): boolean {
    return this.loaded[index] === 1
  }

  /** Korte ringen van de getekende snede (lijnlabels vervagen mee). */
  get rings(): readonly ShortRing[] {
    return this.shownRings
  }

  /** Tijd van de getekende snede: de worker loopt achter de scrubber aan. */
  get sliceTime(): number {
    return this.geometryVersion ? this.shownTime : this.time
  }

  frameKey(index: number): string | undefined {
    return this.frameKeys[index]
  }

  /**
   * Identiteit per uurlaag (chunk, frame). Een manifest-refresh met een nieuwe run
   * vervangt frames midden in de tijdlijn bij gelijke diepte; die lagen moeten opnieuw geüpload
   * worden, anders tekent de snede de oude run. Geeft de gewijzigde indices terug.
   */
  setFrameKeys(keys: readonly string[]): number[] {
    const changed: number[] = []
    for (let index = 0; index < this.depth; index++) {
      if (keys[index] === this.frameKeys[index]) continue
      this.loaded[index] = 0
      this.tracer.setLayer(index, undefined)
      changed.push(index)
    }
    this.frameKeys = keys.slice(0, this.depth)
    if (changed.length) this.invalidate()
    return changed
  }

  /** Uurframe `index` als laag van het volume; `field` is geblurd en opgevuld. */
  setLayer(index: number, field: PreparedField): void {
    const gl = this.gl
    if (!gl || !this.volume || index < 0 || index >= this.depth) return
    const interleaved = new Float32Array(field.values.length * 2)
    for (let cell = 0; cell < field.values.length; cell++) {
      interleaved[cell * 2] = field.values[cell]!
      interleaved[cell * 2 + 1] = field.valid[cell]!
    }
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_3D, this.volume)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4)
    gl.texSubImage3D(gl.TEXTURE_3D, 0, 0, 0, index, this.grid.width, this.grid.height, 1, gl.RG, gl.FLOAT, interleaved)
    this.tracer.setLayer(index, field)
    this.requestedTrace = ''
    this.loaded[index] = 1
    this.stats.uploads++
    this.invalidate()
  }

  /** Frame-index-coördinaat van de snede (links + mix). */
  setTime(time: number): void {
    if (time === this.time) return
    this.time = time
    // De worker levert de nieuwe snede; pas die geometrie is een nieuwe pass waard.
    this.repaint()
  }

  setOpacity(opacity: number): void {
    if (opacity === this.opacity) return
    this.opacity = opacity
    this.repaint()
  }

  setStyle(style: IsolineStyle): void {
    this.style = style
    this.invalidate()
  }

  prerender(context: WebGLRenderingContext | WebGL2RenderingContext, options: CustomRenderMethodInput): void {
    const gl = context as WebGL2RenderingContext
    const map = this.map
    if (!map || !this.line || this.opacity <= 0 || !this.ready()) return
    this.prerenderVector(gl, map, options.defaultProjectionData.mainMatrix)
  }

  private prerenderVector(gl: WebGL2RenderingContext, map: MapLibreMap, matrix: ArrayLike<number>): void {
    const request = this.traceRequest(map.getZoom())
    const key = JSON.stringify(request)
    if (key !== this.requestedTrace) {
      this.requestedTrace = key
      this.tracer.request(request)
    }
    if (this.pendingTrace) {
      const data = this.pendingTrace.data
      gl.bindBuffer(gl.ARRAY_BUFFER, this.segments!)
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW)
      this.segmentCount = data.length / SEGMENT_FLOATS
      this.shownRings = this.pendingTrace.rings
      this.shownTime = this.pendingTrace.request.time
      this.uploadRingFade(gl, this.pendingTrace.ringFade)
      this.pendingTrace = undefined
      this.geometryVersion++
    }
    if (!this.geometryVersion) return
    const width = Math.max(1, gl.drawingBufferWidth), height = Math.max(1, gl.drawingBufferHeight)
    const camera = `v${width}x${height}:${Array.prototype.join.call(matrix, ',')}:${this.geometryVersion}`
    if (camera === this.passedCamera && this.version === this.passedVersion) return
    this.vectorPass(gl, map, matrix, width, height)
    // Op de tijd van de getekende geometrie, niet de scrubber: de bandgrenzen vallen onder de lijnen.
    this.fillPass(gl, map, matrix, this.shownTime)
    this.passedCamera = camera
    this.passedVersion = this.version
    this.onPass?.()
  }

  /** Wat de worker moet traceren; de tolerantie in cellen volgt de zoom in machten van 2. */
  private traceRequest(zoom: number): TraceRequest {
    const pxPerCell = Math.abs(this.grid.dx) / (2 * Math.PI * 6378137) * 512 * 2 ** zoom
    const toleranceCells = 2 ** Math.round(Math.log2(ISOLINE_TOLERANCE_PX / pxPerCell))
    return { time: this.time, window: ISOLINE_WINDOW, step: this.style.step, toleranceCells, ringKm: ISOLINE_RING_KM, gradient: this.style.gradientFade ? ISOLINE_GRADIENT : undefined }
  }

  private traced(result: TraceResult | undefined): void {
    if (!result) return
    this.pendingTrace = result
    this.stats.traces = (this.stats.traces ?? 0) + 1
    this.stats.traceMs = smooth(this.stats.traceMs ?? 0, result.stats.ms)
    this.stats.segments = result.stats.segments
    this.stats.rings = result.stats.rings
    this.stats.fadedRings = result.stats.fadedRings
    this.repaint()
  }

  private vectorPass(gl: WebGL2RenderingContext, map: MapLibreMap, matrix: ArrayLike<number>, width: number, height: number): void {
    const restore = saveTarget(gl)
    bindTarget(gl, this.result!, width, height)
    gl.enable(gl.BLEND)
    // MAX: overlappende koppen en naden tellen niet op; de kleur is overal dezelfde.
    gl.blendEquation(gl.MAX)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.STENCIL_TEST)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    const ratio = window.devicePixelRatio || 1
    const { halfWidth, alpha } = lineProfile(isolineWidthCss(map.getZoom()) * ratio)
    // Rooster (kolom, rij) → mercator is affien; in float64 met de kaartmatrix vermenigvuldigd
    // houdt dat de vertexcoördinaten klein (0–225) en dus exact in float32.
    const circumference = 2 * Math.PI * 6378137
    const sx = this.grid.dx / circumference, sy = -this.grid.dy / circumference
    const ox = (this.grid.x0 + 0.5 * this.grid.dx + circumference / 2) / circumference
    const oy = (circumference / 2 - (this.grid.y0 + 0.5 * this.grid.dy)) / circumference
    const affine = [sx, 0, 0, 0, 0, sy, 0, 0, 0, 0, 1, 0, ox, oy, 0, 1]
    const program = this.line!
    gl.useProgram(program)
    const uniform = (name: string) => gl.getUniformLocation(program, name)
    gl.uniformMatrix4fv(uniform('u_matrix'), false, multiply(matrix, affine))
    gl.uniform2f(uniform('u_viewport'), width, height)
    gl.uniform1f(uniform('u_extent'), halfWidth + 1)
    gl.uniform1f(uniform('u_half_width'), halfWidth)
    gl.uniform1f(uniform('u_line_alpha'), alpha)
    gl.uniform3f(uniform('u_color'), ...this.style.color)
    const attributes: number[] = []
    const bind = (name: string, buffer: WebGLBuffer, size: number, stride: number, offset: number, divisor: number) => {
      const location = gl.getAttribLocation(program, name)
      if (location < 0) return
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer)
      gl.enableVertexAttribArray(location)
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, stride, offset)
      gl.vertexAttribDivisor(location, divisor)
      attributes.push(location)
    }
    const stride = SEGMENT_FLOATS * 4
    bind('a_corner', this.corners!, 2, 8, 0, 0)
    bind('a_segment', this.segments!, 4, stride, 0, 1)
    bind('a_alpha', this.segments!, 2, stride, 16, 1)
    if (this.segmentCount) this.measure('passMs', () => gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.segmentCount))
    // De context is gedeeld met de vulpass en de blit: divisors terug op 0.
    for (const location of attributes) {
      gl.vertexAttribDivisor(location, 0)
      gl.disableVertexAttribArray(location)
    }
    gl.blendEquation(gl.FUNC_ADD)
    gl.disable(gl.BLEND)
    this.stats.passPixels += width * height
    restore()
    this.stats.passes++
  }

  render(context: WebGLRenderingContext | WebGL2RenderingContext): void {
    const gl = context as WebGL2RenderingContext
    if (!this.composite || !this.result || this.opacity <= 0 || !this.passedVersion) return
    const program = this.composite
    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.screen!)
    const clip = gl.getAttribLocation(program, 'a_clip')
    gl.enableVertexAttribArray(clip)
    gl.vertexAttribPointer(clip, 2, gl.FLOAT, false, 8, 0)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_2D, this.result.texture)
    gl.uniform1i(gl.getUniformLocation(program, 'u_result'), 0)
    const filled = this.filled && this.style.fill > 0 && !!this.style.palette
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, filled ? this.fillTarget!.texture : null)
    gl.uniform1i(gl.getUniformLocation(program, 'u_fill'), 1)
    gl.uniform1f(gl.getUniformLocation(program, 'u_has_fill'), filled ? 1 : 0)
    gl.uniform1f(gl.getUniformLocation(program, 'u_line_opacity'), ISOLINE_LINE_OPACITY)
    gl.uniform1f(gl.getUniformLocation(program, 'u_opacity'), this.opacity)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    this.measure('compositeMs', () => gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4))
    this.stats.composites++
    this.stats.compositePixels += gl.drawingBufferWidth * gl.drawingBufferHeight
  }

  /** GPU-tijd via EXT_disjoint_timer_query_webgl2 (asynchroon, frames later binnen), anders CPU-tijd. */
  private measure(key: 'passMs' | 'compositeMs' | 'fillMs', draw: () => void): void {
    if (this.timer) {
      this.timer.collect()
      if (!this.timer.time(draw, (ms) => { this.stats[key] = smooth(this.stats[key], ms) })) draw()
      return
    }
    const started = performance.now()
    draw()
    this.stats[key] = smooth(this.stats[key], performance.now() - started)
  }

  /** Gemiddelde zichtbare dekking van de vulling (pixelsample van de vultexture × laagdekking), voor e2e. */
  fillCoverage(): number {
    const gl = this.gl, target = this.fillTarget
    if (!gl || !target || !this.filled || this.style.fill <= 0 || !this.style.palette || this.opacity <= 0) return 0
    const [width, height] = target.size
    const pixels = new Uint8Array(width * height * 4)
    const restore = saveTarget(gl)
    gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer)
    gl.readPixels(0, 0, width, height, gl.RGBA, gl.UNSIGNED_BYTE, pixels)
    restore()
    let sum = 0
    for (let index = 3; index < pixels.length; index += 4) sum += pixels[index]!
    return sum / (width * height * 255) * this.opacity
  }

  /** Offscreen snede in CSS-pixels × `resolution`: de device-DPR (2 op Retina) telt niet mee. */
  private targetSize(gl: WebGL2RenderingContext, resolution: number): [number, number] {
    const scale = Math.min(1, resolution) / Math.max(1, window.devicePixelRatio || 1)
    return [Math.max(1, Math.round(gl.drawingBufferWidth * scale)), Math.max(1, Math.round(gl.drawingBufferHeight * scale))]
  }

  private repaint(): void {
    if (this.requestRepaint) this.requestRepaint()
    else this.map?.triggerRepaint()
  }

  private ready(): boolean {
    return isolineLayerIndices(this.time, this.depth, ISOLINE_WINDOW).every((index) => this.loaded[index])
  }

  private invalidate(): void {
    this.version++
    this.repaint()
  }

  /** Bandkleuren onder de lijnen, op de snede `time`; op ISOLINE_FILL_RESOLUTION (het is glad). */
  private fillPass(gl: WebGL2RenderingContext, map: MapLibreMap, matrix: ArrayLike<number>, time: number): void {
    this.filled = false
    if (this.style.fill <= 0 || !this.style.palette) return
    const [width, height] = this.targetSize(gl, ISOLINE_FILL_RESOLUTION)
    const restore = saveTarget(gl)
    bindTarget(gl, this.fillTarget!, width, height)
    const program = this.fill!
    const uniform = this.useField(gl, program, map, matrix, (window.devicePixelRatio || 1) * width / Math.max(1, gl.drawingBufferWidth), time)
    gl.uniform1f(uniform('u_fill_base'), this.style.fill)
    gl.uniform1f(uniform('u_fill_smooth'), this.style.fillSmooth ? 1 : 0)
    const palette = paletteUniforms(this.style.palette)
    gl.uniform1fv(uniform('u_palette_t[0]'), palette.temperatures)
    gl.uniform3fv(uniform('u_palette_c[0]'), palette.colors)
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, this.ringTexture!)
    gl.uniform1i(uniform('u_ring'), 2)
    gl.uniform1f(uniform('u_has_ring'), this.hasRing ? 1 : 0)
    this.measure('fillMs', () => gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4))
    this.stats.passPixels += width * height
    restore()
    this.filled = true
    this.stats.fillPasses++
  }

  /** Veldquad en de gedeelde sampling-uniforms; `ratio` is doelpixels per CSS-pixel. */
  private useField(gl: WebGL2RenderingContext, program: WebGLProgram, map: MapLibreMap, matrix: ArrayLike<number>, ratio: number, time: number): (name: string) => WebGLUniformLocation | null {
    gl.disable(gl.BLEND)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.STENCIL_TEST)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)
    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad!)
    const position = gl.getAttribLocation(program, 'a_pos')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0)
    const uv = gl.getAttribLocation(program, 'a_uv')
    gl.enableVertexAttribArray(uv)
    gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8)
    const uniform = (name: string) => gl.getUniformLocation(program, name)
    const world = 512 * 2 ** map.getZoom() * ratio
    gl.uniformMatrix4fv(uniform('u_matrix'), false, matrix as Float32List)
    gl.uniform2f(uniform('u_grid_size'), this.grid.width, this.grid.height)
    gl.uniform1f(uniform('u_depth'), this.depth)
    gl.uniform1f(uniform('u_time'), time)
    gl.uniform1f(uniform('u_step'), this.style.step)
    gl.uniform1f(uniform('u_fade'), this.style.gradientFade ? 1 : 0)
    gl.uniform2f(uniform('u_fade_gradient'), ...ISOLINE_GRADIENT)
    gl.uniform1f(uniform('u_km_per_px'), EQUATOR_KM * Math.cos(map.getCenter().lat * Math.PI / 180) / world)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_3D, this.volume!)
    gl.uniform1i(uniform('u_field'), 0)
    return uniform
  }

  private uploadRingFade(gl: WebGL2RenderingContext, raster: Float32Array | undefined): void {
    this.hasRing = !!raster
    if (!raster) return
    gl.activeTexture(gl.TEXTURE2)
    gl.bindTexture(gl.TEXTURE_2D, this.ringTexture!)
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 4)
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG16F, this.grid.width, this.grid.height, 0, gl.RG, gl.FLOAT, raster)
  }
}

/** Isolijnbreedte in CSS-px: 0,9 tot zoom 5, 1,4 vanaf zoom 9 (U25: ×0,7 t.o.v. 1,3–2,0). */
export function isolineWidthCss(zoom: number): number {
  return zoom <= 5 ? 0.9 : zoom >= 9 ? 1.4 : 0.9 + (zoom - 5) * 0.125
}

/**
 * Capsuleprofiel voor een lijn van `width` doelpixels. Onder 1 px verliest dat profiel zijn
 * behoud van dekking over subpixelposities (bij 0,65 px: 0,83 op een pixelmidden, 0,65
 * ertussen), dus bewegende lijnen flikkeren; daarom minimaal 1 px en de rest als lagere alpha.
 */
export function lineProfile(width: number): { halfWidth: number; alpha: number } {
  return width >= 1 ? { halfWidth: width / 2, alpha: 1 } : { halfWidth: 0.5, alpha: Math.max(0, width) }
}

interface RenderTarget {
  texture: WebGLTexture
  framebuffer: WebGLFramebuffer
  size: [number, number]
}

function renderTarget(gl: WebGL2RenderingContext): RenderTarget {
  return { texture: gl.createTexture()!, framebuffer: gl.createFramebuffer()!, size: [0, 0] }
}

/** Offscreen target van `width`×`height` (her)aanmaken en binden. */
function bindTarget(gl: WebGL2RenderingContext, target: RenderTarget, width: number, height: number): void {
  gl.activeTexture(gl.TEXTURE1)
  gl.bindTexture(gl.TEXTURE_2D, target.texture)
  if (target.size[0] !== width || target.size[1] !== height) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    target.size = [width, height]
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer)
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, target.texture, 0)
  gl.viewport(0, 0, width, height)
}

/** Framebuffer en viewport van de aanroeper terugzetten na een offscreen pass. */
function saveTarget(gl: WebGL2RenderingContext): () => void {
  const framebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
  const viewport = gl.getParameter(gl.VIEWPORT) as Int32Array
  return () => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.viewport(viewport[0]!, viewport[1]!, viewport[2]!, viewport[3]!)
  }
}

/** 4×4 kolom-major a·b in float64 (de kaartmatrix is Float64Array). */
function multiply(a: ArrayLike<number>, b: ArrayLike<number>): Float32Array {
  const out = new Float32Array(16)
  for (let column = 0; column < 4; column++) {
    for (let row = 0; row < 4; row++) {
      let sum = 0
      for (let k = 0; k < 4; k++) sum += a[k * 4 + row]! * b[column * 4 + k]!
      out[column * 4 + row] = sum
    }
  }
  return out
}

function smooth(previous: number, sample: number): number {
  return previous ? previous * 0.8 + sample * 0.2 : sample
}

interface TimerQueryExtension {
  TIME_ELAPSED_EXT: number
  GPU_DISJOINT_EXT: number
}

/** Hooguit een handvol queries tegelijk in de lucht; oudere uitslagen worden per frame opgehaald. */
class GpuTimer {
  private readonly pending: Array<{ query: WebGLQuery; done: (ms: number) => void }> = []

  private constructor(private readonly gl: WebGL2RenderingContext, private readonly ext: TimerQueryExtension) {}

  static create(gl: WebGL2RenderingContext): GpuTimer | undefined {
    const ext = gl.getExtension('EXT_disjoint_timer_query_webgl2') as TimerQueryExtension | null
    return ext ? new GpuTimer(gl, ext) : undefined
  }

  time(draw: () => void, done: (ms: number) => void): boolean {
    if (this.pending.length >= 8) return false
    const query = this.gl.createQuery()
    if (!query) return false
    this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, query)
    draw()
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT)
    this.pending.push({ query, done })
    return true
  }

  collect(): void {
    const gl = this.gl
    const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT) as boolean
    while (this.pending.length && gl.getQueryParameter(this.pending[0]!.query, gl.QUERY_RESULT_AVAILABLE)) {
      const { query, done } = this.pending.shift()!
      if (!disjoint) done((gl.getQueryParameter(query, gl.QUERY_RESULT) as number) / 1e6)
      gl.deleteQuery(query)
    }
  }

  dispose(): void {
    for (const { query } of this.pending) this.gl.deleteQuery(query)
    this.pending.length = 0
  }
}

/** Uurlagen die de snede op frame-index `time` raakt (lineair twee, B-spline vier). */
export function isolineLayerIndices(time: number, depth: number, window: number): number[] {
  const base = Math.floor(time)
  const range = window >= 1 ? [base - 1, base, base + 1, base + 2] : [base, base + 1]
  return [...new Set(range.map((index) => Math.max(0, Math.min(depth - 1, index))))]
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
