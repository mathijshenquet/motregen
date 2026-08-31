export interface SavedPlace {
  id: string
  name: string
  sourceLabel: string
  lng: number
  lat: number
}

const storageKey = 'motregen-saved-places'

export function loadSavedPlaces(storage: Pick<Storage, 'getItem'> = localStorage): SavedPlace[] {
  try {
    const parsed = JSON.parse(storage.getItem(storageKey) ?? '[]') as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.flatMap((value) => isSavedPlace(value) ? [value] : []).slice(0, 20)
  } catch {
    return []
  }
}

export function storeSavedPlaces(places: SavedPlace[], storage: Pick<Storage, 'setItem'> = localStorage): void {
  storage.setItem(storageKey, JSON.stringify(places.slice(0, 20)))
}

export function savedPlaceId(lng: number, lat: number): string {
  return `${lng.toFixed(5)},${lat.toFixed(5)}`
}

export function samePlace(left: Pick<SavedPlace, 'lng' | 'lat'>, right: { lng: number; lat: number }): boolean {
  return Math.abs(left.lng - right.lng) < 0.00001 && Math.abs(left.lat - right.lat) < 0.00001
}

function isSavedPlace(value: unknown): value is SavedPlace {
  if (!value || typeof value !== 'object') return false
  const place = value as Partial<SavedPlace>
  return typeof place.id === 'string'
    && typeof place.name === 'string' && place.name.trim().length > 0 && place.name.length <= 80
    && typeof place.sourceLabel === 'string'
    && typeof place.lng === 'number' && Number.isFinite(place.lng) && place.lng >= -180 && place.lng <= 180
    && typeof place.lat === 'number' && Number.isFinite(place.lat) && place.lat >= -90 && place.lat <= 90
}
