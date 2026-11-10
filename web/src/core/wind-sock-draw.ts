import { DEFAULT_WINDSOCK_BADGE, pillTextEm, WINDSOCK_BADGE, WINDSOCK_BANDS, WINDSOCK_PILL, WINDSOCK_STYLE, windsockBadge, windsockBand, windsockOutline, windsockPill, type BadgeBox, type Point, type WindsockShape } from './wind-glyph.js'

/**
 * Eenheid op de zak (U113). Standaard `pil` (PO 2026-11-10): "2 Bft" in een pil die van de zak af wijst. De proefknop
 * `?dev&zakeenheid=` (vervalt 2026-11-24) houdt de andere vormen: `cirkel` (alleen het getal, tot U113), `onder`
 * (kleine eenheid onder het getal in een grotere schijf) en `legenda` (schijf; de legenda noemt de eenheid).
 */
export const WINDSOCK_UNIT_STYLES = ['pil', 'cirkel', 'onder', 'legenda'] as const
export type WindsockUnitStyle = typeof WINDSOCK_UNIT_STYLES[number]
export const DEFAULT_WINDSOCK_UNIT_STYLE: WindsockUnitStyle = 'pil'

/** Wat er op de mond staat: de vorm, de tekst en de maten om te knippen, tekenen en in te delen (CSS-px). */
export interface SockBadge extends BadgeBox {
  style: 'pil' | 'cirkel' | 'onder'
  label: string
  unit: string
  fontPx: number
  unitPx: number
  /** Alleen `pil`: breedte van getal en eenheid en de basislijn t.o.v. het midden. */
  numberWidth: number
  unitWidth: number
  baseline: number
}

/** `onder`: de schijf is zoveel groter; getal iets kleiner, eenheid op 0,6 van de kaartmaat. */
const UNDER = { growth: 1.3, numberEm: 12 / 13, unitEm: 0.6 } as const

/**
 * De badge van één zak. `heading`: schermrichting van de zak zonder wuiven (voor de kant van de pil); `size`: de
 * kaartmaat. App (tekenen en indelen) en U111 (vuile rechthoeken via `windsockExtent`) rekenen met deze maat.
 */
export function sockBadge(shape: WindsockShape, heading: number, label: string, unit: string, style: WindsockUnitStyle, size: number): SockBadge {
  if (style === 'pil') return { style, label, unit, ...windsockPill(heading, label, unit, size) }
  const circle = windsockBadge(shape, DEFAULT_WINDSOCK_BADGE, style === 'onder' ? '0' : label, size)
  const base = { label, unit, x: circle.x, y: circle.y, gap: circle.cutRadius - circle.radius, numberWidth: 0, unitWidth: 0, baseline: 0 }
  if (style !== 'onder') return { ...base, style: 'cirkel', halfWidth: circle.radius, halfHeight: circle.radius, fontPx: circle.fontPx, unitPx: 0 }
  const unitPx = Math.round(size * UNDER.unitEm)
  // De eenheid staat onder het midden, waar de schijf smaller is: groeien tot hij daar past (km/u).
  const radius = Math.max(circle.radius * UNDER.growth, pillTextEm(unit) * unitPx * 0.72 + 1)
  const fontPx = Math.round(size * (label.length > 2 ? WINDSOCK_BADGE.longFontPx / WINDSOCK_BADGE.fontPx : UNDER.numberEm))
  return { ...base, style, halfWidth: radius, halfHeight: radius, fontPx, unitPx }
}

/**
 * Omvang van zak plus badge in CSS-px t.o.v. de mast, inclusief rand, schaduw en een pixel anti-aliasing: alles wat
 * `drawSock` raakt. Voor het wissen van vuile rechthoeken (U111 `sockRect`) en elke toets die de volle zak nodig heeft.
 */
export function windsockExtent(shape: WindsockShape, badge: BadgeBox): { left: number; top: number; right: number; bottom: number } {
  const { margin, offsetY } = WINDSOCK_STYLE.shadow
  let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity
  for (const [x, y] of windsockOutline(shape)) {
    left = Math.min(left, x); right = Math.max(right, x); top = Math.min(top, y); bottom = Math.max(bottom, y)
  }
  left = Math.min(left - margin, badge.x - badge.halfWidth - WINDSOCK_STYLE.ink)
  right = Math.max(right + margin, badge.x + badge.halfWidth + WINDSOCK_STYLE.ink)
  top = Math.min(top - margin, badge.y - badge.halfHeight - WINDSOCK_STYLE.ink)
  bottom = Math.max(bottom + margin + offsetY, badge.y + badge.halfHeight + WINDSOCK_STYLE.ink + offsetY)
  return { left: left - 1, top: top - 1, right: right + 1, bottom: bottom + 1 }
}

