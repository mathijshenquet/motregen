/**
 * Volgorde waarin de decode-workers werk oppakken: tijd-majeur (MIP-19 punt 4). Wat het dichtst
 * bij de cursor ligt gaat eerst, over alle velden heen, zodat kaart, histogram en tabel voor
 * hetzelfde tijdstip samen binnenkomen en het geladen venster als één front naar buiten groeit.
 */
export interface DecodeCursor {
  epoch: number
  /** Afspeelrichting: 1 vooruit, -1 terug, 0 stilstaand of onbekend (scrubben). */
  direction: -1 | 0 | 1
}

export interface FrameTiming {
  epoch: number
  /** Afstand tot het naburige frame van hetzelfde veld: zo ver telt dit frame mee in de interpolatie. */
  stepMs: number
  field: string
}

/** Een wachtende decode waar niemand meer op wacht, bijvoorbeeld omdat de cursor verder is gesprongen. */
export class DecodeCancelled extends Error {
  constructor() {
    super('Decode geannuleerd: niemand wacht er nog op')
    this.name = 'DecodeCancelled'
  }
}

/** Frames in de afspeelrichting tellen iets dichterbij: die heeft het afspelen het eerst nodig. */
const AHEAD_WEIGHT = 0.8
/** De stap van de regentijdlijn. Binnen één stap geldt afstand als gelijk en wisselen de velden elkaar af. */
const DISTANCE_STEP_MS = 5 * 60_000
const FIRST_FIELD = 'rain_rate'

/**
 * Afstand in ms van de cursor tot het interval waarin dit frame getekend wordt. De twee frames
 * waartussen de cursor staat liggen dus op afstand 0, ook van een uurveld: zonder die aftrek zou
 * de kaartlaag van een uurveld achter een halfuur aan regenframes wachten.
 */
export function decodeDistance(timing: FrameTiming, cursor: DecodeCursor): number {
  const offset = timing.epoch - cursor.epoch
  if (!Number.isFinite(offset)) return Number.POSITIVE_INFINITY
  const beyondOwnInterval = Math.max(0, Math.abs(offset) - timing.stepMs)
  const ahead = cursor.direction !== 0 && Math.sign(offset) === cursor.direction
  return ahead ? beyondOwnInterval * AHEAD_WEIGHT : beyondOwnInterval
}

interface QueuedJob<Job> {
  timing: FrameTiming
  job: Job
  arrival: number
}

export class DecodeQueue<Job> {
  private readonly waiting: Array<QueuedJob<Job>> = []
  private readonly lastTurn = new Map<string, number>()
  private cursor?: DecodeCursor
  private arrivals = 0
  private turns = 0

  get size(): number {
    return this.waiting.length
  }

  /** De volgorde wordt bij elke `take` opnieuw bepaald: een cursorsprong herordent wat nog wacht. */
  setCursor(cursor: DecodeCursor): void {
    this.cursor = cursor
  }

  enqueue(timing: FrameTiming, job: Job): void {
    this.waiting.push({ timing, job, arrival: ++this.arrivals })
  }

  take(): Job | undefined {
    let nearest: QueuedJob<Job> | undefined
    let nearestRank: number[] | undefined
    for (const candidate of this.waiting) {
      const rank = this.rank(candidate)
      if (nearestRank && !ranksBefore(rank, nearestRank)) continue
      nearest = candidate
      nearestRank = rank
    }
    if (!nearest) return undefined
    this.waiting.splice(this.waiting.indexOf(nearest), 1)
    this.lastTurn.set(nearest.timing.field, ++this.turns)
    return nearest.job
  }

  /** Eerst de afstand, dan regen, dan het veld dat het langst niet aan de beurt was, dan aankomst. */
  private rank(queued: QueuedJob<Job>): number[] {
    const distanceStep = this.cursor ? Math.floor(decodeDistance(queued.timing, this.cursor) / DISTANCE_STEP_MS) : 0
    const fieldTurn = queued.timing.field === FIRST_FIELD ? -1 : this.lastTurn.get(queued.timing.field) ?? 0
    return [distanceStep, fieldTurn, queued.arrival]
  }
}

function ranksBefore(left: number[], right: number[]): boolean {
  for (let position = 0; position < left.length; position++) {
    if (left[position] !== right[position]) return left[position]! < right[position]!
  }
  return false
}
