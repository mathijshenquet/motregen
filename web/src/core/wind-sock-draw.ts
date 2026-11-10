import { WINDSOCK_BADGE, WINDSOCK_BANDS, WINDSOCK_STYLE, windsockBand, windsockOutline, type Point, type WindsockBadge, type WindsockShape } from './wind-glyph.js'

/**
 * Proef U113 (`?dev&zakeenheid=`, vervalt 2026-11-24): waar de eenheid bij het getal staat. `cirkel`: alleen het
 * getal (zoals nu); `pil`: "2 Bft" in een pil; `onder`: kleine eenheid onder het getal in een iets grotere schijf;
 * `legenda`: de schijf blijft, de legenda zegt welke eenheid op de zak staat.
 */
export const WINDSOCK_UNIT_STYLES = ['cirkel', 'pil', 'onder', 'legenda'] as const
export type WindsockUnitStyle = typeof WINDSOCK_UNIT_STYLES[number]
export const DEFAULT_WINDSOCK_UNIT_STYLE: WindsockUnitStyle = 'cirkel'

/** Eenheid op de badge: `pil` of `onder`. */
export interface SockUnit {
  style: 'pil' | 'onder'
  text: string
}

/** Schijf van `onder` is zoveel groter; getal (iets kleiner) en eenheid delen hem. */
const UNDER_GROWTH = 1.3
const UNDER_NUMBER_EM = 12 / 13
const UNDER_UNIT_EM = 0.6
const PILL_UNIT_EM = 0.77
const PILL_PADDING = 6
const PILL_GAP = 2.5

/**
 * Met eenheid geldt `badge.fontPx` als kaartmaat: de badge moet dan met één cijfer berekend zijn (windsockBadge met
 * '0'), want pil en schijf houden zelf rekening met de lengte van het getal.
 */
/** Pil- of schijfmaat in CSS-px (half breed, half hoog), voor knippen, tekenen en indelen. */
export function sockUnitBox(context: CanvasRenderingContext2D, badge: WindsockBadge, label: string, unit: SockUnit | undefined, fontFamily: string): { halfWidth: number; halfHeight: number } {
  if (!unit) return { halfWidth: badge.radius, halfHeight: badge.radius }
  if (unit.style === 'onder') {
    // De eenheid staat onder het midden, waar de schijf smaller is: groeien tot hij daar past (km/u).
    context.font = `700 ${Math.round(badge.fontPx * UNDER_UNIT_EM)}px ${fontFamily}`
    const radius = Math.max(badge.radius * UNDER_GROWTH, context.measureText(unit.text).width * 0.72 + 1)
    return { halfWidth: radius, halfHeight: radius }
  }
  const width = pillTextWidth(context, badge, label, unit.text, fontFamily) + 2 * PILL_PADDING
  return { halfWidth: Math.max(badge.radius, width / 2), halfHeight: badge.radius }
}

function pillTextWidth(context: CanvasRenderingContext2D, badge: WindsockBadge, label: string, unit: string, fontFamily: string): number {
  context.font = `800 ${badge.fontPx}px ${fontFamily}`
  const number = context.measureText(label).width
  context.font = `700 ${Math.round(badge.fontPx * PILL_UNIT_EM)}px ${fontFamily}`
  return number + PILL_GAP + context.measureText(unit).width
}

function badgePath(badge: WindsockBadge, halfWidth: number, halfHeight: number, grow = 0): Path2D {
  const path = new Path2D()
  const radius = halfHeight + grow
  if (halfWidth <= halfHeight) path.arc(badge.x, badge.y, radius, 0, Math.PI * 2)
  else path.roundRect(badge.x - halfWidth - grow, badge.y - radius, 2 * (halfWidth + grow), 2 * radius, radius)
  return path
}

/**
 * De windzak op de kaartcanvas (U101 ronde 3; PO 2026-11-09: de huidige zak blijft, de stijlproef van ronde 4 is
 * weg): lichte rand, oranje-witte banden, inktrand en hoepel, rond de badge weggeknipt; dan de witte badge met het
 * oranje getal. De mast ligt in (0, 0).
 */
export interface SockScene {
  context: CanvasRenderingContext2D
  shape: WindsockShape
  badge: WindsockBadge
  label: string
  dark: boolean
  fontFamily: string
  unit?: SockUnit
}

