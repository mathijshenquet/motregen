import type { SunEvent } from './solar.js'

const HOUR = 3_600_000
/** Zo ver vóór de eerste uurrij en voorbij de laatste dagdeelrij wordt nog naar een moment gezocht. */
const SEARCH_MS = 36 * HOUR

export interface TableSun {
  /** Zonrij ná de uurrij die op dit (hele) uur begint. */
  hourly: Map<number, SunEvent>
  /** Zonrijen bovenaan, vóór de eerste uurrij, op volgorde: het moment viel net vóór het begin van de tabel. */
  top: SunEvent[]
  /** Zonrij als scheiding vóór de grove rij (dagdeel) die op deze start begint en het moment bevat. */
  spans: Map<number, SunEvent>
}

/**
 * Altijd precies één zonsopgang- en één zonsondergangrij in de tabel (PO-afspraak, U107 vervolg): per soort het eerste
 * moment binnen de uurrijen; valt er geen in, dan het moment dat het dichtst bij het uurblok ligt — net vóór de eerste
 * rij (dan bovenaan) of erna in de grove rijen (dan als scheiding vóór het dagdeel waarin het valt). Zonder zulk moment
 * (poolnacht) geen rij. `find(start, end)` levert de momenten in [start, end), op volgorde.
 */
export function tableSunEvents(hours: readonly number[], spans: ReadonlyArray<{ start: number; end: number }>, find: (start: number, end: number) => SunEvent[]): TableSun {
  const result: TableSun = { hourly: new Map(), top: [], spans: new Map() }
  const first = hours[0]
  if (first === undefined) return result
  const hourlyEnd = hours.at(-1)! + HOUR
  const spansEnd = Math.max(hourlyEnd, ...spans.map((span) => span.end))
  const events = find(first - SEARCH_MS, spansEnd)
  for (const kind of ['rise', 'set'] as const) {
    const ofKind = events.filter((event) => event.kind === kind)
    const inside = ofKind.find((event) => event.epoch >= first && event.epoch < hourlyEnd)
    if (inside) {
      result.hourly.set(Math.floor(inside.epoch / HOUR) * HOUR, inside)
      continue
    }
    const before = ofKind.filter((event) => event.epoch < first).at(-1)
    const after = ofKind.find((event) => event.epoch >= hourlyEnd && spans.some((span) => event.epoch >= span.start && event.epoch < span.end))
    const beforeGap = before ? first - before.epoch : Infinity
    const afterGap = after ? after.epoch - hourlyEnd : Infinity
    if (beforeGap === Infinity && afterGap === Infinity) continue
    if (beforeGap <= afterGap) {
      result.top.push(before!)
      result.top.sort((left, right) => left.epoch - right.epoch)
    } else {
      const span = spans.find((candidate) => after!.epoch >= candidate.start && after!.epoch < candidate.end)!
      result.spans.set(span.start, after!)
    }
  }
  return result
}
