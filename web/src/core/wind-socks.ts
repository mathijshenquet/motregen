import type { Map as MapLibreMap } from 'maplibre-gl'
import { beaufortScale } from './wind-beaufort.js'
import { DEFAULT_WINDSOCK_BADGE, WINDSOCK_SAMPLES, windsockBadge, windsockShape, type WindsockBadge, type WindsockShape } from './wind-glyph.js'
import { advanceSock, angleDifference, DEFAULT_WINDSOCK_CURVATURE, sampleWind, SOCK_SNAP_SECONDS, sockReach, socksClear, swayBends, WINDSOCK_APPEAR_MARGIN, windsockHeadings, windsockPhase, type SockReach, type Spring, type WindsockField } from './windsock-flow.js'
import type { TemperaturePlace } from './temperature.js'
import { windValue, type WindUnit } from './weather.js'
import { markLayerDrawn, recordPerfPhase } from './perf.js'
import { WINDSOCK_ANCHOR_OFFSETS } from './windsock-anchors.js'
import { drawSock, sockCutPath } from './wind-sock-draw.js'
import { domRest } from './dom-rest.js'
import { PredrawnSocks, predrawnPose, type PredrawnPose, type PredrawnWave } from './windsock-predrawn.js'
import { MapLabelPlacer, type Offset, type Placement } from './map-label-placement.js'
import { MAP_LABEL_FONT_FAMILY, viewportMapLabelSize } from './map-labels.js'

interface Sock {
  place: TemperaturePlace
  /** Web-Mercator-meters. */
  x: number
  y: number
  phase: number
  /** Voorkeursplek naast de plaatsnaam (CSS-px, uit het naammasker van de bot); de ladder begint hier. */
  offset: Offset
  /** Gekozen plek van de laatste indeling; zonder plek valt de zak weg (geen ruimte naast naam, pin of bediening). */
  placed?: Placement
  /** Getekende richting (kompasgraden) en windkracht, die het veld met momentum volgen. */
  heading?: Spring
  strength?: Spring
  /** Opgetelde golffase van het wuiven (radialen). */
  wave: number
}

/**
 * Trillingsframes per seconde. Een golf van 1,6–3 Hz is bij 30 fps vloeiend; vaker kostte op het telefoonprofiel
 * (4× CPU-rem, software-raster) de pagina de helft van zijn fps.
 */
export const WINDSOCK_FLUTTER_FPS = 30

/**
 * Wuifbudget (U107): wuiven zonder interactie kost op de telefoon continu een volle canvas per frame. Na
 * `slowAfterMs` zonder aanraken, scrollen, toetsen, tijdstap of afspelen gaat het naar `slowFps`; na `restAfterMs`
 * dempt het wuiven in `restFadeMs` uit tot rust (richting en kracht blijven kloppen) en stopt de tekenlus. Buiten
 * beeld (weggescrold, verborgen tab) tekent de laag niet. Elke interactie zet het weer aan.
 */
export const WINDSOCK_IDLE = { slowAfterMs: 30_000, slowFps: 15, restAfterMs: 180_000, restFadeMs: 2_000 } as const
const ACTIVITY_EVENTS = ['pointerdown', 'pointermove', 'wheel', 'keydown', 'touchstart', 'scroll'] as const

const MERCATOR_RADIUS = 6378137

export interface WindsockLayerOptions {
  reducedMotion: () => boolean
  /** Alleen `?dev&windfactor=`: vermenigvuldigt de wind van de zakken, om harde wind te bekijken. */
  speedFactor: number
  /** De locatiepin: zakken wijken ervoor, zoals de getallen in Gevoel. */
  pin: () => { lng: number; lat: number } | undefined
  /** Alleen `?dev&zakcanvas=los` (U111): elke zak een eigen kleine canvas in plaats van één schermvullende. */
  separateCanvases?: boolean
  /** Alleen `?dev&zakdpr=` (U111): bovengrens voor de pixeldichtheid van de zakcanvas. */
  maxPixelRatio?: number
  /** Alleen `?dev&zakclip=aan` (U111): het gat rond de badge weer wegknippen met `clip()` (de oude manier). */
  clipCut?: boolean
  /** Alleen `?dev&zakpaden=zuinig` (U111): banden als twee vullingen en de badge uit een bitmapcache. */
  leanPaths?: boolean
  /** Alleen `?dev&zakpaden=bitmap` (U111): voorgetekende zakken per gekwantiseerde stand (windsock-predrawn). */
  predrawn?: boolean
  /** Alleen `?dev&zakgolf=regelmatig` (U111, met `predrawn`): zie `PredrawnWave`. */
  predrawnWave?: PredrawnWave
  /** Alleen `?dev&zak2d=software` (U111): `willReadFrequently`, dan tekent Firefox de canvas in het contentproces. */
  softwareCanvas?: boolean
}

