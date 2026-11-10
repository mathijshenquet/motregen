import { WINDSOCK_SAMPLES, windsockShape } from './wind-glyph.js'
import { sockBadge, windsockExtent } from './wind-sock-draw.js'

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

/** Windrichtingen waarover de reikwijdte van zak en pil wordt gemeten (elke 15°). */
const HEADINGS = Array.from({ length: 24 }, (_, index) => index * 15)
const longest = (heading: number) => windsockShape(12, Array<number>(WINDSOCK_SAMPLES + 1).fill(heading), 'kaart')

/**
 * Bereik van het zaklijf in elke richting (de langste zak, 12 Bft, met schaduw; wind-sock-draw `windsockExtent`, U113),
 * in px vanaf de mast.
 */
export const SOCK_REACH_PX = Math.ceil(Math.max(...HEADINGS.map((heading) => {
  const extent = windsockExtent(longest(heading), { x: 0, y: 0, halfWidth: 0, halfHeight: 0, gap: 0 })
  return Math.max(-extent.left, extent.right, -extent.top, extent.bottom)
})))

/**
 * Breedste pil-labels (U113 `sockBadge`, stijl `pil`): km/u is veel breder ("150 km/u", ± 58 px bereik) dan Bft, kn
 * en m/s (± 43 px). Daarom een eigen Wind-voetafdruk voor km/u (`zak-kmu`), anders zou elke zak ruimte voor km/u houden.
 */
const WIDEST_PILLS = { narrow: [['12', 'Bft'], ['80', 'kn'], ['40', 'm/s']], wide: [['150', 'km/u']] } as const
const pillRadius = new Map<string, number>()

/**
 * Bereik van de pil rond de mast (U113): hij wijst van de zak af, dus hij kan aan elke kant staan; hoek van zijn vak
 * plus de snede, over alle windrichtingen. `wide`: met km/u.
 */
export function sockPillRadius(size: number, wide = false): number {
  const key = `${size}|${wide}`
  let radius = pillRadius.get(key)
  if (radius === undefined) {
    radius = Math.ceil(Math.max(...(wide ? WIDEST_PILLS.wide : WIDEST_PILLS.narrow).flatMap(([label, unit]) => HEADINGS.map((heading) => {
      const pill = sockBadge(longest(heading), heading, label, unit, 'pil', size)
      return Math.hypot(Math.abs(pill.x) + pill.halfWidth + pill.gap, Math.abs(pill.y) + pill.halfHeight + pill.gap)
    }))))
    pillRadius.set(key, radius)
  }
  return radius
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

/** Dichtste afstand van de naam tot de mast (de oude badge plus lucht), als de pil niet aan die kant staat. */
const MAST_CLEAR_PX = 14 + 1 + 4

/** Vak van een pil t.o.v. de mast (U113 `sockBadge`): middelpunt, halve maten en snede. */
export interface PillBox { x: number; y: number; halfWidth: number; halfHeight: number; gap: number }

/**
 * Middelpunt van de naam t.o.v. het zakanker, aan de vaste kant van de plek: vlak bij de mast, en alleen verder weg als
 * de pil op die plek staat (hij wijst van de zak af, dus dat hangt van de wind af). Zonder `pill` het verste punt.
 */
export function sockNameOffset(side: LabelSide, name: string, size: number, wide = false, pill?: PillBox): [number, number] {
  const height = size + 4, width = sockNameWidth(name, size)
  const far = sockPillRadius(size, wide) + 1 + 4
  // Hoe ver de naam van de mast moet om de pil te ontwijken (op de as van zijn kant), als ze elkaar dwars raken.
  const clear = (along: number, alongHalf: number, across: number, acrossHalf: number, nameAcrossHalf: number) => {
    if (!pill || Math.abs(across) >= acrossHalf + nameAcrossHalf) return MAST_CLEAR_PX
    return Math.min(far, Math.max(MAST_CLEAR_PX, along + alongHalf + pill.gap + 4))
  }
  if (side === 'onder') return [0, (pill ? clear(pill.y, pill.halfHeight, pill.x, pill.halfWidth + pill.gap, width / 2) : far) + height / 2]
  if (side === 'boven') return [0, -(pill ? clear(-pill.y, pill.halfHeight, pill.x, pill.halfWidth + pill.gap, width / 2) : far) - height / 2]
  if (side === 'rechts') return [(pill ? clear(pill.x, pill.halfWidth, pill.y, pill.halfHeight + pill.gap, height / 2) : far) + width / 2, 0]
  return [-(pill ? clear(-pill.x, pill.halfWidth, pill.y, pill.halfHeight + pill.gap, height / 2) : far) - width / 2, 0]
}

/** De band waarin de naam kan staan (van vlak bij de mast tot het verste punt), als één vak voor de voetafdruk. */
export function sockNameSpan(side: LabelSide, name: string, size: number, wide = false): Shape {
  const height = size + 4, width = sockNameWidth(name, size)
  const near = MAST_CLEAR_PX, far = sockPillRadius(size, wide) + 1 + 4
  const vertical = side === 'onder' || side === 'boven', sign = side === 'onder' || side === 'rechts' ? 1 : -1
  const extent = vertical ? height : width
  const centre = sign * ((near + far) / 2 + extent / 2), half = (far - near) / 2 + extent / 2
  return vertical ? { dx: 0, dy: centre, halfWidth: width / 2, halfHeight: half, radius: 0 } : { dx: centre, dy: 0, halfWidth: half, halfHeight: height / 2, radius: 0 }
}

/** Grootste getal dat een plek kan dragen, voor een vaste maat: "−10°". */
const WIDEST_VALUE = '−10°'

/**
 * `samen`: Weer, Gevoel en Lucht, met de naam vóór het getal in één label (of, in Lucht, de naam alleen op dezelfde
 * plek); `zak`: Wind (lijfbereik, pil, naam aan de vaste kant), `zak-kmu` hetzelfde met de bredere km/u-pil.
 * Dezelfde orde, eigen voetafdruk: Wind is daardoor dunner dan Gevoel.
 */
export type FootprintKind = 'samen' | 'zak' | 'zak-kmu'
export const FOOTPRINT_KINDS: readonly FootprintKind[] = ['samen', 'zak', 'zak-kmu']

export function placeFootprint(name: string | undefined, side: LabelSide, size: number, kind: FootprintKind): Shape[] {
  const value = islandBox(WIDEST_VALUE, size)
  if (kind === 'samen') {
    const width = value.width + (name ? nameBoxWidth(name, size) : 0)
    return [{ dx: 0, dy: 0, halfWidth: width / 2, halfHeight: value.height / 2, radius: 0 }]
  }
  const wide = kind === 'zak-kmu'
  const shapes: Shape[] = [{ dx: 0, dy: 0, halfWidth: 0, halfHeight: 0, radius: SOCK_REACH_PX, body: true }, { dx: 0, dy: 0, halfWidth: 0, halfHeight: 0, radius: sockPillRadius(size, wide) }]
  if (!name) return shapes
  shapes.push(sockNameSpan(side, name, size, wide))
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
