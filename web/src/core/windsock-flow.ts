import type { Grid } from './contract.js'
import { WINDSOCK_SAMPLES } from './wind-glyph.js'

/** Hoe de zak meebuigt: met de stroomlijn door de mast, met traagheid in de tijd, of allebei (U101 ronde 3). */
export const WINDSOCK_CURVATURES = ['stroom', 'traag', 'beide'] as const
export type WindsockCurvature = typeof WINDSOCK_CURVATURES[number]
export const DEFAULT_WINDSOCK_CURVATURE: WindsockCurvature = 'beide'

/**
 * Stuk stroomlijn dat op de zak wordt afgebeeld. Over de echte zaklengte (tientallen km) buigt het HARMONIE-veld
 * nauwelijks; over dit stuk wel zichtbaar, en het blijft bij elke zoom dezelfde vorm.
 */
export const WINDSOCK_STREAM_KM = 120
/** De staart volgt de richting van zoveel minuten eerder; de mond de huidige. */
export const WINDSOCK_LAG_MINUTES = 90
/** Meer dan dit buigt een echte zak niet; daarboven wordt het een krul. */
const MAX_BEND_DEGREES = 75

/** Windveld op één tijdstip: twee uurframes (u,v om en om, m/s) en hun menging. */
export interface WindSlice {
  left: Float32Array
  right: Float32Array
  mix: number
}

/** Het veld nu, WINDSOCK_LAG_MINUTES / 2 eerder en WINDSOCK_LAG_MINUTES eerder. */
export interface WindsockField {
  grid: Grid
  slices: readonly [WindSlice, WindSlice, WindSlice]
}

/** Wind (oost, noord) in m/s op een punt in Web-Mercator-meters, bilineair tussen de celmiddens. */
export function sampleWind(field: WindsockField, slice: 0 | 1 | 2, x: number, y: number): [number, number] | undefined {
  const { grid } = field
  const column = (x - grid.x0) / grid.dx - 0.5
  const row = (y - grid.y0) / grid.dy - 0.5
  const column0 = Math.max(0, Math.min(grid.width - 2, Math.floor(column)))
  const row0 = Math.max(0, Math.min(grid.height - 2, Math.floor(row)))
  if (column < -0.5 || row < -0.5 || column > grid.width - 0.5 || row > grid.height - 0.5) return undefined
  const across = Math.max(0, Math.min(1, column - column0)), down = Math.max(0, Math.min(1, row - row0))
  const { left, right, mix } = field.slices[slice]
  let east = 0, north = 0
  for (const [dRow, dColumn, weight] of [[0, 0, (1 - across) * (1 - down)], [0, 1, across * (1 - down)], [1, 0, (1 - across) * down], [1, 1, across * down]] as const) {
    const index = ((row0 + dRow) * grid.width + column0 + dColumn) * 2
    east += weight * (left[index]! * (1 - mix) + right[index]! * mix)
    north += weight * (left[index + 1]! * (1 - mix) + right[index + 1]! * mix)
  }
  return Number.isFinite(east) && Number.isFinite(north) ? [east, north] : undefined
}

/** Kompasrichting waar de wind heen waait, in graden met de klok mee vanaf noord. */
export function towardDegrees([east, north]: readonly [number, number]): number {
  return (Math.atan2(east, north) * 180 / Math.PI + 360) % 360
}

/** Kortste hoek van `from` naar `to`, in (-180, 180]. */
export function angleDifference(from: number, to: number): number {
  return ((to - from) % 360 + 540) % 360 - 180
}

export function mixAngle(from: number, to: number, share: number): number {
  return from + angleDifference(from, to) * share
}

/**
 * Schermhoek per asstuk van mond tot staart. Het scherm staat noord-boven (de kaart draait niet), dus een
 * kompasrichting is direct een schermhoek.
 */
export function windsockHeadings(field: WindsockField, x: number, y: number, curvature: WindsockCurvature): number[] | undefined {
  const here = sampleWind(field, 0, x, y)
  if (!here) return undefined
  const base = towardDegrees(here)
  const bends = Array<number>(WINDSOCK_SAMPLES + 1).fill(0)
  if (curvature !== 'traag') {
    const step = WINDSOCK_STREAM_KM * 1000 / WINDSOCK_SAMPLES
    let pointX = x, pointY = y
    for (let index = 0; index <= WINDSOCK_SAMPLES; index++) {
      const wind = sampleWind(field, 0, pointX, pointY)
      if (!wind) { bends.fill(bends[index - 1] ?? 0, index); break }
      const direction = towardDegrees(wind)
      bends[index] = angleDifference(base, direction)
      pointX += Math.sin(direction * Math.PI / 180) * step
      pointY += Math.cos(direction * Math.PI / 180) * step
    }
  }
  if (curvature !== 'stroom') {
    const halfway = sampleWind(field, 1, x, y), earliest = sampleWind(field, 2, x, y)
    if (halfway && earliest) {
      const middle = angleDifference(base, towardDegrees(halfway))
      const end = angleDifference(base, towardDegrees(earliest))
      for (let index = 0; index <= WINDSOCK_SAMPLES; index++) {
        const t = index / WINDSOCK_SAMPLES
        bends[index]! += t <= 0.5 ? middle * t * 2 : middle + (end - middle) * (t - 0.5) * 2
      }
    }
  }
  return bends.map((bend) => base + Math.max(-MAX_BEND_DEGREES, Math.min(MAX_BEND_DEGREES, bend)))
}