/** Eigen canvas van één zak (`separateCanvases`), in canvaspixels rond de afgeronde ankerpixel van de zak. */
interface SockCanvas {
  canvas: HTMLCanvasElement
  context: CanvasRenderingContext2D
  left: number
  top: number
  right: number
  bottom: number
  originX: number
  originY: number
}

interface SockDraw {
  sock: Sock
  x: number
  y: number
  shape: WindsockShape
  badge: WindsockBadge
  label: string
  rect: DirtyRect
  /** Met `predrawn`: de gekwantiseerde stand; `shape` is dan die stand op het scherm. */
  pose?: PredrawnPose
}

/** Ring van uitwijkplekken rond de voorkeursplek in CSS-px: eerst dichtbij, dan verder weg (zoals PLACE_LADDER). */
const SOCK_RING: readonly Offset[] = [[0, 0], ...[14, 22, 30].flatMap((distance) => [0, 2, 6, 4, 1, 3, 5, 7].map((step): Offset => {
  const angle = step / 8 * 2 * Math.PI - Math.PI / 2
  return [Math.round(Math.cos(angle) * distance), Math.round(Math.sin(angle) * distance)]
}))]
/** Minimale tijd tussen twee indelingen tijdens pannen/zoomen; bij stilstand (idle) altijd opnieuw. */
const LAYOUT_INTERVAL_MS = 250

/**
 * De windzakken op een eigen 2D-canvas boven alle kaartlagen. Eén canvas in plaats van een DOM-element per
 * plaats, omdat de zak bij elke tijdstap (tween) en bij harde wind elke frame (trilling) opnieuw getekend wordt.
 * Animeert alleen zolang er een trillende zak in beeld is.
 */
export class WindsockLayer {
  readonly canvas: HTMLCanvasElement
  private readonly context: CanvasRenderingContext2D
  /** Krijgt dekking en zichtbaarheid: de canvas, of met `separateCanvases` de houder van de zakcanvassen. */
  private readonly surface: HTMLElement
  private readonly sockCanvases = new Map<Sock, SockCanvas>()
  private sockCanvasRatio = 0
  private scratch?: { canvas: HTMLCanvasElement; context: CanvasRenderingContext2D }
  private readonly discCache = new Map<string, { canvas: HTMLCanvasElement; half: number }>()
  private predrawn?: PredrawnSocks
  private socks: Sock[] = []
  private field?: WindsockField
  private unit: WindUnit = 'bft'
  private opacity = 0
  private dark = false
  private frame?: number
  private delay?: number
  private drawnCamera = ''
  /** Canvaspixels van de zakken in de vorige tekening; zonder: onbekend, dan de hele canvas wissen. */
  private drawnRects?: DirtyRect[]
  /** Wandklok (s) van de vorige tekening, voor het momentum. */
  private drawnAt = -Infinity
  private readonly placer: MapLabelPlacer
  private layoutDirty = true
  private lastLayout = -Infinity
  draws = 0
  // Containermaat gecachet en ververst op MapLibre's resize: clientWidth per frame dwong een layout af zodra de
  // DOM vuil was (temperatuurgetallen, scrubber) (U109).
  private width = 0
  private height = 0
  private readonly mapRendered = () => { if (this.opacity > 0 && this.camera() !== this.drawnCamera) this.draw() }
  private readonly resized = () => { this.measure(); this.layoutDirty = true; this.draw() }
  /** Plaatsnamen staan pas vast als de kaart stilvalt: dan één keer opnieuw indelen per nieuwe camerastand. */
  private readonly idle = () => {
    const camera = this.camera()
    if (camera === this.idleCamera) return
    this.idleCamera = camera
    this.layoutDirty = true
    this.draw()
  }
  private idleCamera = ''
  private layoutCamera = ''
  private fieldChanged = false
  /** Laatste interactie (performance.now()), voor het wuifbudget. */
  private lastActivity = performance.now()
  private inView = true
  private readonly visibility = new IntersectionObserver(([entry]) => {
    const inView = entry?.isIntersecting ?? true
    if (inView === this.inView) return
    this.inView = inView
    if (inView) this.draw()
    else this.stopAnimation()
  })
  private readonly activity = () => {
    const resting = this.wuifCalm(performance.now()) < 1
    this.lastActivity = performance.now()
    // Een rustende of vertraagde lus komt meteen weer op gang.
    if (resting && this.frame === undefined) this.draw()
  }
  private readonly pageVisibility = () => { if (document.visibilityState === 'visible') this.draw(); else this.stopAnimation() }

