import { WINDSOCK_BANDS, WINDSOCK_STYLE, windsockBand, windsockOutline, type Point, type WindsockBadge, type WindsockShape } from './wind-glyph.js'

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
  /**
   * `clip`: de zak rond de badge wegknippen. `erase` (de kaartlaag, U111): eerst de zak, dan het gat wegvegen met
   * destination-out; Firefox Android rastert voor elke `clip()` een masker in software. `erase` veegt ook weg wat er
   * al stond, dus alleen waar het gat geen andere tekening raakt.
   */
  cut?: 'clip' | 'erase'
  /** Een deel: de zak, de schijf van de badge of het getal (de schijf uit een bitmapcache, `?dev&zakpaden=zuinig`). */
  parts?: 'all' | 'body' | 'disc' | 'label'
  /** De oranje en de witte banden elk als één pad: twee vullingen in plaats van vijf (`?dev&zakpaden=zuinig`). */
  mergedBands?: boolean
}

/** Het gat rond de badge. Eén functie voor knippen en vegen; bij de merge met U113 wordt dit `badgePath(…, cut)`. */
export function sockCutPath(badge: WindsockBadge): Path2D {
  const path = new Path2D()
  path.arc(badge.x, badge.y, badge.cutRadius, 0, Math.PI * 2)
  return path
}

export function drawSock({ context, shape, badge, label, dark, fontFamily, cut = 'clip', parts = 'all', mergedBands = false }: SockScene): void {
  context.save()
  context.lineJoin = 'round'
  context.lineCap = 'round'
  if (parts === 'all' || parts === 'body') drawBody(context, shape, badge, dark, cut, mergedBands)
  if (parts === 'all' || parts === 'disc') drawDisc(context, badge)
  if (parts === 'all' || parts === 'label') drawLabel(context, badge, label, fontFamily)
  context.restore()
}

function drawBody(context: CanvasRenderingContext2D, shape: WindsockShape, badge: WindsockBadge, dark: boolean, cut: 'clip' | 'erase', mergedBands: boolean): void {
  context.save()
  if (cut === 'clip') {
    const outside = new Path2D()
    outside.rect(-240, -240, 480, 480)
    outside.addPath(sockCutPath(badge))
    context.clip(outside, 'evenodd')
  }
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
  if (mergedBands) {
    // De banden van één kleur raken elkaar niet; alleen de naden met de andere kleur antialiassen in een andere volgorde.
    for (const [colour, first] of [[WINDSOCK_STYLE.orange, 0], [WINDSOCK_STYLE.white, 1]] as const) {
      const bands = new Path2D()
      for (let band = first; band < WINDSOCK_BANDS; band += 2) bands.addPath(pathOf(windsockBand(shape, band)))
      context.fillStyle = colour
      context.fill(bands)
    }
  } else {
    for (let band = 0; band < WINDSOCK_BANDS; band++) {
      context.fillStyle = band % 2 ? WINDSOCK_STYLE.white : WINDSOCK_STYLE.orange
      context.fill(pathOf(windsockBand(shape, band)))
    }
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
  if (cut === 'erase') {
    context.save()
    context.globalCompositeOperation = 'destination-out'
    context.fill(sockCutPath(badge))
    context.restore()
  }
}

function drawDisc(context: CanvasRenderingContext2D, badge: WindsockBadge): void {
  const circle = new Path2D()
  circle.arc(badge.x, badge.y, badge.radius, 0, Math.PI * 2)
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
}

function drawLabel(context: CanvasRenderingContext2D, badge: WindsockBadge, label: string, fontFamily: string): void {
  // Het midden van de inkt (echte glyphgrenzen) precies in het midden van de cirkel, niet een basislijnschatting
  // (PO 2026-11-09: "8" en "5" stonden net uit het midden).
  context.font = `800 ${badge.fontPx}px ${fontFamily}`
  context.textAlign = 'left'
  context.textBaseline = 'alphabetic'
  context.fillStyle = WINDSOCK_STYLE.orange
  const ink = context.measureText(label)
  context.fillText(label,
    badge.x - (ink.actualBoundingBoxRight - ink.actualBoundingBoxLeft) / 2,
    badge.y + (ink.actualBoundingBoxAscent - ink.actualBoundingBoxDescent) / 2)
}

function pathOf(points: readonly Point[]): Path2D {
  const path = new Path2D()
  points.forEach(([x, y], index) => index ? path.lineTo(x, y) : path.moveTo(x, y))
  path.closePath()
  return path
}
