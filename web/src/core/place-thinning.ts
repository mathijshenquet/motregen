import type { Shape } from './place-footprint.js'

/**
 * Minimale zoom per plek (U114, MIP-43): in volgorde van belang krijgt elke plek de laagste zoom waarop zijn
 * voetafdruk die van geen enkele belangrijkere, dan zichtbare plek raakt, en bij geen hogere zoom meer. Een plek is
 * zichtbaar vanaf zijn minimale zoom. Daaruit volgt: inzoomen voegt alleen toe, pannen of de pin veranderen niets,
 * en een minder belangrijke plek verdringt nooit een belangrijkere.
 */
export interface ThinCandidate {
  /** Web-Mercator, wereldfractie 0–1. */
  x: number
  y: number
  shapes: readonly Shape[]
  /** Niet eerder dan deze zoom (bijv. een rangdrempel). */
  floor?: number
}

export interface ThinOptions {
  fromZoom: number
  toZoom: number
  /** Lucht tussen twee voetafdrukken in px; de dichtheidsknop. */
  gapPx: number
}

const TILE = 512
/** Ophogen bij een wijziging in de rekenregel hieronder: de opgeslagen tabel moet dan opnieuw (place-order-build). */
export const THINNING_VERSION = 2

export function mercatorFraction(lng: number, lat: number): { x: number; y: number } {
  return { x: (lng + 180) / 360, y: (1 - Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) / Math.PI) / 2 }
}

/** Minimale zoom per kandidaat, in de volgorde van `candidates`; Infinity: niet binnen `toZoom`. */
export function minimumZooms(candidates: readonly ThinCandidate[], options: ThinOptions): number[] {
  const { fromZoom, toZoom, gapPx } = options
  const reach = candidates.map((candidate) => ({
    x: Math.max(...candidate.shapes.map((shape) => Math.abs(shape.dx) + shape.halfWidth + shape.radius)),
    y: Math.max(...candidate.shapes.map((shape) => Math.abs(shape.dy) + shape.halfHeight + shape.radius)),
  }))
  const zooms: number[] = []
  const shown: number[] = []
  candidates.forEach((candidate, index) => {
    let zoom = Math.max(fromZoom, candidate.floor ?? fromZoom)
    for (const other of shown) {
      if (zoom > toZoom) break
      const before = candidates[other]!
      const dx = candidate.x - before.x, dy = candidate.y - before.y
      // Goedkope grens: voorbij deze zoom liggen de omhullende vakken uit elkaar.
      const limitX = dx ? (reach[index]!.x + reach[other]!.x + gapPx) / Math.abs(dx) : Infinity
      const limitY = dy ? (reach[index]!.y + reach[other]!.y + gapPx) / Math.abs(dy) : Infinity
      const bound = Math.log2(Math.min(limitX, limitY) / TILE)
      const settled = Math.max(zoom, zooms[other]!)
      if (bound <= settled) continue
      const clash = lastClash(candidate, before, gapPx, settled, toZoom)
      if (clash > zooms[other]!) zoom = Math.max(zoom, clash)
    }
    zooms.push(zoom > toZoom ? Infinity : zoom)
    if (zoom <= toZoom) shown.push(index)
  })
  return zooms
}

/**
 * Hoogste zoom in [from, to] waarop twee voetafdrukken elkaar raken (−Infinity: nergens, Infinity: ook nog bij `to`).
 * Per vormpaar is de botsing langs de zoom één interval: het verschil van de middelpunten beweegt lineair in de
 * schaal en de Minkowski-som van twee afgeronde rechthoeken is convex.
 */
export function lastClash(a: ThinCandidate, b: ThinCandidate, gapPx: number, from: number, to: number): number {
  let last = -Infinity
  for (const shapeA of a.shapes) for (const shapeB of b.shapes) {
    if (shapeA.body && shapeB.body) continue
    const zoom = shapeClash(a.x - b.x, a.y - b.y, shapeA, shapeB, gapPx, from, to)
    if (zoom === Infinity) return Infinity
    last = Math.max(last, zoom)
  }
  return last
}

function shapeClash(worldX: number, worldY: number, a: Shape, b: Shape, gapPx: number, from: number, to: number): number {
  const offsetX = a.dx - b.dx, offsetY = a.dy - b.dy
  const halfX = a.halfWidth + b.halfWidth, halfY = a.halfHeight + b.halfHeight
  // Minstens een halve px: met straal 0 telt de afstand-tot-het-vak een overlap van twee rechthoeken niet.
  const radius = a.radius + b.radius + Math.max(gapPx, 0.5)
  const distance = (scale: number) => Math.hypot(
    Math.max(0, Math.abs(worldX * scale + offsetX) - halfX),
    Math.max(0, Math.abs(worldY * scale + offsetY) - halfY),
  )
  const low = TILE * 2 ** from, high = TILE * 2 ** to
  if (distance(high) < radius) return Infinity
  // Dichtste nadering (convex in de schaal), dan de rand van het botsinterval daarboven.
  let left = low, right = high
  for (let step = 0; step < 100; step++) {
    const third = (right - left) / 3
    if (distance(left + third) <= distance(right - third)) right -= third
    else left += third
  }
  let inside = (left + right) / 2
  if (distance(inside) >= radius) return -Infinity
  let outside = high
  for (let step = 0; step < 60; step++) {
    const middle = (inside + outside) / 2
    if (distance(middle) < radius) inside = middle
    else outside = middle
  }
  return Math.log2(outside / TILE)
}