  constructor(private readonly map: MapLibreMap, private readonly options: WindsockLayerOptions) {
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'map-overlay map-overlay-windsocks'
    this.canvas.setAttribute('aria-hidden', 'true')
    map.getCanvasContainer().append(this.canvas)
    if (options.separateCanvases) {
      this.surface = document.createElement('div')
      this.surface.className = 'map-overlay map-overlay-windsocks-los'
      this.surface.setAttribute('aria-hidden', 'true')
      this.canvas.width = this.canvas.height = 0
      this.canvas.after(this.surface)
    } else {
      this.surface = this.canvas
    }
    this.surface.style.opacity = '0'
    this.surface.style.visibility = 'hidden'
    this.context = this.context2d(this.canvas)
    this.placer = new MapLabelPlacer(map, options.pin)
    this.measure()
    map.on('render', this.mapRendered)
    map.on('resize', this.resized)
    map.on('idle', this.idle)
    this.visibility.observe(map.getContainer())
    for (const type of ACTIVITY_EVENTS) window.addEventListener(type, this.activity, { passive: true, capture: true })
    document.addEventListener('visibilitychange', this.pageVisibility)
    // Canvas tekent niet opnieuw als de webfont binnenkomt: daarna één keer opnieuw.
    void document.fonts?.load(`800 13px ${MAP_LABEL_FONT_FAMILY}`).then(() => this.draw())
  }

  /** De pin is verplaatst: direct opnieuw indelen (niet pas bij de volgende pan of tijdstap). */
  pinMoved(): void {
    this.layoutDirty = true
    this.draw()
  }

  setPlaces(places: readonly TemperaturePlace[]): void {
    const same = places.length === this.socks.length && places.every((place, index) => this.socks[index]!.place.name === place.name)
    if (same) return
    this.socks = places.map((place) => {
      const x = place.lng * Math.PI / 180 * MERCATOR_RADIUS
      const y = Math.log(Math.tan(Math.PI / 4 + place.lat * Math.PI / 360)) * MERCATOR_RADIUS
      return { place, x, y, phase: windsockPhase(place.name), offset: WINDSOCK_ANCHOR_OFFSETS[place.name] ?? [0, 0], wave: 0 }
    })
    this.layoutDirty = true
    this.draw()
  }

  setField(field: WindsockField | undefined): void {
    // App roept dit bij elke laagtekening aan, vaak met hetzelfde veld in een nieuw object: alleen een andere
    // kaarttijd (scrubben, afspelen) telt als kijken en zet het wuifbudget terug.
    if (sameField(field, this.field)) return
    this.lastActivity = performance.now()
    this.field = field
    // Richting en lengte zijn veranderd: opnieuw toetsen of zakken elkaar raken (gedoseerd in draw).
    this.fieldChanged = true
    this.draw()
  }

  setUnit(unit: WindUnit): void {
    if (unit === this.unit) return
    this.unit = unit
    this.draw()
  }

  setTheme(dark: boolean): void {
    if (dark === this.dark) return
    this.dark = dark
    this.draw()
  }

  setOpacity(opacity: number): void {
    if (opacity === this.opacity) return
    const wasHidden = this.opacity <= 0
    this.opacity = opacity
    this.surface.style.opacity = String(opacity)
    this.surface.style.visibility = opacity > 0 ? '' : 'hidden'
    if (wasHidden !== opacity <= 0) this.draw()
  }

