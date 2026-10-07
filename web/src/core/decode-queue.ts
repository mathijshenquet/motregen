import { IntentRanker, ranksBefore, type FrameTiming, type Intent } from './intent'

/** Een wachtende request of decode waar niemand meer op wacht, bijvoorbeeld omdat de cursor verder is gesprongen. */
export class DecodeCancelled extends Error {
  constructor() {
    super('Decode geannuleerd: niemand wacht er nog op')
    this.name = 'DecodeCancelled'
  }
}

interface QueuedJob<Job> {
  timing: FrameTiming
  job: Job
  arrival: number
}

/**
 * Volgorde waarin de decode-workers werk oppakken: tijd-majeur (MIP-19 punt 4). Wat het dichtst
 * bij de cursor ligt gaat eerst, over alle velden heen, zodat kaart, histogram en tabel voor
 * hetzelfde tijdstip samen binnenkomen en het geladen venster als één front naar buiten groeit.
 */
export class DecodeQueue<Job> {
  private readonly waiting: Array<QueuedJob<Job>> = []
  private readonly ranker = new IntentRanker()
  private arrivals = 0

  get size(): number {
    return this.waiting.length
  }

  /** De volgorde wordt bij elke `take` opnieuw bepaald: een nieuwe intent herordent wat nog wacht. */
  setIntent(intent: Intent): void {
    this.ranker.intent = intent
  }

  enqueue(timing: FrameTiming, job: Job): void {
    this.waiting.push({ timing, job, arrival: ++this.arrivals })
  }

  take(): Job | undefined {
    let nearest: QueuedJob<Job> | undefined
    let nearestRank: number[] | undefined
    for (const candidate of this.waiting) {
      const rank = this.ranker.rank(candidate.timing, candidate.arrival)
      if (nearestRank && !ranksBefore(rank, nearestRank)) continue
      nearest = candidate
      nearestRank = rank
    }
    if (!nearest) return undefined
    this.waiting.splice(this.waiting.indexOf(nearest), 1)
    this.ranker.served(nearest.timing.field)
    return nearest.job
  }
}
