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
