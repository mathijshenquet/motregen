import type { CustomLayerInterface, CustomRenderMethodInput, Map as MapLibreMap } from 'maplibre-gl'
import { MercatorCoordinate } from 'maplibre-gl'
import type { Grid } from './contract'
import type { PreparedField } from './isoline-field'
import { SEGMENT_FLOATS, type ShortRing } from './isoline-contours'
import { ContourTracer, type TraceRequest, type TraceResult } from './isoline-tracer'
import type { IsolineOdd } from './isolines'

// Hoekbakken voor de richting-onafhankelijke stippel; zie de shader. Stippel i.p.v. streep:
// de basiskaart tekent provinciegrenzen al gestreept.
const DASH_BINS = 16
export const DASH_PERIOD_PX = 5
export const DASH_ON_PX = 2.4

export interface IsolineStyle {
  step: number
  odd: IsolineOdd
  color: [number, number, number]
  /** 0 = lineair tussen twee uurframes, 1 = kubische B-spline over vier. */
  window: number
  /** Ruimtelijk bicubisch (8 fetches) i.p.v. bilineair (2). */
  bicubic: boolean
  /** 0 = geen vervaging, 1 = op |∇T| (°C/km), 2 = op lijnsnelheid (km/u; kost 8 extra fetches). */
  fade: number
  gradient: [number, number]
  speed: [number, number]
  /** Lijnen als vector (exacte B-spline-contouren, getekend op device-resolutie) i.p.v. per pixel. */
  vector: boolean
  /** Vector: gesloten lijnen korter dan dit (km) vervagen; 0 = uit. */
  ringKm: number
  /** Vector: maximale afwijking koorde ↔ lijn in CSS-px (verdichting). */
  tolerancePx: number
}

export interface IsolinePassTuning {
  /** Offscreen pixels per CSS-pixel van de snede (device-DPR telt niet mee: hooguit 1). */
  resolution: number
  /** Maximale herberekeningsfrequentie bij tijdwijzigingen; kaartbewegingen gaan altijd direct. */
  maxHz: number
}

export const DEFAULT_PASS_TUNING: IsolinePassTuning = { resolution: 0.5, maxHz: 60 }

const EQUATOR_KM = 40_075.017
const DASH_DIRECTIONS = new Float32Array(Array.from({ length: DASH_BINS + 1 }, (_, bin) => [Math.cos(bin * Math.PI / DASH_BINS), Math.sin(bin * Math.PI / DASH_BINS)]).flat())

const quadVertex = `#version 300 es
in vec2 a_pos;
in vec2 a_uv;
uniform mat4 u_matrix;
uniform vec2 u_origin;
uniform float u_world;
out vec2 v_uv;
out vec2 v_px;
void main() {
  v_uv = a_uv;
  v_px = (a_pos - u_origin) * u_world;
  gl_Position = u_matrix * vec4(a_pos, 0.0, 1.0);
}`

