import { describe, expect, it } from 'vitest'
import { clearTuningStorage } from './dev-settings'
import { loadLastSavedPlaceId, loadMapView, storeLastSavedPlaceId, storeMapView } from './location-memory'
import { loadSavedPlaces, storeSavedPlaces } from './saved-places'
import { DEFAULT_WIND_TUNING, loadWindTuning, storeWindTuning } from './wind-layer'

function memoryStorage(values = new Map<string, string>()) {
  return {
    values,
    get length() { return values.size },
    key: (index: number) => [...values.keys()][index] ?? null,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => void values.set(key, value),
    removeItem: (key: string) => void values.delete(key),
    clear: () => values.clear(),
  }
}

describe('reset alle instellingen', () => {
  it('wist alle motregen-tuningkeys en laat favorieten, locatie, kaartview en thema staan', () => {
    const storage = memoryStorage()
    const place = { id: 'utrecht', name: 'Utrecht', sourceLabel: 'Utrecht, Utrecht', lng: 5.12, lat: 52.09 }
    storeSavedPlaces([place], storage)
    storeLastSavedPlaceId('utrecht', storage)
    storeMapView({ lng: 5.1, lat: 52.1, zoom: 9 }, storage)
    storage.setItem('motregen-theme', 'dark')
    storeWindTuning({ ...DEFAULT_WIND_TUNING, intensity: 0.4 }, storage)
    storage.setItem('motregen-wind-tuning-v3', '{"maxFps":30}')
    storage.setItem('motregen-wind-tuning-v2', '{"intensity":1.9}')
    storage.setItem('motregen-wind-tuning', '{"intensity":0.8}')
    storage.setItem('motregen-splash-slowdown', '4')
    storage.setItem('ander-domein', 'blijft')

    const removed = clearTuningStorage(storage)

    expect(removed.sort()).toEqual(['motregen-splash-slowdown', 'motregen-wind-tuning', 'motregen-wind-tuning-v2', 'motregen-wind-tuning-v3', 'motregen-wind-tuning-v4'])
    expect([...storage.values.keys()].filter((key) => key.startsWith('motregen-')).sort())
      .toEqual(['motregen-last-saved-place', 'motregen-map-view', 'motregen-saved-places', 'motregen-theme'])
    expect(loadSavedPlaces(storage)).toEqual([place])
    expect(loadLastSavedPlaceId(storage)).toBe('utrecht')
    expect(loadMapView(storage)).toEqual({ lng: 5.1, lat: 52.1, zoom: 9 })
    expect(storage.getItem('motregen-theme')).toBe('dark')
    expect(storage.getItem('ander-domein')).toBe('blijft')
    expect(loadWindTuning(storage)).toEqual(DEFAULT_WIND_TUNING)
  })
})
