import { readFile, writeFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import type { Grid, MrfHeader } from '../web/src/core/contract.js'
import { beaufortFrame, beaufortScale } from '../web/src/core/wind-beaufort.js'
import { WINDSOCK_SAMPLES, windsockBadge, windsockBand, windsockInflated, windsockShape } from '../web/src/core/wind-glyph.js'
import { advanceSock, sampleWind, SOCK_SNAP_SECONDS, swayBends, windsockHeadings, type SockMotion, type WindsockField } from '../web/src/core/windsock-flow.js'
import { fillPolygon } from './native-windsocks.js'

// Gelijkheidstest Rust ↔ Node voor de windzakken (U101): de Node-uitkomsten voor vaste invoer, die
// crates/render-core/src/windsock.rs in zijn tests narekent.
const path = new URL('../crates/render-core/assets/windsock-fixtures.json', import.meta.url)

/** Een draaiend veld: wind rond een punt ten noordwesten van het rooster, sterker naar buiten. */
function rotatingField(): WindsockField {
  const grid: Grid = { crs: 'EPSG:3857', x0: 300_000, y0: 7_000_000, dx: 40_000, dy: -40_000, width: 12, height: 12 }
  const vectors = (turn: number, gain: number) => {
    const values = new Float32Array(grid.width * grid.height * 2)
    for (let row = 0; row < grid.height; row++) for (let column = 0; column < grid.width; column++) {
      const offsetX = column - 2, offsetY = row - 2
      const angle = Math.atan2(offsetY, offsetX) + turn
      const speed = gain * (2 + Math.hypot(offsetX, offsetY))
      const index = (row * grid.width + column) * 2
      values[index] = -Math.sin(angle) * speed
      values[index + 1] = Math.cos(angle) * speed
    }
    return values
  }
  return {
    grid,
    slices: [
      { left: vectors(0, 1), right: vectors(0.2, 1.2), mix: 0.3 },
      { left: vectors(-0.4, 0.9), right: vectors(-0.2, 1), mix: 0.6 },
      { left: vectors(-0.9, 0.8), right: vectors(-0.7, 0.9), mix: 0.1 },
    ],
  }
}

export function windsockFixtures() {
  const shapes = [
    { strength: 0.4, headings: Array.from({ length: WINDSOCK_SAMPLES + 1 }, () => 37) },
    { strength: 3.2, headings: Array.from({ length: WINDSOCK_SAMPLES + 1 }, (_, index) => 200 + index * 1.5) },
    { strength: 7.8, headings: Array.from({ length: WINDSOCK_SAMPLES + 1 }, (_, index) => 300 - index * index * 0.1) },
  ].map(({ strength, headings }) => {
    const shape = windsockShape(strength, headings, 'kaart')
    return { strength, headings, shape, band: windsockBand(shape, 2), inflated: windsockInflated(shape, 1.6), badge: windsockBadge(shape, 'mond', '12'), middle: windsockBadge(shape, 'midden', '104') }
  })
  const field = rotatingField()
  const points = [[480_000, 6_700_000], [620_000, 6_620_000], [700_000, 6_800_000], [350_000, 6_590_000]] as const
  const flow = points.map(([x, y]) => ({
    x, y, wind: sampleWind(field, 0, x, y) ?? null, lagged: sampleWind(field, 2, x, y) ?? null,
    beide: windsockHeadings(field, x, y, 'beide') ?? null, stroom: windsockHeadings(field, x, y, 'stroom') ?? null, traag: windsockHeadings(field, x, y, 'traag') ?? null,
  }))
  // Momentum en wuiven (U107): een zak door een reeks filmframes, met een richtingsprong over 0°/360°, een
  // krachtsprong en een sprong in de tijd (snap).
  const motion: SockMotion = { wave: 0 }
  let seconds = 1234.5
  const motions = [
    [350, 2.4, 0, true], [10, 2.4, 0.133, false], [15, 5.6, 0.133, false], [20, 5.6, 0.133, false],
    [200, 7.9, 0.133, false], [205, 1.2, 0.4, false], [205, 1.2, 2.5, false], [30, 0.2, 0.133, false],
  ].map(([target, force, elapsed, snap]) => {
    seconds += elapsed as number
    const jump = snap as boolean || !(elapsed as number > 0) || (elapsed as number) > SOCK_SNAP_SECONDS
    const moving = advanceSock(motion, target as number, force as number, elapsed as number, jump)
    const strength = Math.max(0, motion.strength!.value)
    return { target, force, elapsed, snap: jump, seconds, moving, heading: { ...motion.heading! }, strength: { ...motion.strength! }, wave: motion.wave, bends: swayBends(strength, motion.wave, seconds, 1.7) }
  })
  const size = { width: 24, height: 20 }
  const fills = [
    { points: [[2.3, 1.6], [19.7, 4.2], [14.1, 17.8], [-3, 12]] as [number, number][], cut: undefined },
    { points: [[0, 0], [24, 0], [24, 20], [0, 20]] as [number, number][], cut: { x: 11.3, y: 9.6, radius: 5.2 } },
    { points: [[12, -4], [30, 10], [12, 24], [-6, 10]] as [number, number][], cut: { x: 4, y: 4, radius: 3 } },
  ].map(({ points, cut }) => {
    const rgb = Buffer.alloc(size.width * size.height * 3, 40)
    fillPolygon(rgb, points, [250, 120, 30], 0.8, size, cut)
    return { points, cut: cut ?? null, rgb: [...rgb] }
  })
  const header = { quant: Array.from({ length: 256 }, (_, code) => code === 255 ? null : (code - 128) * 0.25) } as unknown as MrfHeader
  const east = Uint8Array.from([128, 160, 100, 255, 230, 128 + 70]), north = Uint8Array.from([128, 140, 60, 140, 20, 128 + 90])
  const beaufort = {
    speeds: [0, 0.2, 1.6, 4, 10.8, 25, 40].map((speed) => ({ speed, scale: beaufortScale(speed) })),
    east: [...east], north: [...north], quant: header.quant, frame: [...beaufortFrame(east, north, header, header).data],
  }
  return { size, shapes, field: { grid: field.grid, slices: field.slices.map((slice) => ({ left: [...slice.left], right: [...slice.right], mix: slice.mix })) }, flow, motions, fills, beaufort }
}

export async function generateWindsockFixtures(check = false): Promise<void> {
  const expected = JSON.stringify(windsockFixtures()) + '\n'
  if (check) {
    if (await readFile(path, 'utf8') !== expected) throw new Error('Verouderde windzakfixtures; draai pnpm -C bot render:constants')
  } else await writeFile(path, expected)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) await generateWindsockFixtures(process.argv.includes('--check'))
