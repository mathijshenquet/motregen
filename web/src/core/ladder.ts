import { chunkField, type EcmwfStepField, type Manifest, type ManifestChunk } from './contract'
import { addDays, aggregateHourlyWindow, localDate, localTime, type DayValues, type EcmwfPointValues, type HourlyDayInputs } from './days'

const hour = 3_600_000

/**
 * De indeling van de urentabel (PO 2026-10-18): vandaag per uur tot middernacht, dan per dagdeel voor de volgende
 * dagen, daarna per kalenderdag. Precies twee overgangen, elk op een middernacht. Eén plek om op het oog te tunen.
 */
export const TABLE_LADDER = {
  /** Zoveel dagen na vandaag per dagdeel: nacht 00–06, ochtend, middag, avond. */
  partDays: 2,
  /** Daarna per kalenderdag, tot en met deze dag; 0 = vandaag. */
  lastDay: 9,
}

export type Ladder = typeof TABLE_LADDER
export type SlotGrain = 'part' | 'day'

export interface LadderSlot {
  start: number
  end: number
  grain: SlotGrain
  /** Lokale datum. */
  date: string
  label: string
  /** Klokvenster, "06–12" (titel van de rij; de rij zelf toont dag en dagdeel). */
  range: string
}

export interface SlotRow {
  slot: LadderSlot
  /** Eerste rij van een nieuwe lokale dag. */
  dayStart?: boolean
  source: 'harmonie' | 'ecmwf'
  /** undefined = nog niet geladen. */
  values?: DayValues
}

const PARTS = ['Nacht', 'Ochtend', 'Middag', 'Avond'] as const
const PART_HOURS = 6
const pad = (value: number) => String(value).padStart(2, '0')

/** Het eerste moment dat niet meer per uur is: de komende lokale middernacht. */
export function hourlyEnd(now: number): number {
  return localTime(addDays(localDate(now), 1), 0)
}

/** De grove rijen na het uurdeel: dagdelen voor `partDays` dagen, dan kalenderdagen tot en met `lastDay`. */
export function buildLadder(now: number, ladder: Ladder = TABLE_LADDER): LadderSlot[] {
  const today = localDate(now)
  const slots: LadderSlot[] = []
  for (let day = 1; day <= ladder.partDays; day++) {
    const date = addDays(today, day)
    PARTS.forEach((label, part) => {
      const clock = part * PART_HOURS
      slots.push({ start: localTime(date, clock), end: localTime(date, clock + PART_HOURS), grain: 'part', date, label, range: `${pad(clock)}–${pad(clock + PART_HOURS)}` })
    })
  }
  for (let date = addDays(today, ladder.partDays + 1); date <= addDays(today, ladder.lastDay); date = addDays(date, 1)) {
    slots.push({ start: localTime(date, 0), end: localTime(date, 24), grain: 'day', date, label: 'Dag', range: '00–24' })
  }
  return slots
}

export const ECMWF_STEP_FIELDS: readonly EcmwfStepField[] = ['step_tmax_c', 'step_tmin_c', 'step_precip_mm', 'step_gust_ms', 'step_temp_c', 'step_wind_u_ms', 'step_wind_v_ms', 'step_cloud']

/** De `step_*`-chunks van de aangekondigde run, met frame i bij `ecmwf.steps[i]`; andere vallen weg. */
export function ecmwfStepChunks(manifest: Pick<Manifest, 'chunks' | 'ecmwf'>): Map<EcmwfStepField, ManifestChunk> {
  const chunks = new Map<EcmwfStepField, ManifestChunk>()
  const section = manifest.ecmwf
  if (!section?.steps?.length) return chunks
  for (const chunk of manifest.chunks) {
    if (chunk.source !== 'ecmwf' || chunk.run !== section.run || chunk.times.length !== section.steps.length) continue
    const field = chunkField(chunk)
    if ((ECMWF_STEP_FIELDS as readonly string[]).includes(field)) chunks.set(field as EcmwfStepField, chunk)
  }
  return chunks
}

