/**
 * Hoeveel decodewerk dit apparaat vooruit mag doen (U49). Een telefoon pakt hele roosters uit
 * om één pixel van de gekozen locatie te lezen; in de PO-opname van 2026-10-07 kostte dat
 * 893 decodes en 23,6 s in de eerste halve minuut, waar een laptop 1,9 s over deed.
 */
export interface DecodeBudget {
  workers: number
  /**
   * `eager`: puntreeksen laden vooruit (hele tabel, hele tijdlijn bij de eerste aanraking).
   * `in-view`: alleen wat de scrubber en de tabel op dit moment tonen.
   */
  pointSeries: 'eager' | 'in-view'
}

export interface DeviceHints {
  cores?: number
  memoryGb?: number
  /** `(pointer: coarse)`: het primaire aanwijsmiddel is een vinger. */
  coarsePointer: boolean
}

const CONSTRAINED_CORES = 4
const CONSTRAINED_MEMORY_GB = 4

export function decodeBudget(hints: DeviceHints): DecodeBudget {
  const cores = hints.cores ?? 2
  // Kernen en geheugen alleen missen de telefoons waar het om gaat: een recente Android meldt acht
  // kernen (waarvan vier zuinige) en Firefox kent geen deviceMemory. Een vinger als primair
  // aanwijsmiddel is het signaal dat wel op elke telefoon en tablet klopt, zonder UA-sniffing.
  const constrained = cores <= CONSTRAINED_CORES || (hints.memoryGb ?? Infinity) <= CONSTRAINED_MEMORY_GB || hints.coarsePointer
  if (constrained) return { workers: cores <= 2 ? 1 : 2, pointSeries: 'in-view' }
  return { workers: Math.min(4, cores - 1), pointSeries: 'eager' }
}

export function browserDeviceHints(): DeviceHints {
  const device = globalThis.navigator as (Navigator & { deviceMemory?: number }) | undefined
  return {
    cores: device?.hardwareConcurrency,
    memoryGb: device?.deviceMemory,
    coarsePointer: globalThis.matchMedia?.('(pointer: coarse)').matches ?? false,
  }
}
