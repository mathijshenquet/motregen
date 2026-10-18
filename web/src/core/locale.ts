// Eén formatter per vorm in plaats van een nieuwe Intl-formatter per aanroep: op Android kostte
// toLocaleTimeString/toLocaleDateString in klok en scrubber ~2,5 s per 30 s (PO-opname 2026-10-07).
const LOCALE = 'nl-NL'

const timeFormat = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' })
const weekdayShortFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' })
const weekdayLongFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'long' })
const dayShortFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' })
// Dagenlijst: kalenderdagen in Nederlandse tijd, ook als de browser elders staat (MIP-36).
const weekdayDayFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', timeZone: 'Europe/Amsterdam' })
const dayMonthFormat = new Intl.DateTimeFormat(LOCALE, { day: 'numeric', month: 'short', timeZone: 'Europe/Amsterdam' })
const weekdayLongDutchFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'long', timeZone: 'Europe/Amsterdam' })
const numberFormats = new Map<number, Intl.NumberFormat>()

/** "14:05" */
export function formatTime(epoch: number): string {
  return timeFormat.format(epoch)
}

/** "wo" */
export function formatWeekdayShort(epoch: number): string {
  return weekdayShortFormat.format(epoch)
}

/** "woensdag" */
export function formatWeekdayLong(epoch: number): string {
  return weekdayLongFormat.format(epoch)
}

/** "wo 7 okt" */
export function formatDayShort(epoch: number): string {
  return dayShortFormat.format(epoch)
}

/** "22 okt" (Nederlandse tijd) */
export function formatDayMonth(epoch: number): string {
  return dayMonthFormat.format(epoch)
}

/** "Woensdag" (Nederlandse tijd, met hoofdletter): de naam van een dagrij. */
export function formatWeekdayTitle(epoch: number): string {
  const name = weekdayLongDutchFormat.format(epoch)
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** "di 20" */
export function formatWeekdayDay(epoch: number): string {
  return weekdayDayFormat.format(epoch)
}

/** Getal in nl-NL met hooguit `maximumFractionDigits` decimalen ("1,5"). */
export function formatNumber(value: number, maximumFractionDigits: number): string {
  let format = numberFormats.get(maximumFractionDigits)
  if (!format) {
    format = new Intl.NumberFormat(LOCALE, { maximumFractionDigits })
    numberFormats.set(maximumFractionDigits, format)
  }
  return format.format(value)
}