  destroy(): void {
    this.stopAnimation()
    this.map.off('render', this.mapRendered)
    this.map.off('resize', this.resized)
    this.map.off('idle', this.idle)
    this.visibility.disconnect()
    for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, this.activity, { capture: true })
    document.removeEventListener('visibilitychange', this.pageVisibility)
    this.canvas.remove()
    if (this.surface !== this.canvas) this.surface.remove()
  }

  /** Aantal zakken dat de laatste tekening in beeld zette (e2e en screenshots). */
  drawnCount = 0
  /** Hoogste windkracht van de laatste tekening, continu (e2e en screenshots). */
  drawnMaxStrength = 0

  draw(): void {
    this.stopAnimation()
    this.drawnCamera = this.camera()
    if (!this.width || !this.height) this.measure()
    const ratio = Math.min(window.devicePixelRatio || 1, this.options.maxPixelRatio ?? Infinity)
    const { width, height } = this
    const separate = this.surface !== this.canvas
    if (!separate && this.canvas.width !== Math.round(width * ratio) || this.canvas.height !== Math.round(height * ratio)) {
      this.canvas.width = Math.round(width * ratio)
      this.canvas.height = Math.round(height * ratio)
      this.drawnRects = []
      this.canvas.style.width = `${width}px`
      this.canvas.style.height = `${height}px`
    }
    const context = this.context
    context.setTransform(1, 0, 0, 1, 0, 0)
    this.drawnCount = 0
    this.drawnMaxStrength = 0
    const field = this.field
    if (!field || this.opacity <= 0) {
      context.clearRect(0, 0, this.canvas.width, this.canvas.height)
      this.drawnRects = []
      if (separate) this.paintSeparate([], ratio)
      if (this.canvas.dataset.socks !== '0|0') this.canvas.dataset.socks = '0|0'
      return
    }
    this.draws++
    const started = performance.now()
    context.setTransform(ratio, 0, 0, ratio, 0, 0)
    const bearing = this.map.getBearing()
    const seconds = performance.now() / 1000
    const calm = this.wuifCalm(started)
    const animate = !this.options.reducedMotion() && calm > 0
    // Na een pauze (verborgen tab, Wind net open) of zonder beweging springt de zak direct naar het veld.
    const elapsed = seconds - this.drawnAt
    const snap = !animate || !(elapsed > 0) || elapsed > SOCK_SNAP_SECONDS
    this.drawnAt = seconds
    let fluttering = false
    let settling = false
    const size = viewportMapLabelSize()
    // Indelen bij een nieuwe stand (pin, plekken, stilstand) of tijdens bewegen hooguit om de LAYOUT_INTERVAL_MS.
    if (this.layoutDirty || ((this.fieldChanged || this.drawnCamera !== this.layoutCamera) && started - this.lastLayout >= LAYOUT_INTERVAL_MS)) {
      this.fieldChanged = false
      this.layoutCamera = this.drawnCamera
      this.layout(size, started)
      recordPerfPhase('windsock-layout', performance.now() - started)
    }
    const drawStarted = performance.now()
    const pending: SockDraw[] = []
    for (const sock of this.socks) {
      if (!sock.placed) continue
      const screen = this.map.project([sock.place.lng, sock.place.lat])
      const wind = sampleWind(field, 0, sock.x, sock.y)
      const compass = wind && windsockHeadings(field, sock.x, sock.y, DEFAULT_WINDSOCK_CURVATURE)
      if (!wind || !compass) continue
      const speed = Math.hypot(wind[0], wind[1]) * this.options.speedFactor
      const target = compass[0]!
      if (advanceSock(sock, target, beaufortScale(speed), elapsed, snap)) settling = true
      const strength = Math.max(0, sock.strength!.value)
      const flutterBend = animate ? swayBends(strength, sock.wave, seconds, sock.phase).map((bend) => bend * calm) : undefined
      if (flutterBend) fluttering = true
      const base = sock.heading!.value
      // Voorgetekend alleen zonder kromming langs de zak (de standaard): dan is de vorm een draaiing van één stand.
      const pose = this.options.predrawn && compass.every((heading) => heading === target)
        ? predrawnPose(strength, sock.wave, sock.phase, seconds, animate ? calm : 0, base - bearing, this.options.predrawnWave)
        : undefined
      const headings = compass.map((heading, index) => base + angleDifference(target, heading) - bearing + (flutterBend?.[index] ?? 0))
      const shape = pose?.screen ?? windsockShape(strength, headings, 'kaart')
      const x = screen.x + sock.placed.dx, y = screen.y + sock.placed.dy, label = String(windValue(speed, this.unit))
      const badge = windsockBadge(shape, DEFAULT_WINDSOCK_BADGE, label, size)
      pending.push({ sock, x, y, shape, badge, label, rect: sockRect(x, y, shape, badge, ratio), pose })
      this.drawnCount++
      this.drawnMaxStrength = Math.max(this.drawnMaxStrength, strength)
    }
    // Alleen wissen waar een zak stond of komt (U111): een volle canvas wissen en hertekenen kostte op Firefox
    // Android (canvas-2D op de CPU) per frame het hele scherm. Zonder bekende vorige stand alles.
    if (separate) this.paintSeparate(pending, ratio)
    else {
      const rects = pending.map((draw) => draw.rect)
      context.setTransform(1, 0, 0, 1, 0, 0)
      const cleared = this.drawnRects ? [...this.drawnRects, ...rects] : undefined
      const canvasArea = this.canvas.width * this.canvas.height
      if (!cleared || cleared.reduce((sum, rect) => sum + rect.width * rect.height, 0) > canvasArea / 2) context.clearRect(0, 0, this.canvas.width, this.canvas.height)
      else for (const rect of cleared) context.clearRect(rect.x, rect.y, rect.width, rect.height)
      this.drawnRects = rects
      context.setTransform(ratio, 0, 0, ratio, 0, 0)
      // Het gat wegvegen raakt alles wat er al staat: een zak die over een eerder getekende zak van deze frame valt,
      // gaat via de kladcanvas (zelden; de indeling houdt zakken uit elkaar). Het gat ligt binnen de eigen rechthoek.
      pending.forEach((draw, index) => {
        const overlaps = !this.options.clipCut && pending.slice(0, index).some((other) => rectsOverlap(other.rect, draw.rect))
        if (overlaps) this.drawViaScratch(context, draw, ratio)
        else this.drawSock(context, draw, ratio, 0, 0)
      })
    }
    recordPerfPhase('windsock-draw', performance.now() - drawStarted, { socks: this.drawnCount, fluttering })
    if (this.drawnCount) markLayerDrawn('windzakken')
    const summary = `${this.drawnCount}|${Math.round(this.drawnMaxStrength * 10) / 10}`
    if (this.canvas.dataset.socks !== summary) this.canvas.dataset.socks = summary
    // Met `domRest` niet per tekening in de DOM (U111 ronde 4); rigs lezen `draws` via `__motregenWindsocks()`.
    if (!domRest) this.canvas.dataset.draws = String(this.draws)
    if (this.predrawn) this.canvas.dataset.predrawn = `${this.predrawn.hits}/${this.predrawn.misses}/${this.predrawn.size}`
    if ((fluttering || settling) && this.inView && document.visibilityState !== 'hidden') this.scheduleFlutter(started, this.flutterFps(started))
  }

  /**
   * Plek per zak met de gedeelde uitwijkregel (map-label-placement): de badge (de mast met het getal) mag niet over
   * een plaatsnaam, de pin, de bediening of een andere badge vallen. De ladder begint bij de vaste voorkeursplek.
   */
  private layout(size: number, now: number): void {
    this.layoutDirty = false
    this.lastLayout = now
    this.placer.begin()
    const side = 2 * (windsockBadge(STRAIGHT, DEFAULT_WINDSOCK_BADGE, '0', size).cutRadius + 1)
    const reaches: SockReach[] = []
    const field = this.field, bearing = this.map.getBearing()
    for (const sock of this.socks) {
      const screen = this.map.project([sock.place.lng, sock.place.lat])
      const ladder = SOCK_RING.map(([dx, dy]): Offset => [sock.offset[0] + dx, sock.offset[1] + dy])
      const wind = field && sampleWind(field, 0, sock.x, sock.y)
      const compass = wind && windsockHeadings(field, sock.x, sock.y, DEFAULT_WINDSOCK_CURVATURE)
      const strength = wind ? beaufortScale(Math.hypot(wind[0], wind[1]) * this.options.speedFactor) : 0
      const shown = sock.placed !== undefined
      let reach: SockReach | undefined
      // Geen zakken over elkaar (windsock-flow `socksClear`); een zak die erbij komt, vraagt wat meer ruimte.
      const clear = (dx: number, dy: number) => {
        if (!compass) return true
        reach = sockReach([screen.x + dx, screen.y + dy], compass[0]! - bearing, strength)
        return reaches.every((other) => socksClear(reach!, other, shown ? 1 : WINDSOCK_APPEAR_MARGIN))
      }
      sock.placed = this.placer.place(screen.x, screen.y, { width: side, height: side }, ladder, sock.placed?.index, clear)
      if (sock.placed && reach) reaches.push(reach)
    }
  }

  /**
   * `separateCanvases`: elke zak op een eigen canvas, die alleen groeit (zo trilt de zak zonder nieuwe canvas) en
   * alleen verschuift als het anker een canvaspixel verschuift. De zak valt op dezelfde subpixelfase als op de grote
   * canvas, dus dezelfde pixels; per frame gaat alleen de oppervlakte van de zakken naar de compositor.
   */
  private paintSeparate(draws: readonly SockDraw[], ratio: number): void {
    if (ratio !== this.sockCanvasRatio) {
      for (const entry of this.sockCanvases.values()) entry.canvas.remove()
      this.sockCanvases.clear()
      this.sockCanvasRatio = ratio
    }
    const drawn = new Set<Sock>()
    for (const draw of draws) {
      const anchorX = Math.floor(draw.x * ratio), anchorY = Math.floor(draw.y * ratio)
      const { rect } = draw
      let entry = this.sockCanvases.get(draw.sock)
      if (!entry) {
        const canvas = document.createElement('canvas')
        canvas.className = 'map-overlay'
        this.surface.append(canvas)
        entry = { canvas, context: this.context2d(canvas), left: 0, top: 0, right: 0, bottom: 0, originX: NaN, originY: NaN }
        this.sockCanvases.set(draw.sock, entry)
      }
      const left = rect.x - anchorX, top = rect.y - anchorY, right = left + rect.width, bottom = top + rect.height
      if (left < entry.left || top < entry.top || right > entry.right || bottom > entry.bottom || !entry.canvas.width) {
        // Ruim groeien: een trillende zak verandert elke frame een paar pixels van omvang.
        const slack = Math.ceil(SOCK_RECT_MARGIN * ratio)
        entry.left = Math.min(entry.left, left - slack)
        entry.top = Math.min(entry.top, top - slack)
        entry.right = Math.max(entry.right, right + slack)
        entry.bottom = Math.max(entry.bottom, bottom + slack)
        entry.canvas.width = entry.right - entry.left
        entry.canvas.height = entry.bottom - entry.top
        entry.canvas.style.width = `${entry.canvas.width / ratio}px`
        entry.canvas.style.height = `${entry.canvas.height / ratio}px`
      }
      const originX = anchorX + entry.left, originY = anchorY + entry.top
      if (originX !== entry.originX || originY !== entry.originY) {
        entry.originX = originX
        entry.originY = originY
        entry.canvas.style.left = `${originX / ratio}px`
        entry.canvas.style.top = `${originY / ratio}px`
      }
      if (entry.canvas.style.visibility) entry.canvas.style.visibility = ''
      const context = entry.context
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, entry.canvas.width, entry.canvas.height)
      context.setTransform(ratio, 0, 0, ratio, -originX, -originY)
      this.drawSock(context, draw, ratio, originX, originY)
      drawn.add(draw.sock)
    }
    const current = new Set(this.socks)
    for (const [sock, entry] of this.sockCanvases) {
      if (drawn.has(sock)) continue
      if (!current.has(sock)) {
        entry.canvas.remove()
        this.sockCanvases.delete(sock)
      } else if (entry.canvas.style.visibility !== 'hidden') entry.canvas.style.visibility = 'hidden'
    }
  }

  /**
   * Een zak die een andere raakt: op zijn rechthoek in de kladcanvas, dan op gehele canvaspixels erover. Niet voor elke
   * zak: in Firefox kost elke kladtekening een framebufferwissel en een upload (Gecko-profiel ronde 2).
   */
  private drawViaScratch(target: CanvasRenderingContext2D, draw: SockDraw, ratio: number): void {
    const { rect } = draw
    if (!this.scratch) {
      const canvas = document.createElement('canvas')
      this.scratch = { canvas, context: this.context2d(canvas) }
    }
    const { canvas, context } = this.scratch
    if (canvas.width < rect.width || canvas.height < rect.height) {
      canvas.width = Math.max(canvas.width, rect.width)
      canvas.height = Math.max(canvas.height, rect.height)
    }
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, rect.width, rect.height)
    context.setTransform(ratio, 0, 0, ratio, -rect.x, -rect.y)
    this.drawSock(context, draw, ratio, rect.x, rect.y)
    target.setTransform(1, 0, 0, 1, 0, 0)
    target.drawImage(canvas, 0, 0, rect.width, rect.height, rect.x, rect.y, rect.width, rect.height)
    target.setTransform(ratio, 0, 0, ratio, 0, 0)
  }

  private context2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
    return canvas.getContext('2d', this.options.softwareCanvas ? { willReadFrequently: true } : undefined)!
  }

  /** `offsetX/Y`: canvaspixel van de doelcanvas waar de transform (ratio, 0, 0, ratio, -offsetX, -offsetY) begint. */
  private drawSock(context: CanvasRenderingContext2D, draw: Omit<SockDraw, 'sock' | 'rect'>, ratio: number, offsetX: number, offsetY: number): void {
    const { x, y, shape, badge, label, pose } = draw
    const lean = this.options.leanPaths === true || pose !== undefined
    context.save()
    context.translate(x, y)
    if (pose) {
      this.predrawn ??= new PredrawnSocks((canvas) => this.context2d(canvas), MAP_LABEL_FONT_FAMILY)
      this.predrawn.draw(context, pose, ratio, this.dark)
      context.globalCompositeOperation = 'destination-out'
      context.fill(sockCutPath(badge))
    } else {
      drawSock({ context, shape, badge, label, dark: this.dark, fontFamily: MAP_LABEL_FONT_FAMILY, cut: this.options.clipCut ? 'clip' : 'erase', parts: lean ? 'body' : 'all', mergedBands: lean })
    }
    context.restore()
    if (!lean) return
    this.drawCachedDisc(context, draw, ratio, offsetX, offsetY)
    // Het getal live: Gecko zet glyphs per canvas op de pixel, uit een cache schoof het tot een canvaspixel.
    context.save()
    context.translate(x, y)
    drawSock({ context, shape, badge, label, dark: this.dark, fontFamily: MAP_LABEL_FONT_FAMILY, parts: 'label' })
    context.restore()
  }

  /**
   * `leanPaths`: de schijf van de badge verandert alleen met zijn maat, dus één bitmap per maat en subpixelfase (kwart
   * canvaspixel) in plaats van drie paden per zak per frame.
   */
  private drawCachedDisc(context: CanvasRenderingContext2D, draw: Omit<SockDraw, 'sock' | 'rect'>, ratio: number, offsetX: number, offsetY: number): void {
    const { badge } = draw
    const centreX = (draw.x + badge.x) * ratio - offsetX, centreY = (draw.y + badge.y) * ratio - offsetY
    let baseX = Math.floor(centreX), baseY = Math.floor(centreY)
    let phaseX = Math.round((centreX - baseX) * BADGE_PHASES), phaseY = Math.round((centreY - baseY) * BADGE_PHASES)
    if (phaseX === BADGE_PHASES) { baseX++; phaseX = 0 }
    if (phaseY === BADGE_PHASES) { baseY++; phaseY = 0 }
    const key = `${badge.radius}|${ratio}|${phaseX}|${phaseY}`
    let cached = this.discCache.get(key)
    if (!cached) {
      if (this.discCache.size > 256) this.discCache.clear()
      // Schaduw 1,3 px omlaag, halve inktrand en antialias, ruim.
      const half = Math.ceil((badge.radius + 3) * ratio)
      const canvas = document.createElement('canvas')
      canvas.width = canvas.height = 2 * half + 1
      const cacheContext = this.context2d(canvas)
      cacheContext.setTransform(ratio, 0, 0, ratio, half + phaseX / BADGE_PHASES - badge.x * ratio, half + phaseY / BADGE_PHASES - badge.y * ratio)
      drawSock({ context: cacheContext, shape: draw.shape, badge, label: '', dark: this.dark, fontFamily: MAP_LABEL_FONT_FAMILY, parts: 'disc' })
      cached = { canvas, half }
      this.discCache.set(key, cached)
    }
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.drawImage(cached.canvas, baseX - cached.half, baseY - cached.half)
    context.setTransform(ratio, 0, 0, ratio, -offsetX, -offsetY)
  }

  /** Volgende trillingsframe, niet vaker dan WINDSOCK_FLUTTER_FPS: elke frame zet de hele canvas opnieuw neer. */
  private scheduleFlutter(drawnAt: number, fps: number): void {
    const wait = drawnAt + 1_000 / fps - 4 - performance.now()
    if (wait > 0) {
      this.delay = window.setTimeout(() => {
        this.delay = undefined
        this.frame = requestAnimationFrame(() => { this.frame = undefined; this.draw() })
      }, wait)
      return
    }
    this.frame = requestAnimationFrame(() => { this.frame = undefined; this.draw() })
  }

  /** Wuifsterkte 1 → 0 na lang niets doen (WINDSOCK_IDLE). */
  private wuifCalm(now: number): number {
    const idle = now - this.lastActivity
    return Math.max(0, Math.min(1, 1 - (idle - WINDSOCK_IDLE.restAfterMs) / WINDSOCK_IDLE.restFadeMs))
  }

  private flutterFps(now: number): number {
    return now - this.lastActivity < WINDSOCK_IDLE.slowAfterMs ? WINDSOCK_FLUTTER_FPS : WINDSOCK_IDLE.slowFps
  }

  private stopAnimation(): void {
    if (this.frame !== undefined) cancelAnimationFrame(this.frame)
    window.clearTimeout(this.delay)
    this.frame = this.delay = undefined
  }

  private measure(): void {
    const container = this.map.getContainer()
    this.width = container.clientWidth
    this.height = container.clientHeight
  }

  private camera(): string {
    const center = this.map.getCenter()
    return `${center.lng},${center.lat},${this.map.getZoom()},${this.map.getBearing()},${this.width}x${this.height}`
  }
}

