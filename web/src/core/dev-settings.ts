// Gebruikersdata en -voorkeuren; al het andere onder `motregen-` is tuning of debug en mag
// door "Reset alle instellingen" weg (ook keys van oude versies, zoals wind-tuning v1/v2).
export const PRESERVED_STORAGE_KEYS: readonly string[] = [
  'motregen-theme',
  'motregen-saved-places',
  'motregen-last-saved-place',
  'motregen-map-view',
]

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
