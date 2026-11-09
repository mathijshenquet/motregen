import type { Map as MapLibreMap } from 'maplibre-gl'
import { beaufortScale } from './wind-beaufort.js'
import { DEFAULT_WINDSOCK_BADGE, windsockBadge, windsockShape, type WindsockShape } from './wind-glyph.js'
import { advanceWave, angleDifference, DEFAULT_WINDSOCK_CURVATURE, followSpring, sampleWind, swayBends, WINDSOCK_MOMENTUM, windsockHeadings, windsockPhase, type Spring, type WindsockField } from './windsock-flow.js'
import type { TemperaturePlace } from './temperature.js'
import { windValue, type WindUnit } from './weather.js'
import { recordPerfPhase } from './perf.js'
import { WINDSOCK_ANCHOR_OFFSETS } from './windsock-anchors.js'
import { drawStyledSock, windsockStyleName, type WindsockStyleName } from './wind-sock-styles.js'

interface Sock {
  place: TemperaturePlace
  /** Web-Mercator-meters. */
  x: number
  y: number
  phase: number
  /** Naast de plaatsnaam (CSS-px). */
  offset: readonly [number, number]
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

const MERCATOR_RADIUS = 6378137

export interface WindsockLayerOptions {
  /** Alleen `?dev&zakstijl=`: de tekenstijl (U101 ronde 4, nog niet gekozen). */
  style: WindsockStyleName
  reducedMotion: () => boolean
  /** Alleen `?dev&windfactor=`: vermenigvuldigt de wind van de zakken, om harde wind te bekijken. */
  speedFactor: number
}

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
  private readonly fontFamily: string
  draws = 0
  private readonly mapRendered = () => { if (this.camera() !== this.drawnCamera) this.draw() }
  private readonly resized = () => this.draw()

  constructor(private readonly map: MapLibreMap, private readonly options: WindsockLayerOptions) {
    this.canvas = document.createElement('canvas')
    this.canvas.className = 'map-overlay map-overlay-windsocks'
    this.canvas.setAttribute('aria-hidden', 'true')
    this.canvas.style.opacity = '0'
    this.canvas.style.visibility = 'hidden'
    map.getCanvasContainer().append(this.canvas)
    this.context = this.canvas.getContext('2d')!
    this.fontFamily = getComputedStyle(map.getContainer()).fontFamily
    map.on('render', this.mapRendered)
    map.on('resize', this.resized)
  }

  setPlaces(places: readonly TemperaturePlace[]): void {
    const same = places.length === this.socks.length && places.every((place, index) => this.socks[index]!.place.name === place.name)
    if (same) return
    this.socks = places.map((place) => {
      const x = place.lng * Math.PI / 180 * MERCATOR_RADIUS
      const y = Math.log(Math.tan(Math.PI / 4 + place.lat * Math.PI / 360)) * MERCATOR_RADIUS
      return { place, x, y, phase: windsockPhase(place.name), offset: WINDSOCK_ANCHOR_OFFSETS[place.name] ?? [0, 0], wave: 0 }
    })
    this.draw()
  }

  setField(field: WindsockField | undefined): void {
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
    const animate = !this.options.reducedMotion()
    // Na een pauze (verborgen tab, Wind net open) of zonder beweging springt de zak direct naar het veld.
    const elapsed = seconds - this.drawnAt
    const snap = !animate || !(elapsed > 0) || elapsed > 1
    this.drawnAt = seconds
    let fluttering = false
    let settling = false
    for (const sock of this.socks) {
      const screen = this.map.project([sock.place.lng, sock.place.lat])
      if (screen.x < -60 || screen.y < -60 || screen.x > width + 60 || screen.y > height + 60) continue
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
      const flutterBend = animate ? swayBends(strength, sock.wave, seconds, sock.phase) : undefined
      if (flutterBend) fluttering = true
      const base = sock.heading.value
      const headings = compass.map((heading, index) => base + angleDifference(target, heading) - bearing + (flutterBend?.[index] ?? 0))
      const shape = windsockShape(strength, headings, 'kaart')
      this.drawSock(context, screen.x + sock.offset[0], screen.y + sock.offset[1], shape, String(windValue(speed, this.unit)), strength, sock.phase, seconds)
      this.drawnCount++
      this.drawnMaxStrength = Math.max(this.drawnMaxStrength, strength)
    }
    recordPerfPhase('windsock-draw', performance.now() - started, { socks: this.drawnCount, fluttering })
    const summary = `${this.drawnCount}|${Math.round(this.drawnMaxStrength * 10) / 10}`
    if (this.canvas.dataset.socks !== summary) this.canvas.dataset.socks = summary
    if (fluttering || settling) this.scheduleFlutter(started)
  }

  private drawSock(context: CanvasRenderingContext2D, x: number, y: number, shape: WindsockShape, label: string, strength: number, phase: number, seconds: number): void {
    context.save()
    context.translate(x, y)
    drawStyledSock(this.options.style, {
      context, shape, badge: windsockBadge(shape, DEFAULT_WINDSOCK_BADGE, label), label, strength, phase, seconds,
      dark: this.dark, fontFamily: this.fontFamily,
    })
    context.restore()
  }

  /** Volgende trillingsframe, niet vaker dan WINDSOCK_FLUTTER_FPS: elke frame zet de hele canvas opnieuw neer. */
  private scheduleFlutter(drawnAt: number): void {
    const wait = drawnAt + 1_000 / WINDSOCK_FLUTTER_FPS - 4 - performance.now()
    if (wait > 0) {
      this.delay = window.setTimeout(() => {
        this.delay = undefined
        this.frame = requestAnimationFrame(() => { this.frame = undefined; this.draw() })
      }, wait)
      return
    }
    this.frame = requestAnimationFrame(() => { this.frame = undefined; this.draw() })
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

/** Dev-knoppen (`?dev&zakstijl=`, `&windfactor=`); zonder knop de gekozen windmodus. */
export function windsockDevOptions(params: URLSearchParams): Omit<WindsockLayerOptions, 'reducedMotion'> {
  const factor = Number(params.get('windfactor'))
  return { style: windsockStyleName(params.get('zakstijl')), speedFactor: Number.isFinite(factor) && factor > 0 ? factor : 1 }
}
