export const TABLE_DAY_NIGHT_STORAGE_KEY = 'motregen-table-day-night'

type PreferenceStorage = Pick<Storage, 'getItem' | 'setItem'>

export function loadTableDayNight(storage: Pick<PreferenceStorage, 'getItem'> = localStorage): boolean {
  return storage.getItem(TABLE_DAY_NIGHT_STORAGE_KEY) !== 'off'
}

export function storeTableDayNight(enabled: boolean, storage: Pick<PreferenceStorage, 'setItem'> = localStorage): void {
  storage.setItem(TABLE_DAY_NIGHT_STORAGE_KEY, enabled ? 'on' : 'off')
}
