// Gebruikersdata en -voorkeuren; al het andere onder `motregen-` is tuning of debug en mag
// door "Reset alle instellingen" weg (ook keys van oude versies, zoals wind-tuning v1/v2).
export const PRESERVED_STORAGE_KEYS: readonly string[] = [
  'motregen-theme',
  'motregen-saved-places',
  'motregen-last-saved-place',
  'motregen-map-view',
  'motregen-sky-diary',
]

export const SKY_DIARY_STORAGE_KEY = 'motregen-sky-diary'
export const SKY_DIARY_CLASSES = ['strakblauw', 'mooie wolkenlucht', 'melkachtig', 'grijs', 'Mordor'] as const
export type SkyDiaryClass = typeof SKY_DIARY_CLASSES[number]

export interface SkyDiaryEntry {
  tijd: string
  klasse: SkyDiaryClass
  locatie: { lat: number; lng: number }
}

type ResettableStorage = Pick<Storage, 'key' | 'removeItem' | 'length'>

/** Wist alle tuning-/debugkeys en geeft terug welke weg zijn. */
export function clearTuningStorage(storage: ResettableStorage = localStorage): string[] {
  const removed: string[] = []
  for (let index = 0; index < storage.length; index++) {
    const key = storage.key(index)
    if (key?.startsWith('motregen-') && !PRESERVED_STORAGE_KEYS.includes(key)) removed.push(key)
  }
  for (const key of removed) storage.removeItem(key)
  return removed
}

type DiaryStorage = Pick<Storage, 'getItem' | 'setItem'>

export function loadSkyDiary(storage: DiaryStorage = localStorage): SkyDiaryEntry[] {
  try {
    const value: unknown = JSON.parse(storage.getItem(SKY_DIARY_STORAGE_KEY) ?? '[]')
    return Array.isArray(value) ? value.filter(isSkyDiaryEntry) : []
  } catch {
    return []
  }
}

export function appendSkyDiaryEntry(
  klasse: SkyDiaryClass,
  location: { lat: number; lng: number },
  storage: DiaryStorage = localStorage,
  now = new Date(),
): SkyDiaryEntry {
  const entry: SkyDiaryEntry = {
    tijd: now.toISOString(),
    klasse,
    locatie: { lat: roundCoordinate(location.lat), lng: roundCoordinate(location.lng) },
  }
  storage.setItem(SKY_DIARY_STORAGE_KEY, JSON.stringify([...loadSkyDiary(storage), entry]))
  return entry
}

export function skyDiaryJson(storage: DiaryStorage = localStorage): string {
  return JSON.stringify(loadSkyDiary(storage), null, 2)
}

function roundCoordinate(value: number): number {
  const rounded = Math.round(value * 10) / 10
  return Object.is(rounded, -0) ? 0 : rounded
}

function isSkyDiaryEntry(value: unknown): value is SkyDiaryEntry {
  if (!value || typeof value !== 'object') return false
  const entry = value as Partial<SkyDiaryEntry>
  return typeof entry.tijd === 'string' && SKY_DIARY_CLASSES.includes(entry.klasse as SkyDiaryClass) &&
    typeof entry.locatie?.lat === 'number' && Number.isFinite(entry.locatie.lat) &&
    typeof entry.locatie.lng === 'number' && Number.isFinite(entry.locatie.lng)
}
