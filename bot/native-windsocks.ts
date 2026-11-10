import sharp from 'sharp'
import { beaufortNumber, beaufortScale } from '../web/src/core/wind-beaufort.js'
import { nestedPlaces } from '../web/src/core/map-places.js'
import { WINDSOCK_BANDS, WINDSOCK_PILL, WINDSOCK_STYLE, windsockBand, windsockInflated, windsockPill, windsockShape, type Point, type WindsockShape } from '../web/src/core/wind-glyph.js'
import { WIND_UNIT_LABELS } from '../web/src/core/weather.js'
import { advanceSock, angleDifference, DEFAULT_WINDSOCK_CURVATURE, sampleWind, SOCK_SNAP_SECONDS, sockReach, socksClear, swayBends, WINDSOCK_APPEAR_MARGIN, windsockPhase, WINDSOCK_LAG_MINUTES, WINDSOCK_SPACING_PX, windsockHeadings, type SockMotion, type SockReach, type WindsockField, type WindSlice } from '../web/src/core/windsock-flow.js'
import { FRAME, FRAME_PIXELS } from './config.js'
import { nativeProjection } from './native-projection.js'
import type { NativeRainData, RainFrame } from './native-rain.js'
import { NativeText, type Glyph } from './native-text.js'
import type { NativeTheme } from './native-map.js'
import { NATIVE_VIEW } from './native-view.js'
import { WINDSOCK_ANCHOR_OFFSETS } from '../web/src/core/windsock-anchors.js'

const MERCATOR_RADIUS = 6378137
const rgb = (hex: string) => [1, 3, 5].map((offset) => Number.parseInt(hex.slice(offset, offset + 2), 16))
const ORANGE = rgb(WINDSOCK_STYLE.orange), WHITE = rgb(WINDSOCK_STYLE.white), INK = rgb(WINDSOCK_STYLE.inkColor), BLACK = [0, 0, 0], HALO = [255, 255, 255]
/** Zelfde badge als op de kaart van de app (wind-socks.ts): oranje getal en de eenheid in inkt, rechtop, in een witte pil. */
const LABEL_STYLE = 'windsock'
/** De eenheid op de zak in de film (U113); de bot kent geen eenheidsinstelling. */
export const WINDSOCK_FILM_UNIT = WIND_UNIT_LABELS.bft

/**
 * De windzakken van de windfilm (U101), met dezelfde vorm, stroming en trilling als de app: getekend als vlakken
 * met een eigen anti-aliasing, want de bot heeft geen canvas. Het getal is altijd Bft (de bot kent geen
 * eenheidsinstelling).
 */
export class NativeWindsocks {
  private readonly zipped = new WeakMap<Uint8Array, Float32Array>()
  /** Momentum en golffase per plaats, per filmframe verder gestapt (U107: zoals de app, deterministisch). */
  private readonly motions = new Map<string, SockMotion>()
  private drawnSeconds = -Infinity
  /** Zakken die het vorige frame stonden (hysterese: een nieuwe zak vraagt WINDSOCK_APPEAR_MARGIN meer ruimte). */
  private shown = new Set<string>()
  private constructor(private readonly text: NativeText) {}

