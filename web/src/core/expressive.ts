export const EXPRESSIVE_STORAGE_KEY = 'motregen-expressive'
// U42 bewaarde alleen de tabelkleuring; wie die uit had staan, begint met Expressief uit.
const LEGACY_TABLE_DAY_NIGHT_STORAGE_KEY = 'motregen-table-day-night'

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export function loadExpressive(storage: PreferenceStorage = localStorage): boolean {
  const legacy = storage.getItem(LEGACY_TABLE_DAY_NIGHT_STORAGE_KEY)
  if (legacy !== null) {
    if (storage.getItem(EXPRESSIVE_STORAGE_KEY) === null && legacy === 'off') storage.setItem(EXPRESSIVE_STORAGE_KEY, 'off')
    storage.removeItem(LEGACY_TABLE_DAY_NIGHT_STORAGE_KEY)
  }
  return storage.getItem(EXPRESSIVE_STORAGE_KEY) !== 'off'
}

export function storeExpressive(enabled: boolean, storage: Pick<PreferenceStorage, 'setItem'> = localStorage): void {
  storage.setItem(EXPRESSIVE_STORAGE_KEY, enabled ? 'on' : 'off')
}