// Het veld is een impliciete afstandsfunctie: voor niveau L is (T − L)/|∇T| de afstand in
// pixels, dus uniforme lijnbreedte en AA zonder geometrie, alle niveaus tegelijk via
// fract(T/stap). De tijd is de derde texture-as: de snede t = scrubber kost één (lineair) of
// twee (B-spline) trilineaire fetches per tap.
const contourFragment = `#version 300 es
precision highp float;
precision highp sampler3D;
uniform sampler3D u_field;
uniform vec2 u_grid_size;
uniform float u_depth;
uniform float u_time;
uniform float u_window;
uniform float u_bicubic;
uniform float u_step;
uniform float u_half_width;
uniform float u_odd_half_width;
uniform float u_odd_alpha;
uniform float u_dashed;
uniform float u_dash_period;
uniform float u_dash_on;
uniform vec3 u_color;
uniform vec2 u_dash_dirs[${DASH_BINS + 1}];
uniform float u_fade;
uniform vec2 u_fade_gradient;
uniform vec2 u_fade_speed;
uniform float u_km_per_px;
in vec2 v_uv;
in vec2 v_px;
out vec4 color;

const float PI = 3.141592653589793;
const float BINS = ${DASH_BINS.toFixed(1)};

// Eén mipniveau: textureLod mag ook na de (niet-uniforme) vroege return.
vec2 fetchAt(vec2 uv, float index) {
  return textureLod(u_field, vec3(uv, (index + 0.5) / u_depth), 0.0).rg;
}

// Kubische B-spline in de tijd met twee lineaire fetches (GPU Gems 2, hfst. 20): C2, dus de
// lijnen veranderen niet op elk heel uur van richting.
vec2 sampleTime(vec2 uv, float time) {
  if (u_window < 0.5) return fetchAt(uv, time);
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
  if (u_bicubic < 0.5) return sampleTime(uv, time);
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

// Symmetrisch rond 0 (dash(u) == dash(-u)), zodat de richtingsomslag bij 180° naadloos is.
float dash(float u) {
  float x = abs(fract(u / u_dash_period + 0.5) - 0.5) * u_dash_period;
  return clamp(u_dash_on * 0.5 + 0.5 - x, 0.0, 1.0);
}

void main() {
  vec2 field = sampleField(v_uv, u_time);
  float s = field.r / u_step;
  vec2 ds = vec2(dFdx(s), dFdy(s));
  vec2 pdx = dFdx(v_px), pdy = dFdy(v_px);
  float level = floor(s + 0.5);
  float distance = abs(s - level) / max(length(ds), 1e-6);
  float odd = step(0.5, mod(level * u_step + 0.25, 2.0));
  float line = clamp(mix(u_half_width, u_odd_half_width, odd) + 0.5 - distance, 0.0, 1.0) * mix(1.0, u_odd_alpha, odd) * step(0.5, field.g);
  // Na de afgeleiden (die uniforme controleflow vragen): het gros van de pixels ligt niet op
  // een lijn en heeft vervaging noch stippel nodig.
  if (line <= 0.0) {
    color = vec4(0.0);
    return;
  }
  // Waar |∇T| klein is dragen de lijnen weinig informatie en bewegen ze het snelst
  // (lijnsnelheid = |∂T/∂t| / |∇T|): daar vervagen ze.
  float gradient = length(ds) * u_step / u_km_per_px;
  if (u_fade > 0.5 && u_fade < 1.5) line *= smoothstep(u_fade_gradient.x, u_fade_gradient.y, gradient);
  if (u_fade > 1.5) {
    float change = abs(sampleField(v_uv, u_time + 0.25).r - field.r) * 4.0;
    line *= 1.0 - smoothstep(u_fade_speed.x, u_fade_speed.y, change / max(gradient, 1e-4));
  }
  if (odd * u_dashed < 0.5) {
    color = vec4(u_color * line, line);
    return;
  }
  // Een fragmentshader kent geen booglengte. Projectie op de raaklijn werkt voor rechte stukken
  // maar breekt bij kromming (|p| is groot); daarom projecteren we op een vaste richting per
  // hoekbak van 180°/16: binnen een bak wijkt de schaal < 2 % af, en tussen twee bakken
  // mengen we beide patronen zodat de fase nergens springt.
  vec2 tangent = pdx * -ds.y + pdy * ds.x;
  float bin = mod(atan(tangent.y, tangent.x), PI) / (PI / BINS);
  int b0 = min(int(bin), ${DASH_BINS - 1});
  float pattern = mix(dash(dot(v_px, u_dash_dirs[b0])), dash(dot(v_px, u_dash_dirs[b0 + 1])), bin - float(b0));
  float alpha = line * pattern;
  color = vec4(u_color * alpha, alpha);
}`

const compositeVertex = `#version 300 es
in vec2 a_clip;
out vec2 v_uv;
void main() {
  v_uv = a_clip * 0.5 + 0.5;
  gl_Position = vec4(a_clip, 0.0, 1.0);
}`

