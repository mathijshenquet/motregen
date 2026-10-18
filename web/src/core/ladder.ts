import { chunkField, type EcmwfStepField, type Manifest, type ManifestChunk } from './contract'
import { addDays, aggregateHourlyWindow, localDate, localMinutes, localTime, type DayValues, type EcmwfPointValues, type HourlyDayInputs } from './days'
import { sunEvents, type SunEvent } from './solar'

const hour = 3_600_000

/**
 * De indeling van de urentabel (PO 2026-10-18): per uur tot en met de eerstvolgende zonsopkomst én zonsondergang,
 * dan per dagdeel tot en met morgen, daarna per kalenderdag. Eén plek om op het oog te tunen.
 */
export const TABLE_LADDER = {
  /** Per dagdeel (nacht 00–06, ochtend, middag, avond) tot en met deze dag; 1 = morgen. */
  partsThroughDay: 1,
  /** Daarna per kalenderdag, tot en met deze dag; 0 = vandaag. */
  lastDay: 9,
}

export type Ladder = typeof TABLE_LADDER
export type SlotGrain = 'part' | 'day'

export interface LadderSlot {
  start: number
  end: number
  grain: SlotGrain
  /** Lokale datum van het begin. */
  date: string
  label: string
  /** Klokvenster, "06–12" (titel van de rij; de rij zelf toont de dag). */
  range: string
}

export interface SlotRow {
  slot: LadderSlot
  /** Eerste rij van een nieuwe lokale dag: de tabel trekt er een duidelijkere lijn boven. */
  dayStart?: boolean
  source: 'harmonie' | 'ecmwf'
  /** undefined = nog niet geladen. */
  values?: DayValues
}

export interface LadderLocation { lng: number; lat: number }

const PARTS = ['Nacht', 'Ochtend', 'Middag', 'Avond'] as const
const PART_HOURS = 6
const pad = (value: number) => String(value).padStart(2, '0')

/**
 * De zonsopkomst en zonsondergang die de urentabel toont (PO 2026-10-18): de eerste van elk vanaf de bovenste getoonde
 * uurrij, de geschiedenis meegeteld. Zo staan er precies één "Zon op" en één "Zon onder" in het uurdeel.
 */
export function tableSunEvents(firstRow: number, location: LadderLocation): SunEvent[] {
  const events = sunEvents(firstRow, firstRow + 48 * hour, location.lng, location.lat)
  return (['rise', 'set'] as const).flatMap((kind) => events.find((event) => event.kind === kind) ?? [])
}

/** Het eerste moment dat niet meer per uur is: het uur na de laatste van de twee zonmomenten uit `tableSunEvents`. */
export function hourlyEnd(now: number, firstRow: number, location: LadderLocation): number {
  const nowHour = Math.floor(now / hour) * hour
  const events = tableSunEvents(firstRow, location)
  // Zonder beide binnen twee etmalen (poolzomer of -nacht) een etmaal per uur.
  if (events.length < 2) return nowHour + 24 * hour
  return Math.max(nowHour + hour, Math.floor(Math.max(...events.map((event) => event.epoch)) / hour) * hour + hour)
}

/**
 * De grove rijen na het uurdeel: dagdelen tot en met de nacht na `partsThroughDay`, dan dagen tot en met `lastDay`.
 * Een nacht 00–06 volgt zijn avond en hoort bij die dag, zoals "de nacht van maandag op dinsdag". Een dagrij is
 * daarom 06–06: de dag met de nacht erna. Zo zijn er precies twee overgangen (PO 2026-10-18).
 */
export function buildLadder(now: number, firstRow: number, location: LadderLocation, ladder: Ladder = TABLE_LADDER): LadderSlot[] {
  const today = localDate(now)
  const slots: LadderSlot[] = []
  const partsEnd = localTime(addDays(today, ladder.partsThroughDay + 1), PART_HOURS)
  let cursor = hourlyEnd(now, firstRow, location)
  while (cursor < partsEnd) {
    const calendarDate = localDate(cursor)
    const clock = Math.round(localMinutes(cursor) / 60)
    const part = Math.floor(clock / PART_HOURS)
    const partEnd = (part + 1) * PART_HOURS
    const date = part === 0 ? addDays(calendarDate, -1) : calendarDate
    // Het eerste dagdeel begint waar het uurdeel ophoudt en kan dus korter zijn ("Avond 19–24").
    slots.push({ start: cursor, end: localTime(calendarDate, partEnd), grain: 'part', date, label: PARTS[part]!, range: `${pad(clock)}–${pad(partEnd)}` })
    cursor = localTime(calendarDate, partEnd)
  }
  for (let date = localDate(cursor); date <= addDays(today, ladder.lastDay); date = addDays(date, 1)) {
    slots.push({ start: localTime(date, PART_HOURS), end: localTime(date, 24 + PART_HOURS), grain: 'day', date, label: 'Dag', range: '06–06' })
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
