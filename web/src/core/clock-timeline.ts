import type { Source, TimelineFrame } from './contract'
import { sourceZone, timelineCursorAtEpoch, type TimelineZone } from './time-model'

/** Vaste jog-schaal van de klokpil (U56): één pixel slepen is twee minuten kaarttijd. */
export const CLOCK_JOG_MS_PER_PX = 120_000

// Tijdelijke ?dev-keuze tot de PO de schaal kiest (docs/dev-opties.md, groep Klok).
export const CLOCK_JOG_SCALES = ['vast', 'scrubber'] as const
export type ClockJogScale = typeof CLOCK_JOG_SCALES[number]
export const CLOCK_JOG_STORAGE_KEY = 'motregen-clock-jog'

export function parseClockJogScale(value: string | null): ClockJogScale {
  return CLOCK_JOG_SCALES.find((scale) => scale === value) ?? 'vast'
}

/**
 * Cursor na `deltaPx` slepen vanaf `startEpoch`: naar rechts is later, zoals de duim van een
 * schuifregelaar (de scrubber zelf sleept de tijdlijn en loopt dus andersom).
 */
export function jogCursor(timeline: TimelineFrame[], startEpoch: number, deltaPx: number, msPerPx: number = CLOCK_JOG_MS_PER_PX): number {
  if (!timeline.length) return 0
  const firstEpoch = timeline[0]!.epoch
  const lastEpoch = timeline.at(-1)!.epoch
  const epoch = Math.max(firstEpoch, Math.min(lastEpoch, startEpoch + deltaPx * msPerPx))
  return timelineCursorAtEpoch(timeline, epoch)
}

const KEY_STEPS: Record<string, number> = { ArrowLeft: -1, ArrowDown: -1, ArrowRight: 1, ArrowUp: 1, PageDown: -6, PageUp: 6 }

/** Dezelfde toetsstappen als de scrubber; undefined voor een toets die de tijd niet verzet. */
export function clockKeyCursor(key: string, cursor: number, lastCursor: number): number | undefined {
  if (key === 'Home') return 0
  if (key === 'End') return lastCursor
  const step = KEY_STEPS[key]
  return step === undefined ? undefined : Math.max(0, Math.min(lastCursor, cursor + step))
}

export type StripZoneKey = 'radar' | 'nowcast' | 'harmonie'

// De blend (seamless) is de nowcast die in het model overloopt en hoort in de strook bij de
// nowcast; de eerste bron in elke rij levert de versheid van de zone.
export const STRIP_ZONES: ReadonlyArray<{ key: StripZoneKey; label: string; sources: readonly Source[] }> = [
  { key: 'radar', label: 'Radar', sources: ['rtcor'] },
  { key: 'nowcast', label: 'Nowcast', sources: ['nowcast', 'seamless'] },
  { key: 'harmonie', label: 'HARMONIE', sources: ['harmonie'] },
]

// Lineair zou HARMONIE (60 u) de radar en de nowcast (elk ~2 u) tot een streepje drukken.
const STRIP_MIN_SHARE = 0.25

export interface SourceStripZone {
  key: StripZoneKey
  label: string
  kind: TimelineZone['kind']
  startEpoch: number
  endEpoch: number
  /** Positie in de strook, in procenten. */
  start: number
  end: number
}

/**
 * De tijdlijn als drie aaneengesloten bronzones. Binnen een zone loopt de tijd lineair; de
 * breedtes zijn naar duur verdeeld met een ondergrens per zone.
 */
export function sourceStrip(timeline: TimelineFrame[]): SourceStripZone[] {
  if (timeline.length < 2) return []
  const lastIndexOfZone = new Map<StripZoneKey, number>()
  timeline.forEach((frame, index) => {
    const zone = STRIP_ZONES.find((candidate) => candidate.sources.includes(frame.source))
    if (zone) lastIndexOfZone.set(zone.key, index)
  })
  const finalEpoch = timeline.at(-1)!.epoch
  const spans: Array<Omit<SourceStripZone, 'start' | 'end'>> = []
  let startEpoch = timeline[0]!.epoch
  for (const zone of STRIP_ZONES) {
    const lastIndex = lastIndexOfZone.get(zone.key)
    if (lastIndex === undefined) continue
    const nextFrame = timeline[lastIndex + 1]
    const endEpoch = nextFrame ? (timeline[lastIndex]!.epoch + nextFrame.epoch) / 2 : finalEpoch
    if (endEpoch <= startEpoch) continue
    spans.push({ key: zone.key, label: zone.label, kind: sourceZone(zone.sources[0]!).kind, startEpoch, endEpoch })
    startEpoch = endEpoch
  }
  const totalDuration = finalEpoch - timeline[0]!.epoch
  const weights = spans.map((span) => Math.max(span.endEpoch - span.startEpoch, STRIP_MIN_SHARE * totalDuration))
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0)
  let start = 0
  return spans.map((span, index) => {
    const end = index === spans.length - 1 ? 100 : start + weights[index]! / totalWeight * 100
    const zone = { ...span, start, end }
    start = end
    return zone
  })
}

/** Positie (0–100) van een tijdstip in de strook; buiten de tijdlijn op de rand. */
export function stripPositionAtEpoch(zones: SourceStripZone[], epoch: number): number {
  if (!zones.length) return 0
  if (epoch <= zones[0]!.startEpoch) return 0
  const zone = zones.find((candidate) => epoch <= candidate.endEpoch)
  if (!zone) return 100
  return zone.start + (zone.end - zone.start) * (epoch - zone.startEpoch) / (zone.endEpoch - zone.startEpoch)
}

export function stripEpochAtPosition(zones: SourceStripZone[], position: number): number {
  if (!zones.length) return 0
  const bounded = Math.max(0, Math.min(100, position))
  const zone = zones.find((candidate) => bounded <= candidate.end) ?? zones.at(-1)!
  return zone.startEpoch + (zone.endEpoch - zone.startEpoch) * (bounded - zone.start) / (zone.end - zone.start)
}
