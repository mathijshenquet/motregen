import type { Map as MapLibreMap } from 'maplibre-gl'
import { beaufortScale } from './wind-beaufort.js'
import { uprightTextAngle, WINDSOCK_BANDS, WINDSOCK_SAMPLES, windsockBand, windsockOutline, windsockShape, type Point, type WindsockShape } from './wind-glyph.js'
import { DEFAULT_WINDSOCK_CURVATURE, sampleWind, WINDSOCK_CURVATURES, windsockHeadings, type WindsockCurvature, type WindsockField } from './windsock-flow.js'
import type { TemperaturePlace } from './temperature.js'
import { windValue, type WindUnit } from './weather.js'
import { recordPerfPhase } from './perf.js'

/** Trilling bij harde wind: vanaf `start` Bft, uitslag aan de staart en frequentie groeien met de windkracht. */
export interface WindsockFlutter {
  start: number
  /** Uitslag aan de staart in graden: bij de drempel, en de groei per Bft daarboven. */
  amplitude: number
  amplitudePerForce: number
  maxAmplitude: number
  /** Golven per seconde: bij de drempel, en de groei per Bft. */
  frequency: number
  frequencyPerForce: number
}

export const WINDSOCK_FLUTTERS = {
  zacht: { start: 6, amplitude: 3, amplitudePerForce: 2, maxAmplitude: 12, frequency: 1.2, frequencyPerForce: 0.25 },
  normaal: { start: 6, amplitude: 5, amplitudePerForce: 3, maxAmplitude: 20, frequency: 1.6, frequencyPerForce: 0.4 },
  sterk: { start: 6, amplitude: 8, amplitudePerForce: 4, maxAmplitude: 28, frequency: 2, frequencyPerForce: 0.6 },
} as const satisfies Record<string, WindsockFlutter>
export type WindsockFlutterName = keyof typeof WINDSOCK_FLUTTERS
export const DEFAULT_WINDSOCK_FLUTTER: WindsockFlutterName = 'normaal'

/** Hoek per asstuk door de trilling: een golf die van mond naar staart loopt en naar de staart aanzwelt. */
export function flutterBends(flutter: WindsockFlutter, strength: number, seconds: number, phase: number): number[] | undefined {
  if (strength < flutter.start) return undefined
  const above = strength - flutter.start
  const amplitude = Math.min(flutter.maxAmplitude, flutter.amplitude + flutter.amplitudePerForce * above)
  const frequency = flutter.frequency + flutter.frequencyPerForce * above
  // Vloeiend inzetten over de eerste halve Bft, anders springt de zak bij de drempel.
  const onset = Math.min(1, above * 2)
  return Array.from({ length: WINDSOCK_SAMPLES + 1 }, (_, index) => {
    const t = index / WINDSOCK_SAMPLES
    return onset * amplitude * t ** 1.3 * Math.sin(2 * Math.PI * (frequency * seconds - 1.1 * t) + phase)
  })
}

interface Sock {
  place: TemperaturePlace
  /** Web-Mercator-meters. */
  x: number
  y: number
  phase: number
}

/**
 * Trillingsframes per seconde. Een golf van 1,6–3 Hz is bij 30 fps vloeiend; vaker kostte op het telefoonprofiel
 * (4× CPU-rem, software-raster) de pagina de helft van zijn fps.
 */
export const WINDSOCK_FLUTTER_FPS = 30

const MERCATOR_RADIUS = 6378137
const ORANGE = '#f2661c', WHITE = '#fbfbf8', INK = '#17242b'
const LABEL_STROKE = '#a33a0b'
/** Op deze plek langs de as staat het getal: in het brede deel, maar los van de hoepel. */
const LABEL_AT = 0.42