export type EcmwfStepValues = Partial<Record<EcmwfStepField, Array<number | null>>>
export interface Interval { start: number; end: number }

function overlap(left: Interval, right: Interval): number {
  return Math.min(left.end, right.end) - Math.max(left.start, right.start)
}

export function stepsCover(steps: Interval[], window: Interval): boolean {
  return steps.length > 0 && Math.min(...steps.map((step) => step.start)) <= window.start && Math.max(...steps.map((step) => step.end)) >= window.end
}

/**
 * Een venster uit de ECMWF-stappen (3 u tot +144 u, daarna 6 u, in UTC): stoot over elke stap die het venster raakt, regen naar overlap in tijd (gelijkmatig binnen de stap), wind en bewolking uit de momentopnamen op
 * de stapeinden in het venster; valt er geen in, dan de dichtstbijzijnde bij het midden.
 */
// Kwantisatiestap van de temperatuurvelden is 0,4 °C (docs/ecmwf.md).
const EXTREME_TOLERANCE_C = 0.5

export function aggregateSteps(steps: Interval[], values: EcmwfStepValues, window: Interval): DayValues {
  const at = (field: EcmwfStepField, index: number) => values[field]?.[index] ?? null
  const touching = steps.flatMap((step, index) => overlap(step, window) > 0 ? [index] : [])
  const known = (field: EcmwfStepField, indexes: number[]) => indexes.flatMap((index) => at(field, index) == null ? [] : [at(field, index)!])
  const ends = steps.flatMap((step, index) => step.end >= window.start && step.end <= window.end ? [index] : [])
  // De temperatuur op een stapeinde, en lineair ertussen: zo krijgen de vensterranden een eigen waarde.
  const momentAt = (epoch: number): number | null => {
    for (let index = 0; index < steps.length; index++) {
      const right = steps[index]!
      if (right.end < epoch) continue
      const rightValue = at('step_temp_c', index)
      if (right.end === epoch) return rightValue
      const leftIndex = steps.findIndex((step) => step.end === right.start)
      const leftValue = leftIndex < 0 ? null : at('step_temp_c', leftIndex)
      if (leftValue == null || rightValue == null) return null
      return leftValue + (rightValue - leftValue) * (epoch - right.start) / (right.end - right.start)
    }
    return null
  }
  // Wanneer viel het extreem van een stap? Gelijk aan de temperatuur aan begin of eind (binnen de kwantisatie):
  // daar; anders midden in de stap. Het telt als dat moment in het venster ligt; anders kwam een middagpiek uit
  // een half rakende stap in de nacht terecht, of viel bij 6-uursstappen de middag uit de dag.
  const extremeInWindow = (index: number, value: number): boolean => {
    const step = steps[index]!
    if (step.start >= window.start && step.end <= window.end) return true
    const near = (moment: number | null) => moment != null && Math.abs(moment - value) <= EXTREME_TOLERANCE_C
    const inside = (epoch: number) => epoch >= window.start && epoch <= window.end
    const atStart = near(momentAt(step.start))
    const atEnd = near(at('step_temp_c', index))
    if (atStart || atEnd) return (atStart && inside(step.start)) || (atEnd && inside(step.end))
    return inside((step.start + step.end) / 2)
  }
  const extremes = (field: 'step_tmax_c' | 'step_tmin_c') => touching.flatMap((index) => {
    const value = at(field, index)
    return value != null && extremeInWindow(index, value) ? [value] : []
  })
  const moments = [...known('step_temp_c', ends), ...[momentAt(window.start), momentAt(window.end)].flatMap((value) => value == null ? [] : [value])]
  const tmax = [...extremes('step_tmax_c'), ...moments]
  const tmin = [...extremes('step_tmin_c'), ...moments]
  const gust = known('step_gust_ms', touching)
  let precipMm: number | null = null
  for (const index of touching) {
    const amount = at('step_precip_mm', index)
    if (amount == null) continue
    const step = steps[index]!
    precipMm = (precipMm ?? 0) + amount * overlap(step, window) / (step.end - step.start)
  }
  const middle = (window.start + window.end) / 2
  const nearest = steps.reduce<number | undefined>((best, step, index) =>
    best === undefined || Math.abs(step.end - middle) < Math.abs(steps[best]!.end - middle) ? index : best, undefined)
  const snapshots = ends.length ? ends : nearest === undefined ? [] : [nearest]
  let windMs: number | null = null
  let windFromDegrees: number | null = null
  for (const index of snapshots) {
    const u = at('step_wind_u_ms', index)
    const v = at('step_wind_v_ms', index)
    if (u == null || v == null) continue
    const speed = Math.hypot(u, v)
    if (windMs !== null && speed <= windMs) continue
    windMs = speed
    windFromDegrees = (Math.atan2(-u, -v) * 180 / Math.PI + 360) % 360
  }
  const clouds = known('step_cloud', snapshots)
  return {
    tmax: tmax.length ? Math.max(...tmax) : null,
    tmin: tmin.length ? Math.min(...tmin) : null,
    precipMm,
    precipProb: null,
    windMs,
    windFromDegrees,
    gustMs: gust.length ? Math.max(...gust) : null,
    cloud: clouds.length ? clouds.reduce((sum, value) => sum + value, 0) / clouds.length : null,
  }
}