/** Dev-knop `?dev&windfactor=`; zonder knop de gekozen windmodus. */
export function windsockDevOptions(params: URLSearchParams): Omit<WindsockLayerOptions, 'reducedMotion' | 'pin'> {
  const factor = Number(params.get('windfactor'))
  return { speedFactor: Number.isFinite(factor) && factor > 0 ? factor : 1 }
}

function sameField(next: WindsockField | undefined, current: WindsockField | undefined): boolean {
  if (!next || !current) return next === current
  const [a, b] = [next.grid, current.grid]
  const sameGrid = a === b || (a.x0 === b.x0 && a.y0 === b.y0 && a.dx === b.dx && a.dy === b.dy && a.width === b.width && a.height === b.height)
  return sameGrid && next.slices.every((slice, index) => {
    const other = current.slices[index]!
    return slice.left === other.left && slice.right === other.right && slice.mix === other.mix
  })
}

interface DirtyRect { x: number; y: number; width: number; height: number }

function rectsOverlap(a: DirtyRect, b: DirtyRect): boolean {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height
}

/** Subpixelfasen per canvaspixel voor de schijfcache: een kwart pixel verschuiving valt op DPR 3 niet op. */
const BADGE_PHASES = 4

/**
 * Ruimte rond de omtrek van zak en badge in CSS-px: de breedste lijn (3,5 px schaduw, halve breedte), de
 * schaduwverschuiving (1,3 px omlaag) en antialiasing, ruim genomen.
 */
const SOCK_RECT_MARGIN = 4

/** Canvaspixels (afgerond naar buiten) die een zak op (x, y) kan raken. */
export function sockRect(x: number, y: number, shape: WindsockShape, badge: WindsockBadge, ratio: number): DirtyRect {
  let left = badge.x - badge.radius, right = badge.x + badge.radius, top = badge.y - badge.radius, bottom = badge.y + badge.radius
  for (const [px, py] of [...shape.left, ...shape.right]) {
    left = Math.min(left, px); right = Math.max(right, px); top = Math.min(top, py); bottom = Math.max(bottom, py)
  }
  const x0 = Math.floor((x + left - SOCK_RECT_MARGIN) * ratio), y0 = Math.floor((y + top - SOCK_RECT_MARGIN) * ratio)
  const x1 = Math.ceil((x + right + SOCK_RECT_MARGIN) * ratio), y1 = Math.ceil((y + bottom + SOCK_RECT_MARGIN) * ratio)
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 }
}

/** Een rechte zak, alleen om de badgemaat te bepalen (die hangt niet van de vorm af). */
const STRAIGHT = windsockShape(0, Array<number>(WINDSOCK_SAMPLES + 1).fill(0), 'kaart')
