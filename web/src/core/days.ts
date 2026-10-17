import { chunkField, type EcmwfDay, type EcmwfDayField, type EcmwfSection, type Manifest, type ManifestChunk } from './contract'
import { formatWeekdayDay } from './locale'

// Dagen zijn kalenderdagen in Europe/Amsterdam, net als de ECMWF-dagwaarden (docs/ecmwf.md), ook als de browser
// in een andere zone staat.
const ZONE = 'Europe/Amsterdam'
const hour = 3_600_000
const zonedFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
})

export const DAY_LIST_LENGTH = 10
// Vensters uit docs/ecmwf.md, in minuten na lokale middernacht, beide grenzen inclusief.
const WIND_WINDOW: readonly [number, number] = [6 * 60, 21 * 60]
const CLOUD_WINDOW: readonly [number, number] = [8 * 60, 18 * 60]

export interface Sample {
  epoch: number
  value: number | null
}

/** HARMONIE-uurreeksen op de plek; regen in mm/u, op zijn eigen (gemengde) cadans. */
export interface HourlyDayInputs {
  temperature: Sample[]
  rain: Sample[]
  cloud: Sample[]
  windU: Sample[]
  windV: Sample[]
  gust: Sample[]
}

export interface DayValues {
  tmax: number | null
  tmin: number | null
  precipMm: number | null
  precipProb: number | null
  windMs: number | null
  /** Meteorologisch: waar de wind vandaan komt, in graden vanaf noord. */
  windFromDegrees: number | null
  gustMs: number | null
  cloud: number | null
}

export interface DayRow extends DayValues {
  date: string
  label: string
  source: 'harmonie' | 'ecmwf'
  pending: boolean
}

export type EcmwfPointValues = Partial<Record<EcmwfDayField, Array<number | null>>>

export const ECMWF_DAY_FIELDS: readonly EcmwfDayField[] = ['day_tmax_c', 'day_tmin_c', 'day_precip_mm', 'day_precip_prob', 'day_wind_ms', 'day_wind_dir', 'day_gust_ms', 'day_cloud']

const EMPTY: DayValues = { tmax: null, tmin: null, precipMm: null, precipProb: null, windMs: null, windFromDegrees: null, gustMs: null, cloud: null }

function zoned(epoch: number): { date: string; minutes: number } {
  const parts = Object.fromEntries(zonedFormat.formatToParts(epoch).map((part) => [part.type, part.value]))
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: Number(parts.hour) * 60 + Number(parts.minute) }
}

/** Lokale kalenderdatum, "2026-10-17". */
export function localDate(epoch: number): string {
  return zoned(epoch).date
}

export function addDays(date: string, days: number): string {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10)
}

function localMidnight(date: string): number {
  const [year, month, day] = date.split('-').map(Number) as [number, number, number]
  const utcMidnight = Date.UTC(year, month - 1, day)
  // De zone verschilt hooguit twee uur van UTC: de lokale klok bij UTC-middernacht geeft de afstand, en de
  // overgangen liggen 's nachts om 2/3 uur, dus de afstand op lokale middernacht is dezelfde.
  const local = zoned(utcMidnight)
  const wall = Date.UTC(Number(local.date.slice(0, 4)), Number(local.date.slice(5, 7)) - 1, Number(local.date.slice(8, 10))) + local.minutes * 60_000
  return utcMidnight - (wall - utcMidnight)
}

/** UTC-grenzen van een lokale dag: begin inclusief, einde exclusief (23 of 25 uur bij een klokwissel). */
export function localDayBounds(date: string): { start: number; end: number } {
  return { start: localMidnight(date), end: localMidnight(addDays(date, 1)) }
}

function inDay(epoch: number, bounds: { start: number; end: number }): boolean {
  return epoch >= bounds.start && epoch < bounds.end
}

function inWindow(epoch: number, window: readonly [number, number]): boolean {
  const { minutes } = zoned(epoch)
  return minutes >= window[0] && minutes <= window[1]
}

function known(samples: Sample[], bounds: { start: number; end: number }): Array<{ epoch: number; value: number }> {
  return samples.flatMap((sample) => sample.value != null && inDay(sample.epoch, bounds) ? [{ epoch: sample.epoch, value: sample.value }] : [])
}

/**
 * Regen over de dag: elk frame telt voor de tijd tot halverwege zijn buren, zodat radar en nowcast (5 min) en
 * HARMONIE (uur) elk hun eigen duur krijgen. Een frame zonder waarde is onbekend, niet droog.
 */
function rainTotal(samples: Sample[], bounds: { start: number; end: number }): number | null {
  const sorted = [...samples].sort((left, right) => left.epoch - right.epoch)
  let total = 0
  let counted = false
  for (let index = 0; index < sorted.length; index++) {
    const sample = sorted[index]!
    if (sample.value == null) continue
    const previous = sorted[index - 1]?.epoch
    const next = sorted[index + 1]?.epoch
    const before = previous === undefined ? (next === undefined ? hour : next - sample.epoch) : sample.epoch - previous
    const after = next === undefined ? before : next - sample.epoch
    const overlap = Math.min(bounds.end, sample.epoch + after / 2) - Math.max(bounds.start, sample.epoch - before / 2)
    if (overlap <= 0) continue
    total += sample.value * overlap / hour
    counted = true
  }
  return counted ? total : null
}