function badgePath(badge: BadgeBox, grow = 0): Path2D {
  const path = new Path2D()
  const radius = badge.halfHeight + grow
  if (badge.halfWidth <= badge.halfHeight) path.arc(badge.x, badge.y, radius, 0, Math.PI * 2)
  else path.roundRect(badge.x - badge.halfWidth - grow, badge.y - radius, 2 * (badge.halfWidth + grow), 2 * radius, radius)
  return path
}

/**
 * De windzak op de kaartcanvas (U101 ronde 3; PO 2026-11-09: de huidige zak blijft, de stijlproef van ronde 4 is
 * weg): lichte rand, oranje-witte banden, inktrand en hoepel, rond de badge weggeknipt; dan de witte badge met het
 * oranje getal en de eenheid in inkt. De mast ligt in (0, 0).
 */
export interface SockScene {
  context: CanvasRenderingContext2D
  shape: WindsockShape
  badge: SockBadge
  dark: boolean
  fontFamily: string
}

export function drawSock({ context, shape, badge, dark, fontFamily }: SockScene): void {
  context.save()
  context.lineJoin = 'round'
  context.lineCap = 'round'
  context.save()
  const outside = new Path2D()
  outside.rect(-240, -240, 480, 480)
  outside.addPath(badgePath(badge, badge.gap))
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

  const plate = badgePath(badge)
  context.save()
  context.translate(0, 1.3)
  context.fillStyle = 'rgba(0, 0, 0, 0.22)'
  context.fill(plate)
  context.restore()
  context.fillStyle = '#fff'
  context.fill(plate)
  context.strokeStyle = WINDSOCK_STYLE.inkColor
  context.lineWidth = 1.1
  context.stroke(plate)
  context.textAlign = 'left'
  context.textBaseline = 'alphabetic'
  context.fillStyle = WINDSOCK_STYLE.orange
  const { label, unit } = badge
  if (badge.style === 'pil') {
    // Getal en eenheid op één basislijn, op de breedtes van WINDSOCK_PILL (zoals Node en Rust).
    const start = badge.x - (badge.numberWidth + WINDSOCK_PILL.gap + badge.unitWidth) / 2
    const baseline = badge.y + badge.baseline
    context.font = `800 ${badge.fontPx}px ${fontFamily}`
    context.fillText(label, start, baseline)
    context.font = `800 ${badge.unitPx}px ${fontFamily}`
    context.fillStyle = WINDSOCK_STYLE.inkColor
    context.fillText(unit, start + badge.numberWidth + WINDSOCK_PILL.gap, baseline)
  } else if (badge.style === 'cirkel') {
    // Het midden van de inkt (echte glyphgrenzen) precies in het midden van de cirkel, niet een basislijnschatting
    // (PO 2026-11-09: "8" en "5" stonden net uit het midden).
    context.font = `800 ${badge.fontPx}px ${fontFamily}`
    const ink = context.measureText(label)
    context.fillText(label,
      badge.x - (ink.actualBoundingBoxRight - ink.actualBoundingBoxLeft) / 2,
      badge.y + (ink.actualBoundingBoxAscent - ink.actualBoundingBoxDescent) / 2)
  } else {
    const radius = badge.halfHeight
    context.font = `800 ${badge.fontPx}px ${fontFamily}`
    const ink = context.measureText(label)
    context.fillText(label, badge.x - (ink.actualBoundingBoxRight - ink.actualBoundingBoxLeft) / 2, badge.y + radius * 0.12)
    context.font = `800 ${badge.unitPx}px ${fontFamily}`
    context.fillStyle = WINDSOCK_STYLE.inkColor
    const unitInk = context.measureText(unit)
    context.fillText(unit, badge.x - (unitInk.actualBoundingBoxRight - unitInk.actualBoundingBoxLeft) / 2, badge.y + radius * 0.66)
  }
  context.restore()
}

function pathOf(points: readonly Point[]): Path2D {
  const path = new Path2D()
  points.forEach(([x, y], index) => index ? path.lineTo(x, y) : path.moveTo(x, y))
  path.closePath()
  return path
}
