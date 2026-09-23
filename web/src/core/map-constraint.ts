import type { MapView } from './location-memory'
import { NETHERLANDS_FLANDERS_BOUNDS, paddedGeographicBounds, type GeographicBounds } from './map-frame'

export interface Viewport {
  width: number
  height: number
}

const tileSize = 512
const [[west, south], [east, north]] = paddedGeographicBounds(NETHERLANDS_FLANDERS_BOUNDS, 0.04)
export const MAP_CONTAIN_BOUNDS: GeographicBounds = { west, south, east, north }

// Kleinste zoom waarop de bounds per as nog passen: de krappe as bepaalt (contain).
export function containZoom(bounds: GeographicBounds, viewport: Viewport): number {
  const spanX = mercatorX(bounds.east) - mercatorX(bounds.west)
  const spanY = mercatorY(bounds.south) - mercatorY(bounds.north)
  return Math.log2(Math.min(viewport.width / spanX, viewport.height / spanY) / tileSize)
}

export function containView(bounds: GeographicBounds, viewport: Viewport): MapView {
  const x = (mercatorX(bounds.west) + mercatorX(bounds.east)) / 2
  const y = (mercatorY(bounds.north) + mercatorY(bounds.south)) / 2
  return { lng: lngFromMercatorX(x), lat: latFromMercatorY(y), zoom: containZoom(bounds, viewport) }
}

// Per as: past de viewport om de bounds heen, dan staat het centrum vast op het midden
// van de bounds (geen zinloos schuiven op een widescreen); anders blijft de viewport
// binnen de bounds (cover).
export function constrainView(view: MapView, bounds: GeographicBounds, viewport: Viewport, maxZoom = Infinity): MapView {
  const zoom = Math.max(containZoom(bounds, viewport), Math.min(view.zoom, maxZoom))
  const worldSize = tileSize * 2 ** zoom
  const x = clampAxis(mercatorX(view.lng), mercatorX(bounds.west), mercatorX(bounds.east), viewport.width / 2 / worldSize)
  const y = clampAxis(mercatorY(view.lat), mercatorY(bounds.north), mercatorY(bounds.south), viewport.height / 2 / worldSize)
  return { lng: lngFromMercatorX(x), lat: latFromMercatorY(y), zoom }
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
