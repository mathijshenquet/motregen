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
  /** Aantal grote overdrachten dat de fetch-planner tegelijk laat lopen (MIP-20); kleine requests tellen niet mee. */
  requests: number
  /**
   * Grootste Range in bytes. Een krap apparaat haalt een reeks frames in stukken op, het dichtst
   * bij de cursor eerst; een ruim apparaat houdt één omvattende Range per chunk (bulk-prefetch).
   */
  rangeBytes: number
}

export interface DeviceHints {
  cores?: number
  memoryGb?: number
  /** `(pointer: coarse)`: het primaire aanwijsmiddel is een vinger. */
  coarsePointer: boolean
}

const CONSTRAINED_CORES = 4
const CONSTRAINED_MEMORY_GB = 4
// Ongeveer een kwart seconde op 4G (9 Mbps): zo lang houdt één stuk de lijn hooguit bezet.
const CONSTRAINED_RANGE_BYTES = 256_000

export function decodeBudget(hints: DeviceHints): DecodeBudget {
  const cores = hints.cores ?? 2
  // Kernen en geheugen alleen missen de telefoons waar het om gaat: een recente Android meldt acht
  // kernen (waarvan vier zuinige) en Firefox kent geen deviceMemory. Een vinger als primair
  // aanwijsmiddel is het signaal dat wel op elke telefoon en tablet klopt, zonder UA-sniffing.
  const constrained = cores <= CONSTRAINED_CORES || (hints.memoryGb ?? Infinity) <= CONSTRAINED_MEMORY_GB || hints.coarsePointer
  if (constrained) return { workers: cores <= 2 ? 1 : 2, pointSeries: 'in-view', requests: cores <= 2 ? 2 : 3, rangeBytes: CONSTRAINED_RANGE_BYTES }
  return { workers: Math.min(4, cores - 1), pointSeries: 'eager', requests: 6, rangeBytes: Number.POSITIVE_INFINITY }
}

export function browserDeviceHints(): DeviceHints {
  const device = globalThis.navigator as (Navigator & { deviceMemory?: number }) | undefined
  return {
    cores: device?.hardwareConcurrency,
    memoryGb: device?.deviceMemory,
    coarsePointer: globalThis.matchMedia?.('(pointer: coarse)').matches ?? false,
  }
}