export interface WindsockLayerOptions {
  curvature: WindsockCurvature
  flutter: WindsockFlutter | undefined
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
      return { place, x, y, phase: stablePhase(place.name) }
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
    const flutter = this.options.reducedMotion() ? undefined : this.options.flutter
    let fluttering = false
    for (const sock of this.socks) {
      const screen = this.map.project([sock.place.lng, sock.place.lat])
      if (screen.x < -60 || screen.y < -60 || screen.x > width + 60 || screen.y > height + 60) continue
      const wind = sampleWind(field, 0, sock.x, sock.y)
      const compass = wind && windsockHeadings(field, sock.x, sock.y, this.options.curvature)
      if (!wind || !compass) continue
      const speed = Math.hypot(wind[0], wind[1]) * this.options.speedFactor
      const strength = beaufortScale(speed)
      const flutterBend = flutter && flutterBends(flutter, strength, seconds, sock.phase)
      if (flutterBend) fluttering = true
      const headings = compass.map((heading, index) => heading - bearing + (flutterBend?.[index] ?? 0))
      const shape = windsockShape(strength, headings, 'kaart')
      this.drawSock(context, screen.x, screen.y, shape, String(windValue(speed, this.unit)))
      this.drawnCount++
      this.drawnMaxStrength = Math.max(this.drawnMaxStrength, strength)
    }
    recordPerfPhase('windsock-draw', performance.now() - started, { socks: this.drawnCount, fluttering })
    const summary = `${this.drawnCount}|${Math.round(this.drawnMaxStrength * 10) / 10}`
    if (this.canvas.dataset.socks !== summary) this.canvas.dataset.socks = summary
    if (fluttering) this.scheduleFlutter(started)
  }

  private drawSock(context: CanvasRenderingContext2D, x: number, y: number, shape: WindsockShape, label: string): void {
    context.save()
    context.translate(x, y)
    const outline = new Path2D(polygon(windsockOutline(shape)))
    context.lineJoin = 'round'
    // Zachte schaduw en een lichte rand houden de zak los van de vlakken, op lichte en donkere kaart.
    context.save()
    context.translate(0, 1.3)
    context.strokeStyle = 'rgba(0, 0, 0, 0.22)'
    context.lineWidth = 3.5
    context.stroke(outline)
    context.restore()
    context.strokeStyle = this.dark ? 'rgba(255, 255, 255, 0.55)' : 'rgba(255, 255, 255, 0.9)'
    context.lineWidth = 3.2
    context.stroke(outline)
    for (let band = 0; band < WINDSOCK_BANDS; band++) {
      context.fillStyle = band % 2 ? WHITE : ORANGE
      context.fill(new Path2D(polygon(windsockBand(shape, band))))
    }
    context.strokeStyle = INK
    context.lineWidth = 1.1
    context.stroke(outline)
    context.lineWidth = 2
    context.lineCap = 'round'
    context.beginPath()
    context.moveTo(...shape.left[0]!)
    context.lineTo(...shape.right[0]!)
    context.stroke()
    context.beginPath()
    context.arc(0, 0, 2.4, 0, Math.PI * 2)
    context.fillStyle = INK
    context.strokeStyle = '#fff'
    context.lineWidth = 1.4
    context.stroke()
    context.fill()
    const index = Math.round(LABEL_AT * WINDSOCK_SAMPLES)
    const [labelX, labelY] = shape.axis[index]!
    context.translate(labelX, labelY)
    context.rotate(uprightTextAngle(shape.headings[index]!) * Math.PI / 180)
    context.font = `800 ${label.length > 2 ? 11 : 12.5}px ${this.fontFamily}`
    context.textAlign = 'center'
    context.textBaseline = 'middle'
    context.strokeStyle = LABEL_STROKE
    context.lineWidth = 3
    context.strokeText(label, 0, 0.5)
    context.fillStyle = '#fff'
    context.fillText(label, 0, 0.5)
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

function polygon(points: readonly Point[]): string {
  return `M${points.map(([x, y]) => `${x} ${y}`).join('L')}Z`
}

/** Vaste fase per plaats, zodat de zakken niet in de maat trillen. */
function stablePhase(name: string): number {
  let hash = 0
  for (const character of name) hash = (hash * 31 + character.charCodeAt(0)) | 0
  return (hash >>> 0) % 628 / 100
}

/** Dev-knoppen van ronde 3 (`?dev&kromming=`, `&fladder=`, `&windfactor=`); zonder knop de gekozen defaults. */
export function windsockDevOptions(params: URLSearchParams): Omit<WindsockLayerOptions, 'reducedMotion'> {
  const curvature = WINDSOCK_CURVATURES.find((name) => name === params.get('kromming')) ?? DEFAULT_WINDSOCK_CURVATURE
  const flutterName = params.get('fladder')
  const flutter = flutterName === 'uit' ? undefined
    : WINDSOCK_FLUTTERS[flutterName && flutterName in WINDSOCK_FLUTTERS ? flutterName as WindsockFlutterName : DEFAULT_WINDSOCK_FLUTTER]
  const factor = Number(params.get('windfactor'))
  return { curvature, flutter, speedFactor: Number.isFinite(factor) && factor > 0 ? factor : 1 }
}
