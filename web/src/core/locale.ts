// Eén formatter per vorm in plaats van een nieuwe Intl-formatter per aanroep: op Android kostte
// toLocaleTimeString/toLocaleDateString in klok en scrubber ~2,5 s per 30 s (PO-opname 2026-10-07).
const LOCALE = 'nl-NL'

const timeFormat = new Intl.DateTimeFormat(LOCALE, { hour: '2-digit', minute: '2-digit' })
const weekdayShortFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'short' })
const weekdayLongFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'long' })
const dayShortFormat = new Intl.DateTimeFormat(LOCALE, { weekday: 'short', day: 'numeric', month: 'short' })
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

/** Getal in nl-NL met hooguit `maximumFractionDigits` decimalen ("1,5"). */
export function formatNumber(value: number, maximumFractionDigits: number): string {
  let format = numberFormats.get(maximumFractionDigits)
  if (!format) {
    format = new Intl.NumberFormat(LOCALE, { maximumFractionDigits })
    numberFormats.set(maximumFractionDigits, format)
  }
  return format.format(value)
}