export function drawSock({ context, shape, badge: mouthBadge, label, dark, fontFamily, unit }: SockScene): void {
  const { halfWidth, halfHeight } = sockUnitBox(context, mouthBadge, label, unit, fontFamily)
  // Een pil op de mond dekt bij oost- of westwind de zak af: hij steekt uit naar de kant waar de zak niet is.
  const tailX = shape.axis.at(-1)![0]
  const badge = { ...mouthBadge, x: mouthBadge.x + (halfWidth - halfHeight) * (tailX > 0 ? -1 : 1) }
  const cut = badge.cutRadius - badge.radius
  context.save()
  context.lineJoin = 'round'
  context.lineCap = 'round'
  context.save()
  const outside = new Path2D()
  outside.rect(-240, -240, 480, 480)
  outside.addPath(badgePath(badge, halfWidth, halfHeight, cut))
  context.clip(outside, 'evenodd')
  const outline = pathOf(windsockOutline(shape))
  context.save()
  context.translate(0, 1.3)
  context.strokeStyle = 'rgba(0, 0, 0, 0.22)'
  context.lineWidth = 3.5
  context.stroke(outline)
  context.restore()
  context.strokeStyle = `rgba(255, 255, 255, ${dark ? 0.6 : 0.9})`
  context.lineWidth = 3.2
  context.stroke(outline)
  for (let band = 0; band < WINDSOCK_BANDS; band++) {
    context.fillStyle = band % 2 ? WINDSOCK_STYLE.white : WINDSOCK_STYLE.orange
    context.fill(pathOf(windsockBand(shape, band)))
  }
  context.strokeStyle = WINDSOCK_STYLE.inkColor
  context.lineWidth = 1.1
  context.stroke(outline)
  context.lineWidth = 2
  const mouth = new Path2D()
  mouth.moveTo(...shape.left[0]!)
  mouth.lineTo(...shape.right[0]!)
  context.stroke(mouth)
  context.restore()

  const circle = badgePath(badge, halfWidth, halfHeight)
  context.save()
  context.translate(0, 1.3)
  context.fillStyle = 'rgba(0, 0, 0, 0.22)'
  context.fill(circle)
  context.restore()
  context.fillStyle = '#fff'
  context.fill(circle)
  context.strokeStyle = WINDSOCK_STYLE.inkColor
  context.lineWidth = 1.1
  context.stroke(circle)
  // Het midden van de inkt (echte glyphgrenzen) precies in het midden van de cirkel, niet een basislijnschatting
  // (PO 2026-11-09: "8" en "5" stonden net uit het midden).
  context.textAlign = 'left'
  context.textBaseline = 'alphabetic'
  context.fillStyle = WINDSOCK_STYLE.orange
  if (!unit) {
    context.font = `800 ${badge.fontPx}px ${fontFamily}`
    const ink = context.measureText(label)
    context.fillText(label,
      badge.x - (ink.actualBoundingBoxRight - ink.actualBoundingBoxLeft) / 2,
      badge.y + (ink.actualBoundingBoxAscent - ink.actualBoundingBoxDescent) / 2)
  } else if (unit.style === 'pil') {
    // Getal en eenheid op één basislijn; het geheel horizontaal en op de cijferinkt verticaal gecentreerd.
    context.font = `800 ${badge.fontPx}px ${fontFamily}`
    const ink = context.measureText(label)
    const baseline = badge.y + (ink.actualBoundingBoxAscent - ink.actualBoundingBoxDescent) / 2
    let x = badge.x - pillTextWidth(context, badge, label, unit.text, fontFamily) / 2
    context.font = `800 ${badge.fontPx}px ${fontFamily}`
    context.fillText(label, x, baseline)
    x += ink.width + PILL_GAP
    context.font = `700 ${Math.round(badge.fontPx * PILL_UNIT_EM)}px ${fontFamily}`
    context.fillStyle = WINDSOCK_STYLE.inkColor
    context.fillText(unit.text, x, baseline)
  } else {
    const radius = halfHeight
    const numberPx = Math.round(badge.fontPx * (label.length > 2 ? WINDSOCK_BADGE.longFontPx / WINDSOCK_BADGE.fontPx : UNDER_NUMBER_EM))
    context.font = `800 ${numberPx}px ${fontFamily}`
    const ink = context.measureText(label)
    context.fillText(label, badge.x - (ink.actualBoundingBoxRight - ink.actualBoundingBoxLeft) / 2, badge.y + radius * 0.12)
    context.font = `700 ${Math.round(badge.fontPx * UNDER_UNIT_EM)}px ${fontFamily}`
    context.fillStyle = WINDSOCK_STYLE.inkColor
    const unitInk = context.measureText(unit.text)
    context.fillText(unit.text, badge.x - (unitInk.actualBoundingBoxRight - unitInk.actualBoundingBoxLeft) / 2, badge.y + radius * 0.66)
  }
  context.restore()
}

function pathOf(points: readonly Point[]): Path2D {
  const path = new Path2D()
  points.forEach(([x, y], index) => index ? path.lineTo(x, y) : path.moveTo(x, y))
  path.closePath()
  return path
}