const compositeFragment = `#version 300 es
precision mediump float;
uniform sampler2D u_result;
uniform float u_opacity;
in vec2 v_uv;
out vec4 color;
void main() {
  color = texture(u_result, v_uv) * u_opacity;
}`

// Vector: één instanced quad per segment, in schermpixels verbreed; de fragmentshader rekent de
// afstand tot het segment (capsule: ronde koppen), dus naden tussen segmenten zijn naadloos
// onder MAX-blending. De stippel loopt over de echte booglengte.
const lineVertex = `#version 300 es
in vec2 a_corner;
in vec4 a_segment;
in vec2 a_arc;
in vec2 a_alpha;
in float a_odd;
uniform mat4 u_matrix;
uniform vec2 u_viewport;
uniform float u_extent;
flat out vec2 v_a;
flat out vec2 v_b;
flat out vec2 v_arc;
flat out vec2 v_alpha;
flat out float v_odd;
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
  v_a = a; v_b = b; v_arc = a_arc; v_alpha = a_alpha; v_odd = a_odd; v_px = p;
  gl_Position = vec4(p / u_viewport * 2.0 - 1.0, 0.0, 1.0);
}`

const lineFragment = `#version 300 es
precision highp float;
uniform float u_half_width;
uniform float u_odd_half_width;
uniform float u_odd_alpha;
uniform float u_dashed;
uniform float u_dash_period;
uniform float u_dash_on;
uniform float u_px_per_cell;
uniform vec3 u_color;
flat in vec2 v_a;
flat in vec2 v_b;
flat in vec2 v_arc;
flat in vec2 v_alpha;
flat in float v_odd;
in vec2 v_px;
out vec4 color;
float dash(float u) {
  float x = abs(fract(u / u_dash_period + 0.5) - 0.5) * u_dash_period;
  return clamp(u_dash_on * 0.5 + 0.5 - x, 0.0, 1.0);
}
void main() {
  vec2 ab = v_b - v_a;
  float t = clamp(dot(v_px - v_a, ab) / max(dot(ab, ab), 1e-8), 0.0, 1.0);
  float d = length(v_px - (v_a + ab * t));
  float line = clamp(mix(u_half_width, u_odd_half_width, v_odd) + 0.5 - d, 0.0, 1.0) * mix(1.0, u_odd_alpha, v_odd) * mix(v_alpha.x, v_alpha.y, t);
  if (v_odd * u_dashed > 0.5) line *= dash(mix(v_arc.x, v_arc.y, t) * u_px_per_cell);
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
  timing: 'gpu' | 'cpu'
  /** Vector: tracer-tijd (worker) van de laatste snede, segmenten en lusjes. */
  traceMs?: number
  traces?: number
  segments?: number
  rings?: number
  fadedRings?: number
}

/**
 * Isolijnen als snede door het (x, y, t)-volume van uurframes. De contour-pass rendert alleen
 * het zichtbare kaartextent naar een offscreen texture (lagere resolutie), en alleen als de
 * snede verandert: tijd (hooguit `maxHz`), kaartbeeld, stijl of nieuwe uurframes. Elke andere
 * repaint (bv. windpartikels) kost één texture-blit; zonder focus niets.
 */
export class IsolineLayer implements CustomLayerInterface {
  readonly id = 'motregen-isolines'
  readonly type = 'custom' as const
  readonly renderingMode = '2d' as const
  readonly stats: IsolinePassStats = { passes: 0, composites: 0, uploads: 0, passPixels: 0, compositePixels: 0, passMs: 0, compositeMs: 0, timing: 'cpu' }
  private timer?: GpuTimer
  /** Na elke contour-pass: de snede is veranderd (tijd, kaartbeeld, stijl of lagen). */
  onPass?: () => void
  /** Gezet door een `LayerOverlay`: de isolijnen tekenen dan zonder MapLibre-render. */
  requestRepaint?: () => void
  private map?: MapLibreMap
  private gl?: WebGL2RenderingContext
  private contour?: WebGLProgram
  private composite?: WebGLProgram
  private quad?: WebGLBuffer
  private screen?: WebGLBuffer
  private volume?: WebGLTexture
  private result?: WebGLTexture
  private framebuffer?: WebGLFramebuffer
  private resultSize: [number, number] = [0, 0]
  private readonly loaded: Uint8Array
  private frameKeys: string[] = []
  private time = 0
  private opacity = 0
  private version = 1
  private passedVersion = 0
  private passedCamera = ''
  private lastPass = -Infinity
  private catchUp?: number
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

  constructor(readonly grid: Grid, readonly depth: number, private style: IsolineStyle, private tuning: IsolinePassTuning = DEFAULT_PASS_TUNING) {
    this.loaded = new Uint8Array(depth)
    this.tracer = new ContourTracer(grid, depth, (result) => this.traced(result))
  }

  onAdd(map: MapLibreMap, context: WebGLRenderingContext | WebGL2RenderingContext): void {
    const gl = context as WebGL2RenderingContext
    this.map = map
    this.gl = gl
    this.contour = link(gl, quadVertex, contourFragment)
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
    this.result = gl.createTexture()!
    this.framebuffer = gl.createFramebuffer()!
    this.resultSize = [0, 0]
    this.timer = GpuTimer.create(gl)
    this.stats.timing = this.timer ? 'gpu' : 'cpu'
    this.loaded.fill(0)
    this.passedVersion = 0
    this.version++
  }

  onRemove(_map: MapLibreMap, context: WebGLRenderingContext | WebGL2RenderingContext): void {
    const gl = context as WebGL2RenderingContext
    window.clearTimeout(this.catchUp)
    this.catchUp = undefined
    for (const texture of [this.volume, this.result]) if (texture) gl.deleteTexture(texture)
    if (this.framebuffer) gl.deleteFramebuffer(this.framebuffer)
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

  /** Korte ringen van de getekende vectorsnede (lijnlabels vervagen mee); raster: geen. */
  get rings(): readonly ShortRing[] {
    return this.style.vector ? this.shownRings : []
  }

  /** Tijd van de getekende snede: vector loopt de worker achter de scrubber aan. */
  get sliceTime(): number {
    return this.style.vector && this.geometryVersion ? this.shownTime : this.time
  }

  frameKey(index: number): string | undefined {
    return this.frameKeys[index]
  }

  /**
   * Identiteit per uurlaag (chunk, frame, blur). Een manifest-refresh met een nieuwe run
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
    // Vector: de worker levert de nieuwe snede; pas die geometrie is een nieuwe pass waard.
    if (this.style.vector) {
      this.repaint()
      return
    }
    this.version++
    // Afspelen zet elke frame een nieuwe tijd; een kaartrender daarvoor zou tussen twee passes
    // alleen de oude snede blitten (plus volledige symboolplaatsing). Vraag hem pas aan als het
    // maxHz-venster een pass toelaat (PO-heropname U8c: 120 kaartrenders/s bij afspelen+focus).
    const wait = this.lastPass + 1000 / this.tuning.maxHz - performance.now()
    if (wait <= 0 || !this.passedVersion) this.repaint()
    else this.scheduleCatchUp(wait)
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

  setTuning(tuning: IsolinePassTuning): void {
    this.tuning = tuning
    this.invalidate()
  }

  prerender(context: WebGLRenderingContext | WebGL2RenderingContext, options: CustomRenderMethodInput): void {
    const gl = context as WebGL2RenderingContext
    const map = this.map
    if (!map || !this.contour || this.opacity <= 0 || !this.ready()) return
    if (this.style.vector) {
      this.prerenderVector(gl, map, options.defaultProjectionData.mainMatrix)
      return
    }
    const [width, height] = this.targetSize(gl, this.tuning.resolution)
    const matrix = options.defaultProjectionData.mainMatrix
    const camera = `${width}x${height}:${Array.prototype.join.call(matrix, ',')}`
    if (camera === this.passedCamera && this.version === this.passedVersion) return
    const now = performance.now()
    const wait = this.lastPass + 1000 / this.tuning.maxHz - now
    // Alleen tijd/stijl gewijzigd: begrens de cadans en hergebruik tot dan het vorige resultaat.
    if (camera === this.passedCamera && this.passedVersion && wait > 0) {
      this.scheduleCatchUp(wait)
      return
    }
    this.pass(gl, map, matrix, width, height)
    this.passedCamera = camera
    this.passedVersion = this.version
    this.lastPass = now
    this.onPass?.()
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
      this.pendingTrace = undefined
      this.geometryVersion++
    }
    if (!this.geometryVersion) return
    const width = Math.max(1, gl.drawingBufferWidth), height = Math.max(1, gl.drawingBufferHeight)
    const camera = `v${width}x${height}:${Array.prototype.join.call(matrix, ',')}:${this.geometryVersion}`
    if (camera === this.passedCamera && this.version === this.passedVersion) return
    this.vectorPass(gl, map, matrix, width, height)
    this.passedCamera = camera
    this.passedVersion = this.version
    this.lastPass = performance.now()
    this.onPass?.()
  }

  /** Wat de worker moet traceren; de tolerantie in cellen volgt de zoom in machten van 2. */
  private traceRequest(zoom: number): TraceRequest {
    const { step, window, ringKm, tolerancePx, fade, gradient } = this.style
    const pxPerCell = Math.abs(this.grid.dx) / (2 * Math.PI * 6378137) * 512 * 2 ** zoom
    const toleranceCells = 2 ** Math.round(Math.log2(Math.max(tolerancePx, 0.01) / pxPerCell))
    return { time: this.time, window, step, toleranceCells, ringKm, gradient: fade > 0.5 && fade < 1.5 ? gradient : undefined }
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
    const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
    const previousViewport = gl.getParameter(gl.VIEWPORT) as Int32Array
    this.bindResult(gl, width, height)
    gl.enable(gl.BLEND)
    // MAX: overlappende koppen en naden tellen niet op; de kleur is overal dezelfde.
    gl.blendEquation(gl.MAX)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.STENCIL_TEST)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    const ratio = window.devicePixelRatio || 1
    const zoom = map.getZoom()
    const world = 512 * 2 ** zoom * ratio
    const widthCss = zoom <= 5 ? 1.3 : zoom >= 9 ? 2 : 1.3 + (zoom - 5) * 0.175
    const halfWidth = Math.max(0.5, widthCss * ratio / 2)
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
    this.oddUniforms(gl, uniform, widthCss * ratio)
    gl.uniform1f(uniform('u_dash_period'), DASH_PERIOD_PX * ratio)
    gl.uniform1f(uniform('u_dash_on'), DASH_ON_PX * ratio)
    gl.uniform1f(uniform('u_px_per_cell'), Math.abs(sx) * world)
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
    bind('a_arc', this.segments!, 2, stride, 16, 1)
    bind('a_alpha', this.segments!, 2, stride, 24, 1)
    bind('a_odd', this.segments!, 1, stride, 32, 1)
    if (this.segmentCount) this.measure('passMs', () => gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.segmentCount))
    // De context is gedeeld met de rasterpass en de blit: divisors terug op 0.
    for (const location of attributes) {
      gl.vertexAttribDivisor(location, 0)
      gl.disableVertexAttribArray(location)
    }
    gl.blendEquation(gl.FUNC_ADD)
    gl.disable(gl.BLEND)
    this.stats.passPixels += width * height

    gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer)
    gl.viewport(previousViewport[0]!, previousViewport[1]!, previousViewport[2]!, previousViewport[3]!)
    this.stats.passes++
  }

  /** Oneven niveaus: halve breedte, stippel of gelijk; `width` is de volle breedte in (offscreen) pixels. */
  private oddUniforms(gl: WebGL2RenderingContext, uniform: (name: string) => WebGLUniformLocation | null, width: number): void {
    const { halfWidth, alpha } = oddLine(this.style.odd, width)
    gl.uniform1f(uniform('u_odd_half_width'), halfWidth)
    gl.uniform1f(uniform('u_odd_alpha'), alpha)
    gl.uniform1f(uniform('u_dashed'), this.style.odd === 'dash' ? 1 : 0)
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
    gl.bindTexture(gl.TEXTURE_2D, this.result)
    gl.uniform1i(gl.getUniformLocation(program, 'u_result'), 0)
    gl.uniform1f(gl.getUniformLocation(program, 'u_opacity'), this.opacity)
    gl.enable(gl.BLEND)
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA)
    this.measure('compositeMs', () => gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4))
    this.stats.composites++
    this.stats.compositePixels += gl.drawingBufferWidth * gl.drawingBufferHeight
  }

  /** GPU-tijd via EXT_disjoint_timer_query_webgl2 (asynchroon, frames later binnen), anders CPU-tijd. */
  private measure(key: 'passMs' | 'compositeMs', draw: () => void): void {
    if (this.timer) {
      this.timer.collect()
      if (!this.timer.time(draw, (ms) => { this.stats[key] = smooth(this.stats[key], ms) })) draw()
      return
    }
    const started = performance.now()
    draw()
    this.stats[key] = smooth(this.stats[key], performance.now() - started)
  }

  /**
   * Meet de contour-pass (ms per pass; readPixels dwingt de GPU-sync af, gl.finish doet dat in
   * Chrome niet) op de huidige snede, bv. vanuit
   * de console op een echte telefoon. Laat het zichtbare resultaat ongemoeid.
   */
  bench(passes: number, resolution = this.tuning.resolution): number | undefined {
    const gl = this.gl, map = this.map
    if (!gl || !map || !this.contour || !this.ready()) return undefined
    const matrix = map.transform.getProjectionDataForCustomLayer(false).mainMatrix
    const [width, height] = this.targetSize(gl, resolution)
    const sync = () => {
      const previous = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer!)
      gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4))
      gl.bindFramebuffer(gl.FRAMEBUFFER, previous)
    }
    this.pass(gl, map, matrix, width, height)
    sync()
    const started = performance.now()
    for (let index = 0; index < passes; index++) this.pass(gl, map, matrix, width, height)
    sync()
    const elapsed = (performance.now() - started) / passes
    this.passedCamera = ''
    this.repaint()
    return elapsed
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

  private scheduleCatchUp(wait: number): void {
    if (this.catchUp === undefined) this.catchUp = window.setTimeout(() => { this.catchUp = undefined; this.repaint() }, wait)
  }

  private ready(): boolean {
    return isolineLayerIndices(this.time, this.depth, this.style.window).every((index) => this.loaded[index])
  }

  private invalidate(): void {
    this.version++
    this.repaint()
  }

  /** Offscreen resultaat van `width`×`height` als render target (her)aanmaken en binden. */
  private bindResult(gl: WebGL2RenderingContext, width: number, height: number): void {
    gl.activeTexture(gl.TEXTURE1)
    gl.bindTexture(gl.TEXTURE_2D, this.result!)
    if (this.resultSize[0] !== width || this.resultSize[1] !== height) {
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
      this.resultSize = [width, height]
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffer!)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.result!, 0)
    gl.viewport(0, 0, width, height)
  }

  private pass(gl: WebGL2RenderingContext, map: MapLibreMap, matrix: ArrayLike<number>, width: number, height: number): void {
    const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null
    const previousViewport = gl.getParameter(gl.VIEWPORT) as Int32Array
    this.bindResult(gl, width, height)
    gl.disable(gl.BLEND)
    gl.disable(gl.DEPTH_TEST)
    gl.disable(gl.STENCIL_TEST)
    gl.clearColor(0, 0, 0, 0)
    gl.clear(gl.COLOR_BUFFER_BIT)

    const scale = gl.drawingBufferWidth ? width / gl.drawingBufferWidth : 1
    const ratio = (window.devicePixelRatio || 1) * scale
    const zoom = map.getZoom()
    const world = 512 * 2 ** zoom * ratio
    // Oorsprong op een grof raster rond het midden: houdt v_px klein genoeg voor float32 en
    // verschuift het stippelpatroon alleen bij een grote pan.
    const center = MercatorCoordinate.fromLngLat(map.getCenter())
    const cell = 4096 / world
    const widthCss = zoom <= 5 ? 1.3 : zoom >= 9 ? 2 : 1.3 + (zoom - 5) * 0.175
    const program = this.contour!
    gl.useProgram(program)
    gl.bindBuffer(gl.ARRAY_BUFFER, this.quad!)
    const position = gl.getAttribLocation(program, 'a_pos')
    gl.enableVertexAttribArray(position)
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 16, 0)
    const uv = gl.getAttribLocation(program, 'a_uv')
    gl.enableVertexAttribArray(uv)
    gl.vertexAttribPointer(uv, 2, gl.FLOAT, false, 16, 8)
    const uniform = (name: string) => gl.getUniformLocation(program, name)
    gl.uniformMatrix4fv(uniform('u_matrix'), false, matrix as Float32List)
    gl.uniform2f(uniform('u_origin'), Math.round(center.x / cell) * cell, Math.round(center.y / cell) * cell)
    gl.uniform1f(uniform('u_world'), world)
    gl.uniform2f(uniform('u_grid_size'), this.grid.width, this.grid.height)
    gl.uniform1f(uniform('u_depth'), this.depth)
    gl.uniform1f(uniform('u_time'), this.time)
    gl.uniform1f(uniform('u_window'), this.style.window)
    gl.uniform1f(uniform('u_bicubic'), this.style.bicubic ? 1 : 0)
    gl.uniform1f(uniform('u_step'), this.style.step)
    gl.uniform1f(uniform('u_half_width'), Math.max(0.5, widthCss * ratio / 2))
    this.oddUniforms(gl, uniform, widthCss * ratio)
    gl.uniform1f(uniform('u_dash_period'), DASH_PERIOD_PX * ratio)
    gl.uniform1f(uniform('u_dash_on'), DASH_ON_PX * ratio)
    gl.uniform3f(uniform('u_color'), ...this.style.color)
    gl.uniform2fv(uniform('u_dash_dirs[0]'), DASH_DIRECTIONS)
    gl.uniform1f(uniform('u_fade'), this.style.fade)
    gl.uniform2f(uniform('u_fade_gradient'), ...this.style.gradient)
    gl.uniform2f(uniform('u_fade_speed'), ...this.style.speed)
    gl.uniform1f(uniform('u_km_per_px'), EQUATOR_KM * Math.cos(map.getCenter().lat * Math.PI / 180) / world)
    gl.activeTexture(gl.TEXTURE0)
    gl.bindTexture(gl.TEXTURE_3D, this.volume!)
    gl.uniform1i(uniform('u_field'), 0)
    this.measure('passMs', () => gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4))
    this.stats.passPixels += width * height

    gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer)
    gl.viewport(previousViewport[0]!, previousViewport[1]!, previousViewport[2]!, previousViewport[3]!)
    this.stats.passes++
  }
}

/**
 * Halve breedte met hetzelfde capsuleprofiel als de hoofdlijn. Onder 1 px verliest dat profiel
 * zijn behoud van dekking over subpixelposities (bij 0,65 px: 0,83 op een pixelmidden, 0,65
 * ertussen), dus bewegende lijnen flikkeren; daarom minimaal 1 px en de rest als lagere alpha.
 */
export function oddLine(odd: IsolineOdd, width: number): { halfWidth: number; alpha: number } {
  const full = Math.max(0.5, width / 2)
  if (odd !== 'half') return { halfWidth: full, alpha: 1 }
  const half = width / 2
  return half >= 1 ? { halfWidth: half / 2, alpha: 1 } : { halfWidth: 0.5, alpha: half }
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
