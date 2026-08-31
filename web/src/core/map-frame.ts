import type { Grid } from './contract'

export interface GeographicBounds {
  west: number
  south: number
  east: number
  north: number
}

export interface GeographicMargins {
  west: number
  south: number
  east: number
  north: number
}

export interface MapFrame {
  dataBounds: GeographicBounds
  maxBounds: [[number, number], [number, number]]
  mask: {
    type: 'Feature'
    properties: Record<string, never>
    geometry: { type: 'Polygon'; coordinates: number[][][] }
  }
}

export const NETHERLANDS_FLANDERS_BOUNDS: GeographicBounds = {
  west: 2.5,
  south: 50.67,
  east: 7.23,
  north: 53.56,
}

const defaultMarginMeters = 140_000

export function mapFrameFromGrid(grid: Grid, marginMeters = defaultMarginMeters): MapFrame {
  const x1 = grid.x0 + grid.dx * grid.width
  const y1 = grid.y0 + grid.dy * grid.height
  const westX = Math.min(grid.x0, x1)
  const eastX = Math.max(grid.x0, x1)
  const southY = Math.min(grid.y0, y1)
  const northY = Math.max(grid.y0, y1)
  const dataBounds = projectedBounds(westX, southY, eastX, northY)
  const outer = projectedBounds(westX - marginMeters, southY - marginMeters, eastX + marginMeters, northY + marginMeters)
  const outerRing = ring(outer)
  const innerRing = ring(dataBounds).reverse()
  return {
    dataBounds,
    maxBounds: [[outer.west, outer.south], [outer.east, outer.north]],
    mask: {
      type: 'Feature',
      properties: {},
      geometry: { type: 'Polygon', coordinates: [outerRing, innerRing] },
    },
  }
}

export function paddedGeographicBounds(bounds: GeographicBounds, margins: number | GeographicMargins): [[number, number], [number, number]] {
  const fractions = typeof margins === 'number'
    ? { west: margins, south: margins, east: margins, north: margins }
    : margins
  const longitudeSpan = bounds.east - bounds.west
  const latitudeSpan = bounds.north - bounds.south
  return [
    [bounds.west - longitudeSpan * fractions.west, bounds.south - latitudeSpan * fractions.south],
    [bounds.east + longitudeSpan * fractions.east, bounds.north + latitudeSpan * fractions.north],
  ]
}

function projectedBounds(west: number, south: number, east: number, north: number): GeographicBounds {
  const [westLng, southLat] = unproject(west, south)
  const [eastLng, northLat] = unproject(east, north)
  return { west: westLng, south: southLat, east: eastLng, north: northLat }
}

function ring(bounds: GeographicBounds): number[][] {
  return [
    [bounds.west, bounds.south],
    [bounds.east, bounds.south],
    [bounds.east, bounds.north],
    [bounds.west, bounds.north],
    [bounds.west, bounds.south],
  ]
}

function unproject(x: number, y: number): [number, number] {
  const radius = 6_378_137
  return [x / radius * 180 / Math.PI, (2 * Math.atan(Math.exp(y / radius)) - Math.PI / 2) * 180 / Math.PI]
}
