import { writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import { windVanePlaces } from '../web/src/core/wind-beaufort.js'
import { WINDSOCK_BADGE, WINDSOCK_SHAPE } from '../web/src/core/wind-glyph.js'
import { FRAME, FRAME_PIXELS } from './config.js'
import { nativeProjection } from './native-projection.js'
import { windsockPlaces } from './native-windsocks.js'

// Verschuiving van elke windzak naast zijn plaatsnaam (U101, review orkestrator 2026-11-09): de badge en het eerste
// stuk zak mogen niet over een naam liggen. Berekend uit het naammasker van de bot (u103) en vastgelegd in
// web/src/core/windsock-anchors.ts, zodat app, Node-bot en Rust dezelfde ankers gebruiken.
// usage: pnpm -C bot exec tsx windsock-anchors.ts NAMES_PNG   (bv. de names-light.png van prepare-rust-basemaps)

const RADII = [0, 10, 14, 18, 22, 26]
const DIRECTIONS = 16
/** Zwaarder dan de rest: de badge met het getal moet vrij zijn; het eerste stuk zak liever ook. */
const BADGE_WEIGHT = 4
/** Een kleine voorkeur voor dicht bij de stad, in score per CSS-px². */
const DISTANCE_WEIGHT = 0.002
/** Twee badges dichter bij elkaar dan dit (CSS-px) tellen als botsing. */
const BADGE_CLEARANCE = (WINDSOCK_BADGE.radius + WINDSOCK_BADGE.gap) * 2 + 4

export async function windsockAnchors(namesPath: string): Promise<Record<string, [number, number]>> {
  const { data, info } = await sharp(namesPath).greyscale().raw().toBuffer({ resolveWithObject: true })
  if (info.width !== FRAME_PIXELS.width || info.height !== FRAME_PIXELS.height) throw new Error('Naammasker heeft niet de framemaat')
  const occupied = (x: number, y: number) => x >= 0 && y >= 0 && x < info.width && y < info.height && data[Math.floor(y) * info.width + Math.floor(x)]! > 0
  /** Deel van een schijf (straal in CSS-px) dat op een naam valt. */
  const covered = (centerX: number, centerY: number, radius: number) => {
    const pixels = radius * FRAME.scale
    let inside = 0, hits = 0
    for (let dy = -pixels; dy <= pixels; dy += 1.5) for (let dx = -pixels; dx <= pixels; dx += 1.5) {
      if (dx * dx + dy * dy > pixels * pixels) continue
      inside++
      if (occupied(centerX + dx, centerY + dy)) hits++
    }
    return inside ? hits / inside : 0
  }
  // Rooster met x0 = y0 = 0 en cel = 1 m: kolom/rij zijn dan direct Mercator-meters.
  const projection = nativeProjection({ crs: 'EPSG:3857', x0: 0, y0: 0, dx: 1, dy: -1, width: 1, height: 1 })
  const radius = 6378137
  const screen = (lng: number, lat: number) => projection.point(lng * Math.PI / 180 * radius - 0.5, -Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * radius - 0.5)
  const shown = new Set(windsockPlaces().map((place) => place.name))
  const badgeRadius = WINDSOCK_BADGE.radius + WINDSOCK_BADGE.gap
  const nearRadius = badgeRadius + WINDSOCK_SHAPE.sizes.kaart.maxLength / 2
  const placed: Array<[number, number]> = []
  const anchors: Record<string, [number, number]> = {}
  // Eerst de plaatsen van het botbeeld, in volgorde van belang; hun badges houden elkaar vrij.
  for (const place of [...windVanePlaces].sort((left, right) => Number(shown.has(right.name)) - Number(shown.has(left.name)))) {
    const [cityX, cityY] = screen(place.lng, place.lat)
    let best: { score: number; offset: [number, number] } | undefined
    for (const distance of RADII) {
      for (let direction = 0; direction < (distance ? DIRECTIONS : 1); direction++) {
        const angle = direction / DIRECTIONS * 2 * Math.PI
        const offset: [number, number] = [Math.round(Math.cos(angle) * distance), Math.round(Math.sin(angle) * distance)]
        const x = cityX + offset[0] * FRAME.scale, y = cityY + offset[1] * FRAME.scale
        const crowded = shown.has(place.name) && placed.some(([otherX, otherY]) => Math.hypot(otherX - x, otherY - y) < BADGE_CLEARANCE * FRAME.scale)
        const score = BADGE_WEIGHT * covered(x, y, badgeRadius) + covered(x, y, nearRadius) + DISTANCE_WEIGHT * distance * distance + (crowded ? 10 : 0)
        if (!best || score < best.score - 1e-9) best = { score, offset }
      }
    }
    anchors[place.name] = best!.offset
    if (shown.has(place.name)) placed.push([cityX + best!.offset[0] * FRAME.scale, cityY + best!.offset[1] * FRAME.scale])
  }
  return anchors
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [namesPath] = process.argv.slice(2)
  if (!namesPath) throw new Error('usage: pnpm -C bot exec tsx windsock-anchors.ts NAMES_PNG')
  const anchors = await windsockAnchors(namesPath)
  const lines = windVanePlaces.map((place) => `  ${JSON.stringify(place.name)}: [${anchors[place.name]!.join(', ')}],`)
  await writeFile(new URL('../web/src/core/windsock-anchors.ts', import.meta.url), `/**
 * Verschuiving van elke windzak t.o.v. zijn plaats in CSS-px (x naar rechts, y naar beneden), zodat badge en zak
 * naast de plaatsnaam staan (U101). Gegenereerd door bot/windsock-anchors.ts uit het naammasker van de bot; niet
 * met de hand aanpassen.
 */
export const WINDSOCK_ANCHOR_OFFSETS: Readonly<Record<string, readonly [number, number]>> = {
${lines.join('\n')}
}
`)
  console.log(`${Object.keys(anchors).length} ankers geschreven`)
}
