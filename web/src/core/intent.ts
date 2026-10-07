import type { EpochWindow } from './time-model'

/**
 * Wat de gebruiker op dit moment wil zien (MIP-20). Eén object stuurt zowel de volgorde van de
 * requests (fetch-planner.ts) als die van de decodes (decode-queue.ts): een nieuwe intent
 * herordent alles wat nog wacht.
 */
export interface Intent {
  cursorEpoch: number
  /** Het tijdvak dat de scrubber toont. Wat daarbuiten valt is idle-werk. */
  window: EpochWindow
  /** Afspelen en de richting ervan: 1 vooruit, -1 terug, 0 = er wordt niet afgespeeld. */
  playback: -1 | 0 | 1
  /** Scrubsnelheid in tijdlijn-ms per ms; voorspelt waar de cursor uitkomt. 0 = er wordt niet gescrubd. */
  scrubVelocity: number
  /** Velden die de modus (en de tabel, als die in beeld is) toont. Andere velden zijn idle-werk. */
  fields: ReadonlySet<string>
}

export interface FrameTiming {
  epoch: number
  /** Afstand tot het naburige frame van hetzelfde veld: zo ver telt dit frame mee in de interpolatie. */
  stepMs: number
  field: string
}

/** Frames in de bewegingsrichting tellen iets dichterbij: die zijn het eerst nodig. */
const AHEAD_WEIGHT = 0.8
/** Zo ver vooruit mikt de planner tijdens scrubben: ongeveer één request plus decode op 4G. */
const SCRUB_LOOKAHEAD_MS = 400
/** De stap van de regentijdlijn. Binnen één stap geldt afstand als gelijk en wisselen de velden elkaar af. */
const DISTANCE_STEP_MS = 5 * 60_000
const FIRST_FIELD = 'rain_rate'

export function intentDirection(intent: Intent): -1 | 0 | 1 {
  if (intent.playback !== 0) return intent.playback
  return Math.sign(intent.scrubVelocity) as -1 | 0 | 1
}

/** Het tijdstip waar de planner op mikt: de cursor, tijdens scrubben een stukje verder in de scrubrichting. */
export function intentTarget(intent: Intent): number {
  const predicted = intent.cursorEpoch + intent.scrubVelocity * SCRUB_LOOKAHEAD_MS
  return Math.min(intent.window.end, Math.max(intent.window.start, predicted))
}

/**
 * Afstand in ms van het doel tot het interval waarin dit frame getekend wordt. De twee frames
 * waartussen de cursor staat liggen dus op afstand 0, ook van een uurveld: zonder die aftrek zou
 * de kaartlaag van een uurveld achter een halfuur aan regenframes wachten.
 */
export function intentDistance(timing: FrameTiming, intent: Intent): number {
  const offset = timing.epoch - intentTarget(intent)
  if (!Number.isFinite(offset)) return Number.POSITIVE_INFINITY
  const beyondOwnInterval = Math.max(0, Math.abs(offset) - timing.stepMs)
  const direction = intentDirection(intent)
  const ahead = direction !== 0 && Math.sign(offset) === direction
  return ahead ? beyondOwnInterval * AHEAD_WEIGHT : beyondOwnInterval
}

/** Buiten het zichtbare venster of van een veld dat de modus niet toont: pas als er verder niets te doen is. */
export function isIdleWork(timing: FrameTiming, intent: Intent): boolean {
  if (!intent.fields.has(timing.field)) return true
  return !(timing.epoch >= intent.window.start - timing.stepMs && timing.epoch <= intent.window.end + timing.stepMs)
}

/**
 * Rangorde van wachtend werk, voor requests en decodes dezelfde: eerst wat in beeld is, dan de
 * afstand tot het doel, dan regen, dan het veld dat het langst niet aan de beurt was, dan aankomst.
 */
export class IntentRanker {
  private readonly lastTurn = new Map<string, number>()
  private turns = 0
  intent?: Intent

  rank(timing: FrameTiming, arrival: number): number[] {
    const idle = this.intent && isIdleWork(timing, this.intent) ? 1 : 0
    const distanceStep = this.intent ? Math.floor(intentDistance(timing, this.intent) / DISTANCE_STEP_MS) : 0
    const fieldTurn = timing.field === FIRST_FIELD ? -1 : this.lastTurn.get(timing.field) ?? 0
    return [idle, distanceStep, fieldTurn, arrival]
  }

  /** Dit veld is net aan de beurt geweest; bij gelijke afstand gaan de andere nu voor. */
  served(field: string): void {
    this.lastTurn.set(field, ++this.turns)
  }
}

export function ranksBefore(left: number[], right: number[]): boolean {
  for (let position = 0; position < left.length; position++) {
    if (left[position] !== right[position]) return left[position]! < right[position]!
  }
  return false
}
