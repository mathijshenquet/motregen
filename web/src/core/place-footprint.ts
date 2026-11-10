import { DEFAULT_WINDSOCK_BADGE, WINDSOCK_SAMPLES, windsockBadge, windsockShape } from './wind-glyph.js'
import { WINDSOCK_REACH_RADIUS } from './windsock-flow.js'

/**
 * Voetafdruk van een plek in de plekkenorde (U114, MIP-43): alles wat er bij die plek getekend kan worden, in scherm-px
 * rond het anker. Plekken staan vast; twee plekken mogen pas samen in beeld als hun
 * voetafdrukken elkaar niet raken (place-thinning). Zo valt een zak nooit over een naam, welke kant de wind ook op
 * waait.
 */
export type LabelSide = 'onder' | 'boven' | 'links' | 'rechts'

/**
 * Afgeronde rechthoek: middelpunt (dx, dy) t.o.v. het anker, halve maten en hoekstraal (een schijf: halve maten 0).
 * `body`: het bereik van het zaklijf. Twee lijven mogen elkaars bereik delen: de wind is over tientallen km
 * samenhangend, dus buurzakken wijzen vrijwel dezelfde kant op; een lijf blijft wel van badge en naam van een ander.
 */
export interface Shape { dx: number; dy: number; halfWidth: number; halfHeight: number; radius: number; body?: true }

const STRAIGHT = windsockShape(0, Array<number>(WINDSOCK_SAMPLES + 1).fill(0), 'kaart')
const LONGEST = windsockShape(12, Array<number>(WINDSOCK_SAMPLES + 1).fill(90), 'kaart')

/** Bereik van het zaklijf in elke richting: de langste zak (12 Bft) plus de halve lijfbreedte. */
export const SOCK_REACH_PX = Math.ceil(Math.hypot(...LONGEST.axis.at(-1)!) + WINDSOCK_REACH_RADIUS)

/** Straal van het badgevak van de zak (badge plus snede). */
export function sockBadgeRadius(size: number): number {
  return windsockBadge(STRAIGHT, DEFAULT_WINDSOCK_BADGE, '0', size).cutRadius
}

/** Botsvak van een getal in px (zie .temperature-number): tabelcijfers ±0,6 em, padding 6 × 3 px. */
export function islandBox(label: string, size: number): { width: number; height: number } {
  return { width: Math.ceil(label.length * size * 0.6 + 12), height: Math.ceil(size + 6) }
}

/** Breedte van een plaatsnaam vóór het getal (`namen=samen`, .temperature-number-name: 0,85 em, ±0,55 em per teken). */
export function nameBoxWidth(name: string, size: number): number {
  return Math.ceil(name.length * size * 0.85 * 0.55 + 4)
}

/** Breedte van de naam bij een zak (canvas, 0,85 em). */
export function sockNameWidth(name: string, size: number): number {
  return Math.ceil(name.length * size * 0.85 * 0.55 + 6)
}

/** Middelpunt van de naam t.o.v. het zakanker, aan de vaste kant van de plek. */
export function sockNameOffset(side: LabelSide, name: string, size: number): [number, number] {
  const badge = sockBadgeRadius(size) + 1 + 4
  const height = size + 4
  const width = sockNameWidth(name, size)
  if (side === 'onder') return [0, badge + height / 2]
  if (side === 'boven') return [0, -badge - height / 2]
  if (side === 'rechts') return [badge + width / 2, 0]
  return [-badge - width / 2, 0]
}

/** Grootste getal dat een plek kan dragen, voor een vaste maat: "−10°". */
const WIDEST_VALUE = '−10°'

/**
 * `samen`: Weer en Gevoel met de naam vóór het getal in één label; `naast`: Weer, Gevoel en Lucht met het getal op de
 * plek en de naam aan de vaste kant; `zak`: Wind (lijfbereik, badge, naam aan de vaste kant). Dezelfde orde, eigen
 * voetafdruk: Wind is daardoor dunner dan Gevoel.
 */
export type FootprintKind = 'samen' | 'naast' | 'zak'
export const FOOTPRINT_KINDS: readonly FootprintKind[] = ['samen', 'naast', 'zak']

export function placeFootprint(name: string | undefined, side: LabelSide, size: number, kind: FootprintKind): Shape[] {
  const value = islandBox(WIDEST_VALUE, size)
  const shapes: Shape[] = kind === 'zak'
    ? [{ dx: 0, dy: 0, halfWidth: 0, halfHeight: 0, radius: SOCK_REACH_PX, body: true }, { dx: 0, dy: 0, halfWidth: 0, halfHeight: 0, radius: sockBadgeRadius(size) }]
    : [{ dx: 0, dy: 0, halfWidth: value.width / 2, halfHeight: value.height / 2, radius: 0 }]
  if (!name) return shapes
  if (kind === 'samen') {
    const together = value.width + nameBoxWidth(name, size)
    return [{ dx: 0, dy: 0, halfWidth: together / 2, halfHeight: value.height / 2, radius: 0 }]
  }
  const [dx, dy] = sockNameOffset(side, name, size)
  shapes.push({ dx, dy, halfWidth: sockNameWidth(name, size) / 2, halfHeight: (size + 4) / 2, radius: 0 })
  return shapes
}

/** Raken twee voetafdrukken elkaar bij deze schaal (px per wereldbreedte)? Lijf tegen lijf telt niet (zie Shape). */
export function footprintsTouch(a: { x: number; y: number }, shapesA: readonly Shape[], b: { x: number; y: number }, shapesB: readonly Shape[], scale: number, gapPx = 0.5): boolean {
  const dx = (a.x - b.x) * scale, dy = (a.y - b.y) * scale
  return shapesA.some((shapeA) => shapesB.some((shapeB) => {
    if (shapeA.body && shapeB.body) return false
    const x = Math.max(0, Math.abs(dx + shapeA.dx - shapeB.dx) - shapeA.halfWidth - shapeB.halfWidth)
    const y = Math.max(0, Math.abs(dy + shapeA.dy - shapeB.dy) - shapeA.halfHeight - shapeB.halfHeight)
    return Math.hypot(x, y) < shapeA.radius + shapeB.radius + gapPx
  }))
}