/** De dagdefinities van docs/ecmwf.md, toegepast op de uren die er zijn. */
export function aggregateHourlyDay(inputs: HourlyDayInputs, bounds: { start: number; end: number }): DayValues {
  const temperatures = known(inputs.temperature, bounds).map((sample) => sample.value)
  const gusts = known(inputs.gust, bounds).map((sample) => sample.value)
  const clouds = known(inputs.cloud, bounds).filter((sample) => inWindow(sample.epoch, CLOUD_WINDOW)).map((sample) => sample.value)
  const northward = new Map(known(inputs.windV, bounds).map((sample) => [sample.epoch, sample.value]))
  let windMs: number | null = null
  let windFromDegrees: number | null = null
  for (const eastward of known(inputs.windU, bounds)) {
    const v = northward.get(eastward.epoch)
    if (v === undefined || !inWindow(eastward.epoch, WIND_WINDOW)) continue
    const speed = Math.hypot(eastward.value, v)
    if (windMs !== null && speed <= windMs) continue
    windMs = speed
    windFromDegrees = (Math.atan2(-eastward.value, -v) * 180 / Math.PI + 360) % 360
  }
  return {
    tmax: temperatures.length ? Math.max(...temperatures) : null,
    tmin: temperatures.length ? Math.min(...temperatures) : null,
    precipMm: rainTotal(inputs.rain, bounds),
    precipProb: null,
    windMs,
    windFromDegrees,
    gustMs: gusts.length ? Math.max(...gusts) : null,
    cloud: clouds.length ? clouds.reduce((sum, value) => sum + value, 0) / clouds.length : null,
  }
}

/**
 * De `day_*`-chunks van de ECMWF-run in het manifest. Frame i hoort bij `ecmwf.days[i]`; een chunk van een andere
 * run of met een ander aantal frames is niet te koppelen en valt weg.
 */
export function ecmwfDayChunks(manifest: Pick<Manifest, 'chunks' | 'ecmwf'>): Map<EcmwfDayField, ManifestChunk> {
  const chunks = new Map<EcmwfDayField, ManifestChunk>()
  const section = manifest.ecmwf
  if (!section?.days.length) return chunks
  for (const chunk of manifest.chunks) {
    if (chunk.source !== 'ecmwf' || chunk.run !== section.run || chunk.times.length !== section.days.length) continue
    const field = chunkField(chunk)
    if ((ECMWF_DAY_FIELDS as readonly string[]).includes(field)) chunks.set(field as EcmwfDayField, chunk)
  }
  return chunks
}

function ecmwfValues(values: EcmwfPointValues, index: number): DayValues {
  const at = (field: EcmwfDayField) => values[field]?.[index] ?? null
  return {
    tmax: at('day_tmax_c'),
    tmin: at('day_tmin_c'),
    precipMm: at('day_precip_mm'),
    precipProb: at('day_precip_prob'),
    windMs: at('day_wind_ms'),
    windFromDegrees: at('day_wind_dir'),
    gustMs: at('day_gust_ms'),
    cloud: at('day_cloud'),
  }
}

/**
 * Vandaag en morgen uit HARMONIE (morgen met de ECMWF-regenkans), daarna ECMWF (MIP-36 B1), samen hooguit tien
 * dagen. `hourly` of `ecmwf.values` undefined = nog niet geladen. Dagen van een oude run die al voorbij zijn vallen weg.
 */
export function buildDayList(
  now: number,
  hourly: HourlyDayInputs | undefined,
  ecmwf: { section: EcmwfSection; values: EcmwfPointValues | undefined } | undefined,
): DayRow[] {
  const today = localDate(now)
  const tomorrow = addDays(today, 1)
  const ecmwfIndex = new Map((ecmwf?.section.days ?? []).map((day: EcmwfDay, index) => [day.date, index]))
  const harmonieRow = (date: string, label: string): DayRow => {
    const values = hourly ? aggregateHourlyDay(hourly, localDayBounds(date)) : EMPTY
    const probabilityIndex = date === tomorrow ? ecmwfIndex.get(date) : undefined
    const precipProb = probabilityIndex === undefined || !ecmwf?.values ? null : ecmwfValues(ecmwf.values, probabilityIndex).precipProb
    return { ...values, precipProb, date, label, source: 'harmonie', pending: !hourly || (probabilityIndex !== undefined && !ecmwf?.values) }
  }
  const rows = [harmonieRow(today, 'Vandaag'), harmonieRow(tomorrow, 'Morgen')]
  const later = [...ecmwfIndex].filter(([date]) => date > tomorrow).sort(([left], [right]) => left.localeCompare(right))
  for (const [date, index] of later.slice(0, DAY_LIST_LENGTH - rows.length)) {
    rows.push({
      ...(ecmwf?.values ? ecmwfValues(ecmwf.values, index) : EMPTY),
      date,
      label: formatWeekdayDay(localDayBounds(date).start + 12 * hour),
      source: 'ecmwf',
      pending: !ecmwf?.values,
    })
  }
  return rows
}
