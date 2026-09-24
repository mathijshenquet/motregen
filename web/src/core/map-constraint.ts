import type { MapView } from './location-memory'
import { NETHERLANDS_FLANDERS_BOUNDS, paddedGeographicBounds, type GeographicBounds } from './map-frame'

export interface Viewport {
  width: number
  height: number
  // Randen die overlays (zoekbalk) afdekken: contain en clamp gelden voor het vrije deel.
  insets?: Insets
}

export interface Insets {
  top: number
  right: number
  bottom: number
  left: number
}

const tileSize = 512
const [[west, south], [east, north]] = paddedGeographicBounds(NETHERLANDS_FLANDERS_BOUNDS, 0.04)
export const MAP_CONTAIN_BOUNDS: GeographicBounds = { west, south, east, north }

// Kleinste zoom waarop de bounds per as nog passen: de krappe as bepaalt (contain).
export function containZoom(bounds: GeographicBounds, viewport: Viewport): number {
  const { width, height } = freeArea(viewport)
  const spanX = mercatorX(bounds.east) - mercatorX(bounds.west)
  const spanY = mercatorY(bounds.south) - mercatorY(bounds.north)
  return Math.log2(Math.min(width / spanX, height / spanY) / tileSize)
}

export function containView(bounds: GeographicBounds, viewport: Viewport): MapView {
  const { offsetX, offsetY } = freeArea(viewport)
  const zoom = containZoom(bounds, viewport)
  const worldSize = tileSize * 2 ** zoom
  const x = (mercatorX(bounds.west) + mercatorX(bounds.east)) / 2 - offsetX / worldSize
  const y = (mercatorY(bounds.north) + mercatorY(bounds.south)) / 2 - offsetY / worldSize
  return { lng: lngFromMercatorX(x), lat: latFromMercatorY(y), zoom }
}

// Per as: past de viewport om de bounds heen, dan staat het centrum vast op het midden
// van de bounds (geen zinloos schuiven op een widescreen); anders blijft de viewport
// binnen de bounds (cover).
export function constrainView(view: MapView, bounds: GeographicBounds, viewport: Viewport, maxZoom = Infinity): MapView {
  const { width, height, offsetX, offsetY } = freeArea(viewport)
  const zoom = Math.max(containZoom(bounds, viewport), Math.min(view.zoom, maxZoom))
  const worldSize = tileSize * 2 ** zoom
  const x = clampAxis(mercatorX(view.lng) + offsetX / worldSize, mercatorX(bounds.west), mercatorX(bounds.east), width / 2 / worldSize) - offsetX / worldSize
  const y = clampAxis(mercatorY(view.lat) + offsetY / worldSize, mercatorY(bounds.north), mercatorY(bounds.south), height / 2 / worldSize) - offsetY / worldSize
  return { lng: lngFromMercatorX(x), lat: latFromMercatorY(y), zoom }
}

// Het vrije deel van de viewport en hoever zijn midden (in px) van het kaartmidden ligt.
function freeArea(viewport: Viewport): { width: number; height: number; offsetX: number; offsetY: number } {
  const { top = 0, right = 0, bottom = 0, left = 0 } = viewport.insets ?? {}
  return {
    width: Math.max(1, viewport.width - left - right),
    height: Math.max(1, viewport.height - top - bottom),
    offsetX: (left - right) / 2,
    offsetY: (top - bottom) / 2,
  }
}

function clampAxis(center: number, low: number, high: number, halfSpan: number): number {
  if (2 * halfSpan >= high - low) return (low + high) / 2
  return Math.min(Math.max(center, low + halfSpan), high - halfSpan)
}

function mercatorX(lng: number): number {
  return (lng + 180) / 360
}

function mercatorY(lat: number): number {
  const phi = lat * Math.PI / 180
  return (1 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / Math.PI) / 2
}

function lngFromMercatorX(x: number): number {
  return x * 360 - 180
}

function latFromMercatorY(y: number): number {
  return Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180 / Math.PI
}