export interface LadderData {
  /** Tijden van de HARMONIE-uurframes (temperatuur): bepalen of een venster volledig HARMONIE is. */
  harmonieEpochs: number[]
  /** undefined = de puntreeksen zijn nog niet compleet. */
  hourly?: HourlyDayInputs
  steps?: { intervals: Interval[]; values?: EcmwfStepValues }
  /** ECMWF-dagvelden per lokale datum: regenkans op dag-rijen, en tot er stappen zijn de dag-rij zelf. */
  days?: { dates: string[]; values?: EcmwfPointValues }
}

function harmonieCovers(epochs: number[], window: Interval): boolean {
  return epochs.length > 0 && epochs[0]! <= window.start && epochs.at(-1)! >= window.end - hour
}

/**
 * Rij per ladderslot met de bron (MIP-36 B1): HARMONIE als het venster helemaal door HARMONIE-uren gedekt is,
 * anders de ECMWF-stappen. Zolang er geen stappen zijn, krijgen alleen dag-rijen de dagwaarden van die datum.
 * Een slot zonder bron valt weg.
 */
export function buildSlotRows(now: number, slots: LadderSlot[], data: LadderData, previousDate = localDate(now)): SlotRow[] {
  const rows: SlotRow[] = []
  const dayIndex = new Map((data.days?.dates ?? []).map((date, index) => [date, index]))
  for (const slot of slots) {
    const dayAt = dayIndex.get(slot.date)
    const dayValue = (field: keyof EcmwfPointValues) => dayAt === undefined ? null : data.days?.values?.[field]?.[dayAt] ?? null
    const precipProb = slot.grain === 'day' ? dayValue('day_precip_prob') : null
    let row: SlotRow | undefined
    if (harmonieCovers(data.harmonieEpochs, slot)) {
      row = { slot, source: 'harmonie', values: data.hourly && { ...aggregateHourlyWindow(data.hourly, slot), precipProb } }
    } else if (data.steps && stepsCover(data.steps.intervals, slot)) {
      row = { slot, source: 'ecmwf', values: data.steps.values && { ...aggregateSteps(data.steps.intervals, data.steps.values, slot), precipProb } }
    } else if (!data.steps && slot.grain === 'day' && dayAt !== undefined) {
      row = {
        slot,
        source: 'ecmwf',
        values: data.days?.values && {
          tmax: dayValue('day_tmax_c'), tmin: dayValue('day_tmin_c'), precipMm: dayValue('day_precip_mm'), precipProb,
          windMs: dayValue('day_wind_ms'), windFromDegrees: dayValue('day_wind_dir'), gustMs: dayValue('day_gust_ms'), cloud: dayValue('day_cloud'),
        },
      }
    }
    if (!row) continue
    if (slot.date !== previousDate) row.dayStart = true
    previousDate = slot.date
    rows.push(row)
  }
  return rows
}
