import { nearestPlace } from './places'
import type { SavedPlace } from './saved-places'

export interface MapView {
  lng: number
  lat: number
  zoom: number
}

export interface StartLocation {
  lng: number
  lat: number
  label: string
}

const lastSavedPlaceKey = 'motregen-last-saved-place'
const mapViewKey = 'motregen-map-view'

export function loadLastSavedPlaceId(storage: Pick<Storage, 'getItem'> = localStorage): string | undefined {
  try {
    return storage.getItem(lastSavedPlaceKey) ?? undefined
  } catch {
    return undefined
  }
}

export function storeLastSavedPlaceId(id: string, storage: Pick<Storage, 'setItem'> = localStorage): void {
  try { storage.setItem(lastSavedPlaceKey, id) } catch { /* opslag geweigerd: geheugen is best-effort */ }
}

export function loadMapView(storage: Pick<Storage, 'getItem'> = localStorage): MapView | undefined {
  try {
    const value = JSON.parse(storage.getItem(mapViewKey) ?? 'null') as Partial<MapView> | null
    if (!value || typeof value !== 'object') return undefined
    const { lng, lat, zoom } = value
    if (!isFiniteIn(lng, -180, 180) || !isFiniteIn(lat, -85, 85) || !isFiniteIn(zoom, 0, 24)) return undefined
    return { lng, lat, zoom }
  } catch {
    return undefined
  }
}

export function storeMapView(view: MapView, storage: Pick<Storage, 'setItem'> = localStorage): void {
  const rounded = { lng: round(view.lng, 5), lat: round(view.lat, 5), zoom: round(view.zoom, 2) }
  try { storage.setItem(mapViewKey, JSON.stringify(rounded)) } catch { /* opslag geweigerd: geheugen is best-effort */ }
}

export function resolveStartLocation(
  savedPlaces: readonly SavedPlace[],
  lastSavedPlaceId: string | undefined,
  mapView: MapView | undefined,
  fallback: StartLocation,
): StartLocation {
  const saved = lastSavedPlaceId === undefined ? undefined : savedPlaces.find((place) => place.id === lastSavedPlaceId)
  if (saved) return { lng: saved.lng, lat: saved.lat, label: saved.name }
  if (mapView) return { lng: mapView.lng, lat: mapView.lat, label: nearestPlace(mapView.lng, mapView.lat).name }
  return fallback
}

function isFiniteIn(value: unknown, min: number, max: number): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max
}

function round(value: number, digits: number): number {
  const scale = 10 ** digits
  return Math.round(value * scale) / scale
}
