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
}

export function drawSock({ context, shape, badge, label, dark, fontFamily }: SockScene): void {
  context.save()
  context.lineJoin = 'round'
  context.lineCap = 'round'
  context.save()
  const outside = new Path2D()
  outside.rect(-240, -240, 480, 480)
  outside.arc(badge.x, badge.y, badge.cutRadius, 0, Math.PI * 2)
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
  context.font = `800 ${badge.fontPx}px ${fontFamily}`
  context.textAlign = 'center'
  context.textBaseline = 'middle'
  context.fillStyle = WINDSOCK_STYLE.orange
  context.fillText(label, badge.x, badge.y + 0.5)
  context.restore()
}

function pathOf(points: readonly Point[]): Path2D {
  const path = new Path2D()
  points.forEach(([x, y], index) => index ? path.lineTo(x, y) : path.moveTo(x, y))
  path.closePath()
  return path
}
