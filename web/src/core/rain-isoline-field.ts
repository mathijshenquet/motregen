import type { Grid } from './contract'
import type { ScalarField } from './isolines'

// Proef (PO 2026-10-16: "de isolijnen logica van temperatuur hergebruiken"): het regenveld als invoer voor de
// bestaande isolijnlaag. Die laag houdt alle tijdstappen tegelijk in één 3D-textuur; op 1 km zou dat voor de
// regentijdlijn ±1 GB zijn, daarom middelen we eerst naar blokken van RAIN_ISOLINE_BLOCK cellen.
export const RAIN_ISOLINE_BLOCK = 5
// De lichtste regen in de data (zie ONSET_RATE in rain-palette.ts): daar ligt de buitenrand.
const ONSET_RATE = 0.1

/**
 * Regen (mm/u) op een schaal waarop de lijnen op hele getallen vallen: 1 op de buitenrand, 2 op de eerste
 * isolijnwaarde, 3 op de tweede, … Lineair in log(regen) tussen die punten, zodat de lijnen tussen
 * blokken even ver verschuiven als de kleuren; droog is 0.
 */
export function rainIsolineLevel(rate: number, rates: readonly number[]): number {
  if (!(rate > 0)) return 0
  if (rate <= ONSET_RATE) return rate / ONSET_RATE
  const anchors = [ONSET_RATE, ...rates]
  for (let index = 1; index < anchors.length; index++) {
    if (rate <= anchors[index]!) {
      const lower = Math.log(anchors[index - 1]!), upper = Math.log(anchors[index]!)
      return index + (Math.log(rate) - lower) / (upper - lower)
    }
  }
  const last = anchors.length - 1
  const previous = Math.log(anchors[last - 1] ?? ONSET_RATE), top = Math.log(anchors[last]!)
  return last + 1 + (Math.log(rate) - top) / Math.max(1e-6, top - previous)
}

/** Eén regenframe als verkleind niveauveld; cellen zonder data tellen als droog. */
export function rainIsolineField(data: Uint8Array, quant: ReadonlyArray<number | null>, grid: Grid, rates: readonly number[]): { grid: Grid; field: ScalarField } {
  const width = Math.ceil(grid.width / RAIN_ISOLINE_BLOCK)
  const height = Math.ceil(grid.height / RAIN_ISOLINE_BLOCK)
  const levels = new Float32Array(256)
  for (let code = 0; code < 256; code++) levels[code] = rainIsolineLevel(quant[code] ?? 0, rates)
  const values = new Float32Array(width * height)
  for (let blockRow = 0; blockRow < height; blockRow++) {
    for (let blockColumn = 0; blockColumn < width; blockColumn++) {
      let sum = 0, count = 0
      for (let row = blockRow * RAIN_ISOLINE_BLOCK; row < Math.min(grid.height, (blockRow + 1) * RAIN_ISOLINE_BLOCK); row++) {
        for (let column = blockColumn * RAIN_ISOLINE_BLOCK; column < Math.min(grid.width, (blockColumn + 1) * RAIN_ISOLINE_BLOCK); column++) {
          sum += levels[data[row * grid.width + column]!]!
          count++
        }
      }
      values[blockRow * width + blockColumn] = sum / count
    }
  }
  const blockGrid: Grid = { ...grid, width, height, dx: grid.dx * RAIN_ISOLINE_BLOCK, dy: grid.dy * RAIN_ISOLINE_BLOCK }
  return { grid: blockGrid, field: { width, height, values } }
}