  /**
   * Per Bft één glyph met getal en eenheid: pen op PILL_GLYPH.pen, basislijn op PILL_GLYPH.baseline (beeldpunten),
   * op de breedtes van WINDSOCK_PILL zoals de app.
   */
  static async prepare(): Promise<NativeWindsocks> {
    const glyphs = new Map<string, Glyph>()
    const { width, height, pen, baseline } = PILL_GLYPH
    for (let force = 0; force <= 12; force++) {
      const label = String(force)
      const pill = windsockPill(90, label, WINDSOCK_FILM_UNIT)
      const unitX = pen + (pill.numberWidth + WINDSOCK_PILL.gap) * FRAME.scale
      const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><text y="${baseline}" font-family="Noto Sans, sans-serif" font-weight="800">` +
        `<tspan x="${pen}" font-size="${pill.fontPx * FRAME.scale}" fill="${WINDSOCK_STYLE.orange}">${label}</tspan>` +
        `<tspan x="${unitX}" font-size="${pill.unitPx * FRAME.scale}" fill="${WINDSOCK_STYLE.inkColor}">${WINDSOCK_FILM_UNIT}</tspan></text></svg>`
      const rgba = await sharp(Buffer.from(svg)).ensureAlpha().raw().toBuffer()
      for (const theme of ['light', 'dark'] as const) glyphs.set(`${theme}:${LABEL_STYLE}:${label}`, { rgba, width, height })
    }
    return new NativeWindsocks(new NativeText(glyphs))
  }

  /** Het veld op `epoch` en een half en een heel WINDSOCK_LAG_MINUTES eerder, binnen de tijdlijn. */
  async field(eastward: NativeRainData, northward: NativeRainData, epoch: number): Promise<WindsockField> {
    const first = eastward.timeline[0]!.epoch, last = eastward.timeline.at(-1)!.epoch
    const slices = await Promise.all([0, 0.5, 1].map(async (share): Promise<WindSlice> => {
      const at = Math.max(first, Math.min(last, epoch - share * WINDSOCK_LAG_MINUTES * 60_000))
      const [east, north] = await Promise.all([eastward.frame(at), northward.frame(at)])
      return { left: this.vectors(east, north, 'left'), right: this.vectors(east, north, 'right'), mix: east.mix }
    }))
    const grid = (await eastward.frame(Math.max(first, Math.min(last, epoch)))).grid
    return { grid, slices: [slices[0]!, slices[1]!, slices[2]!] }
  }

  private vectors(east: RainFrame, north: RainFrame, side: 'left' | 'right'): Float32Array {
    const eastCodes = east[side]
    let vectors = this.zipped.get(eastCodes)
    if (!vectors) {
      const eastQuant = (side === 'left' ? east.leftHeader : east.rightHeader).quant
      const northQuant = (side === 'left' ? north.leftHeader : north.rightHeader).quant
      const northCodes = north[side]
      vectors = new Float32Array(eastCodes.length * 2)
      for (let index = 0; index < eastCodes.length; index++) {
        vectors[index * 2] = eastQuant[eastCodes[index]!] ?? Number.NaN
        vectors[index * 2 + 1] = northQuant[northCodes[index]!] ?? Number.NaN
      }
      this.zipped.set(eastCodes, vectors)
    }
    return vectors
  }

  /** `seconds`: filmtijd; opeenvolgende frames stappen het momentum en de golf verder, een sprong zet ze direct. */
  async draw(rgb: Buffer, field: WindsockField, seconds: number, theme: NativeTheme, opacity = 1): Promise<void> {
    if (opacity <= 0) return
    const projection = nativeProjection(field.grid)
    const elapsed = seconds - this.drawnSeconds
    const snap = !(elapsed > 0) || elapsed > SOCK_SNAP_SECONDS
    this.drawnSeconds = seconds
    const reaches: SockReach[] = []
    const shown = new Set<string>()
    for (const place of windsockPlaces()) {
      const x = place.lng * Math.PI / 180 * MERCATOR_RADIUS
      const y = Math.log(Math.tan(Math.PI / 4 + place.lat * Math.PI / 360)) * MERCATOR_RADIUS
      const [screenX, screenY] = projection.point((x - field.grid.x0) / field.grid.dx - 0.5, (y - field.grid.y0) / field.grid.dy - 0.5)
      if (screenX < -90 || screenY < -90 || screenX > FRAME_PIXELS.width + 90 || screenY > FRAME_PIXELS.height + 90) continue
      const wind = sampleWind(field, 0, x, y)
      const compass = wind && windsockHeadings(field, x, y, DEFAULT_WINDSOCK_CURVATURE)
      if (!wind || !compass) continue
      const speed = Math.hypot(wind[0], wind[1])
      const [offsetX, offsetY] = WINDSOCK_ANCHOR_OFFSETS[place.name] ?? [0, 0]
      const motion = this.motions.get(place.name) ?? { wave: 0 }
      this.motions.set(place.name, motion)
      advanceSock(motion, compass[0]!, beaufortScale(speed), elapsed, snap)
      const strength = Math.max(0, motion.strength!.value)
      // Geen zakken over elkaar (windsock-flow `socksClear`), in CSS-px zoals de app.
      const label = String(beaufortNumber(speed))
      const reach = sockReach([(screenX + offsetX * FRAME.scale) / FRAME.scale, (screenY + offsetY * FRAME.scale) / FRAME.scale], compass[0]!, beaufortScale(speed), windsockPill(compass[0]!, label, WINDSOCK_FILM_UNIT))
      const margin = !snap && this.shown.has(place.name) ? 1 : WINDSOCK_APPEAR_MARGIN
      if (!reaches.every((other) => socksClear(reach, other, margin))) continue
      reaches.push(reach)
      shown.add(place.name)
      const bends = swayBends(strength, motion.wave, seconds, windsockPhase(place.name))
      const shape = windsockShape(strength, compass.map((heading, index) => motion.heading!.value + angleDifference(compass[0]!, heading) + bends[index]!), 'kaart')
      await this.drawSock(rgb, screenX + offsetX * FRAME.scale, screenY + offsetY * FRAME.scale, shape, motion.heading!.value, label, theme, opacity)
    }
    this.shown = shown
  }

  private async drawSock(rgb: Buffer, x: number, y: number, shape: WindsockShape, heading: number, label: string, theme: NativeTheme, opacity: number): Promise<void> {
    const scale = FRAME.scale
    const place = (points: readonly Point[], offsetY = 0): Point[] => points.map(([px, py]) => [x + px * scale, y + (py + offsetY) * scale])
    const pill = windsockPill(heading, label, WINDSOCK_FILM_UNIT)
    const straight = Math.max(0, pill.halfWidth - pill.halfHeight)
    const cut = { x: x + pill.x * scale, y: y + pill.y * scale, radius: (pill.halfHeight + pill.gap) * scale, halfLength: straight * scale }
    // Dezelfde lagen als de canvas in de app: schaduw, lichte rand, banden, inktrand, hoepel en mast, rond de
    // badge weggeknipt; dan de badge zelf met het getal.
    const { shadow, halo, ink, hoopHalfWidth, mast } = WINDSOCK_STYLE
    fillPolygon(rgb, place(windsockInflated(shape, shadow.margin), shadow.offsetY), BLACK, shadow.alpha * opacity, FRAME_PIXELS, cut)
    fillPolygon(rgb, place(windsockInflated(shape, halo.margin)), HALO, (theme === 'dark' ? halo.dark : halo.light) * opacity, FRAME_PIXELS, cut)
    fillPolygon(rgb, place(windsockInflated(shape, ink)), INK, opacity, FRAME_PIXELS, cut)
    for (let band = 0; band < WINDSOCK_BANDS; band++) fillPolygon(rgb, place(windsockBand(shape, band)), band % 2 ? WHITE : ORANGE, opacity, FRAME_PIXELS, cut)
    fillPolygon(rgb, place(thickLine(shape.left[0]!, shape.right[0]!, hoopHalfWidth)), INK, opacity, FRAME_PIXELS, cut)
    fillPolygon(rgb, place(circle(0, 0, mast.halo)), HALO, opacity, FRAME_PIXELS, cut)
    fillPolygon(rgb, place(circle(0, 0, mast.ink)), INK, opacity, FRAME_PIXELS, cut)
    fillPolygon(rgb, place(capsule(pill.x, pill.y, straight, pill.halfHeight + ink), shadow.offsetY), BLACK, shadow.alpha * opacity)
    fillPolygon(rgb, place(capsule(pill.x, pill.y, straight, pill.halfHeight + ink)), INK, opacity)
    fillPolygon(rgb, place(capsule(pill.x, pill.y, straight, pill.halfHeight - ink)), HALO, opacity)
    // Pen en basislijn van de glyph op die van de pil (getal en eenheid samen breed als in de app).
    const startX = cut.x - (pill.numberWidth + WINDSOCK_PILL.gap + pill.unitWidth) / 2 * scale
    const baselineY = cut.y + pill.baseline * scale
    await this.text.draw(rgb, label, startX - PILL_GLYPH.pen + PILL_GLYPH.width / 2, baselineY - PILL_GLYPH.baseline + PILL_GLYPH.height / 2, 0, LABEL_STYLE, theme, opacity)
  }
}

/** De plaatsen met een zak in het vaste botbeeld (zoals de app); ook de Rust-renderer krijgt deze lijst. */
export function windsockPlaces() {
  return nestedPlaces(NATIVE_VIEW.zoom, WINDSOCK_SPACING_PX)
}

export function thickLine([ax, ay]: Point, [bx, by]: Point, halfWidth: number): Point[] {
  const length = Math.hypot(bx - ax, by - ay) || 1
  const normalX = -(by - ay) / length * halfWidth, normalY = (bx - ax) / length * halfWidth
  return [[ax + normalX, ay + normalY], [bx + normalX, by + normalY], [bx - normalX, by - normalY], [ax - normalX, ay - normalY]]
}

/** Een liggende capsule (de pil): twee halve cirkels van 16 punten, zoals Rust `windsock::capsule`. */
export function capsule(centerX: number, centerY: number, halfLength: number, radius: number): Point[] {
  const half = (side: number) => Array.from({ length: 17 }, (_, index): Point => {
    const angle = -Math.PI / 2 * side + index / 16 * Math.PI * side
    return [centerX + side * halfLength + Math.cos(angle) * radius * side, centerY + Math.sin(angle) * radius]
  })
  return [...half(1), ...half(-1)]
}

/** Glyph van getal plus eenheid in beeldpunten: ruim genoeg voor "12 Bft" op framemaat. */
const PILL_GLYPH = { width: 160, height: 64, pen: 8, baseline: 40 } as const

export function circle(centerX: number, centerY: number, radius: number): Point[] {
  return Array.from({ length: 32 }, (_, index) => [centerX + Math.cos(index / 32 * 2 * Math.PI) * radius, centerY + Math.sin(index / 32 * 2 * Math.PI) * radius])
}


/**
 * Vult een veelhoek met exacte oppervlaktedekking per pixel (de signed-area-accumulatie van font-rs): elke rand
 * telt per pixel zijn bijdrage op, een lopende som per rij geeft de dekking.
 */
export function fillPolygon(rgb: Buffer, points: readonly Point[], color: readonly number[], opacity: number, size: { width: number; height: number } = FRAME_PIXELS, cut?: { x: number; y: number; radius: number; halfLength?: number }): void {
  if (opacity <= 0 || points.length < 3) return
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity
  for (const [px, py] of points) { minX = Math.min(minX, px); maxX = Math.max(maxX, px); minY = Math.min(minY, py); maxY = Math.max(maxY, py) }
  const left = Math.max(0, Math.floor(minX)), top = Math.max(0, Math.floor(minY))
  const right = Math.min(size.width, Math.ceil(maxX) + 1), bottom = Math.min(size.height, Math.ceil(maxY) + 1)
  if (left >= right || top >= bottom) return
  // Twee kolommen speling: een rand op de rechterrand van het vak schrijft ook in de kolom ernaast.
  const width = right - left + 2, height = bottom - top
  const coverage = new Float32Array(width * height)
  for (let index = 0; index < points.length; index++) {
    const [ax, ay] = points[index]!, [bx, by] = points[(index + 1) % points.length]!
    accumulateEdge(coverage, width, height, ax - left, ay - top, bx - left, by - top)
  }
  for (let row = 0; row < height; row++) {
    let sum = 0
    for (let column = 0; column < width; column++) {
      sum += coverage[row * width + column]!
      const screenX = left + column
      // Buiten de uitsparing (badge, een liggende capsule) telt de pixel mee, met een zachte rand van één pixel.
      const outsideCut = cut ? Math.max(0, Math.min(1, Math.hypot(Math.max(0, Math.abs(screenX + 0.5 - cut.x) - (cut.halfLength ?? 0)), top + row + 0.5 - cut.y) - cut.radius + 0.5)) : 1
      const alpha = Math.min(1, Math.abs(sum)) * opacity * outsideCut
      if (alpha <= 0 || screenX >= size.width) continue
      const offset = ((top + row) * size.width + screenX) * 3
      for (let channel = 0; channel < 3; channel++) rgb[offset + channel] = Math.round(rgb[offset + channel]! * (1 - alpha) + color[channel]! * alpha)
    }
  }
}

function accumulateEdge(coverage: Float32Array, width: number, height: number, x0: number, y0: number, x1: number, y1: number): void {
  if (y0 === y1) return
  const direction = y0 < y1 ? 1 : -1
  const [startX, startY, endX, endY] = y0 < y1 ? [x0, y0, x1, y1] : [x1, y1, x0, y0]
  const slope = (endX - startX) / (endY - startY)
  // Links van het vak afgekapt: dekking telt daar volledig mee in de eerste kolom.
  const clampX = (value: number) => Math.max(0, Math.min(width - 1.001, value))
  let x = startX + Math.max(0, -startY) * slope
  for (let row = Math.max(0, Math.floor(startY)); row < Math.min(height, Math.ceil(endY)); row++) {
    const rowStart = row * width
    const span = Math.min(row + 1, endY) - Math.max(row, startY)
    const nextX = x + slope * span
    const area = span * direction
    const from = clampX(Math.min(x, nextX)), to = clampX(Math.max(x, nextX))
    const fromColumn = Math.floor(from), toColumn = Math.ceil(to)
    if (toColumn <= fromColumn + 1) {
      const middle = 0.5 * (from + to) - fromColumn
      coverage[rowStart + fromColumn]! += area * (1 - middle)
      coverage[rowStart + fromColumn + 1]! += area * middle
    } else {
      const inverse = 1 / (to - from)
      const fromFraction = from - fromColumn
      const firstArea = 0.5 * inverse * (1 - fromFraction) ** 2
      const toFraction = to - toColumn + 1
      const lastArea = 0.5 * inverse * toFraction ** 2
      coverage[rowStart + fromColumn]! += area * firstArea
      if (toColumn === fromColumn + 2) coverage[rowStart + fromColumn + 1]! += area * (1 - firstArea - lastArea)
      else {
        const secondArea = inverse * (1.5 - fromFraction)
        coverage[rowStart + fromColumn + 1]! += area * (secondArea - firstArea)
        for (let column = fromColumn + 2; column < toColumn - 1; column++) coverage[rowStart + column]! += area * inverse
        const beforeLast = secondArea + (toColumn - fromColumn - 3) * inverse
        coverage[rowStart + toColumn - 1]! += area * (1 - beforeLast - lastArea)
      }
      coverage[rowStart + toColumn]! += area * lastArea
    }
    x = nextX
  }
}
