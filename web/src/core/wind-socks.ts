import type { Map as MapLibreMap } from 'maplibre-gl'
import { beaufortScale } from './wind-beaufort.js'
import { DEFAULT_WINDSOCK_BADGE, WINDSOCK_SAMPLES, windsockBadge, windsockShape, type WindsockShape } from './wind-glyph.js'
import { advanceWave, angleDifference, DEFAULT_WINDSOCK_CURVATURE, followSpring, sampleWind, swayBends, WINDSOCK_MOMENTUM, windsockHeadings, windsockPhase, type Spring, type WindsockField } from './windsock-flow.js'
import type { TemperaturePlace } from './temperature.js'
import { windValue, type WindUnit } from './weather.js'
import { recordPerfPhase } from './perf.js'
import { WINDSOCK_ANCHOR_OFFSETS } from './windsock-anchors.js'
import { drawSock } from './wind-sock-draw.js'
import { MapLabelPlacer, type Offset, type Placement } from './map-label-placement.js'
import { MAP_LABEL_FONT_FAMILY, mapLabelRegime, mapLabelSize, type MapLabelRegime } from './map-labels.js'

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
  /** Alleen `?dev&regime=`: de typeschaalstap van het kaartregime (U107). */
  regime: MapLabelRegime
  /** De locatiepin: zakken wijken ervoor, zoals de getallen in Gevoel. */
  pin: () => { lng: number; lat: number } | undefined
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
  private socks: Sock[] = []
  private field?: WindsockField
  private unit: WindUnit = 'bft'
  private opacity = 0
  private dark = false
  private frame?: number
  private delay?: number
  private drawnCamera = ''
  /** Wandklok (s) van de vorige tekening, voor het momentum. */
  private drawnAt = -Infinity
  private readonly placer: MapLabelPlacer
  private layoutDirty = true
  private lastLayout = -Infinity
  draws = 0
  private readonly mapRendered = () => { if (this.camera() !== this.drawnCamera) this.draw() }
  private readonly resized = () => { this.layoutDirty = true; this.draw() }
  /** Plaatsnamen staan pas vast als de kaart stilvalt: dan nog één keer opnieuw indelen. */
  private readonly idle = () => { this.layoutDirty = true; this.draw() }
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
    this.canvas.style.opacity = '0'
    this.canvas.style.visibility = 'hidden'
    map.getCanvasContainer().append(this.canvas)
    this.context = this.canvas.getContext('2d')!
    this.placer = new MapLabelPlacer(map, options.pin)
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
    // Een nieuwe kaarttijd (scrubben, afspelen) is kijken: het wuifbudget begint opnieuw.
    if (field !== this.field) this.lastActivity = performance.now()
    this.field = field
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
    this.canvas.style.opacity = String(opacity)
    this.canvas.style.visibility = opacity > 0 ? '' : 'hidden'
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
  }

  /** Aantal zakken dat de laatste tekening in beeld zette (e2e en screenshots). */
  drawnCount = 0
  /** Hoogste windkracht van de laatste tekening, continu (e2e en screenshots). */
  drawnMaxStrength = 0

  draw(): void {
    this.stopAnimation()
    this.drawnCamera = this.camera()
    const container = this.map.getContainer()
    const ratio = window.devicePixelRatio || 1
    const width = container.clientWidth, height = container.clientHeight
    if (this.canvas.width !== Math.round(width * ratio) || this.canvas.height !== Math.round(height * ratio)) {
      this.canvas.width = Math.round(width * ratio)
      this.canvas.height = Math.round(height * ratio)
      this.canvas.style.width = `${width}px`
      this.canvas.style.height = `${height}px`
    }
    const context = this.context
    context.setTransform(1, 0, 0, 1, 0, 0)
    context.clearRect(0, 0, this.canvas.width, this.canvas.height)
    this.drawnCount = 0
    this.drawnMaxStrength = 0
    const field = this.field
    if (!field || this.opacity <= 0) {
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
    const snap = !animate || !(elapsed > 0) || elapsed > 1
    this.drawnAt = seconds
    let fluttering = false
    let settling = false
    const size = mapLabelSize(window.innerWidth, window.innerHeight, this.options.regime)
    if (this.layoutDirty || started - this.lastLayout >= LAYOUT_INTERVAL_MS) this.layout(size, started)
    for (const sock of this.socks) {
      if (!sock.placed) continue
      const screen = this.map.project([sock.place.lng, sock.place.lat])
      const wind = sampleWind(field, 0, sock.x, sock.y)
      const compass = wind && windsockHeadings(field, sock.x, sock.y, DEFAULT_WINDSOCK_CURVATURE)
      if (!wind || !compass) continue
      const speed = Math.hypot(wind[0], wind[1]) * this.options.speedFactor
      const target = compass[0]!
      if (snap || !sock.heading || !sock.strength) {
        sock.heading = { value: target, velocity: 0 }
        sock.strength = { value: beaufortScale(speed), velocity: 0 }
      } else {
        // Kortste weg: het doel ligt nooit meer dan 180° van de huidige richting.
        followSpring(sock.heading, sock.heading.value + angleDifference(sock.heading.value, target), elapsed, WINDSOCK_MOMENTUM.heading)
        followSpring(sock.strength, beaufortScale(speed), elapsed, WINDSOCK_MOMENTUM.strength)
        if (Math.abs(sock.heading.velocity) > 0.05 || Math.abs(sock.strength.velocity) > 0.005) settling = true
      }
      const strength = Math.max(0, sock.strength.value)
      if (!snap) sock.wave = advanceWave(sock.wave, strength, elapsed)
      const flutterBend = animate ? swayBends(strength, sock.wave, seconds, sock.phase).map((bend) => bend * calm) : undefined
      if (flutterBend) fluttering = true
      const base = sock.heading.value
      const headings = compass.map((heading, index) => base + angleDifference(target, heading) - bearing + (flutterBend?.[index] ?? 0))
      const shape = windsockShape(strength, headings, 'kaart')
      this.drawSock(context, screen.x + sock.placed.dx, screen.y + sock.placed.dy, shape, String(windValue(speed, this.unit)), size)
      this.drawnCount++
      this.drawnMaxStrength = Math.max(this.drawnMaxStrength, strength)
    }
    recordPerfPhase('windsock-draw', performance.now() - started, { socks: this.drawnCount, fluttering })
    const summary = `${this.drawnCount}|${Math.round(this.drawnMaxStrength * 10) / 10}`
    if (this.canvas.dataset.socks !== summary) this.canvas.dataset.socks = summary
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
    for (const sock of this.socks) {
      const screen = this.map.project([sock.place.lng, sock.place.lat])
      const ladder = SOCK_RING.map(([dx, dy]): Offset => [sock.offset[0] + dx, sock.offset[1] + dy])
      sock.placed = this.placer.place(screen.x, screen.y, { width: side, height: side }, ladder, sock.placed?.index)
    }
  }

  private drawSock(context: CanvasRenderingContext2D, x: number, y: number, shape: WindsockShape, label: string, size: number): void {
    context.save()
    context.translate(x, y)
    drawSock({ context, shape, badge: windsockBadge(shape, DEFAULT_WINDSOCK_BADGE, label, size), label, dark: this.dark, fontFamily: MAP_LABEL_FONT_FAMILY })
    context.restore()
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

  private camera(): string {
    const center = this.map.getCenter()
    return `${center.lng},${center.lat},${this.map.getZoom()},${this.map.getBearing()},${this.map.getContainer().clientWidth}x${this.map.getContainer().clientHeight}`
  }
}

/** Dev-knoppen (`?dev&windfactor=`, `&regime=`); zonder knop de gekozen windmodus. */
export function windsockDevOptions(params: URLSearchParams): Omit<WindsockLayerOptions, 'reducedMotion' | 'pin'> {
  const factor = Number(params.get('windfactor'))
  return { speedFactor: Number.isFinite(factor) && factor > 0 ? factor : 1, regime: mapLabelRegime(params) }
}

/** Een rechte zak, alleen om de badgemaat te bepalen (die hangt niet van de vorm af). */
const STRAIGHT = windsockShape(0, Array<number>(WINDSOCK_SAMPLES + 1).fill(0), 'kaart')
