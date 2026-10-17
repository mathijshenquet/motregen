import type { MrfHeader } from './contract.js'

export function projectPoint(lng: number, lat: number): [number, number] {
  const radius = 6378137
  return [lng * Math.PI / 180 * radius, Math.log(Math.tan(Math.PI / 4 + lat * Math.PI / 360)) * radius]
}

export function pointValue(header: MrfHeader, decoded: Uint8Array, projectedX: number, projectedY: number): number | null {
  const column = Math.floor((projectedX - header.grid.x0) / header.grid.dx)
  const row = Math.floor((projectedY - header.grid.y0) / header.grid.dy)
  if (column < 0 || row < 0 || column >= header.grid.width || row >= header.grid.height) return null
  return header.quant[decoded[row * header.grid.width + column]!] ?? null
}

/**
 * Bilineair tussen de vier dichtstbijzijnde celmiddens; ontbrekende buren vallen weg en de rest weegt naar
 * verhouding. Voor grove velden (ECMWF, 24 km) waar de dichtstbijzijnde cel een merkbare sprong geeft.
 */
export function pointValueBilinear(header: MrfHeader, decoded: Uint8Array, projectedX: number, projectedY: number): number | null {
  const { x0, y0, dx, dy, width, height } = header.grid
  const column = (projectedX - x0) / dx - 0.5
  const row = (projectedY - y0) / dy - 0.5
  if (column < -0.5 || row < -0.5 || column > width - 0.5 || row > height - 0.5) return null
  const left = Math.floor(column)
  const top = Math.floor(row)
  const mixX = column - left
  const mixY = row - top
  let sum = 0
  let weights = 0
  for (const [cellColumn, cellRow, weight] of [
    [left, top, (1 - mixX) * (1 - mixY)], [left + 1, top, mixX * (1 - mixY)],
    [left, top + 1, (1 - mixX) * mixY], [left + 1, top + 1, mixX * mixY],
  ] as const) {
    if (weight <= 0 || cellColumn < 0 || cellRow < 0 || cellColumn >= width || cellRow >= height) continue
    const value = header.quant[decoded[cellRow * width + cellColumn]!]
    if (value == null) continue
    sum += value * weight
    weights += weight
  }
  return weights > 0 ? sum / weights : null
}
