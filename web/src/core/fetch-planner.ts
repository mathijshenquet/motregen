import { DecodeCancelled } from './decode-queue'
import { IntentRanker, isIdleWork, ranksBefore, type FrameTiming, type Intent } from './intent'

/**
 * Onder deze grootte is een request vertraging en geen bandbreedte (een header, één uurframe,
 * een wolkenpayload): die telt niet mee voor de grens op grote overdrachten.
 */
export const SMALL_REQUEST_BYTES = 64_000
/** Wat een browser per host tegelijk openhoudt over HTTP/1.1; meer wensen starten levert alleen een rij in de browser op. */
const MAX_REQUESTS = 6

export interface FetchWish {
  url: string
  bytes: number
  /** De frames die deze Range dekt. Zonder frames gaat de wens altijd voor. */
  frames: FrameTiming[]
  /** Wacht er nog iemand op? Een wens die niemand meer heeft vervalt voordat hij het netwerk op gaat. */
  wanted: () => boolean
  run: () => Promise<void>
}

interface WaitingWish {
  wish: FetchWish
  arrival: number
  resolve: () => void
  reject: (error: unknown) => void
}

/**
 * De volgorde van de requests (MIP-20): dezelfde rangorde als de decodewachtrij, een beperkt
 * aantal grote overdrachten tegelijk zodat wat dichtbij de cursor ligt de lijn niet deelt met
 * wat ver weg ligt, en werk buiten het venster pas als er binnen het venster niets meer loopt.
 */
export class FetchPlanner {
  private readonly waiting: WaitingWish[] = []
  private readonly active = new Set<WaitingWish>()
  private readonly ranker = new IntentRanker()
  private arrivals = 0
  private startPending = false

  /** `bulkRequests`: hoeveel overdrachten van `SMALL_REQUEST_BYTES` of meer tegelijk mogen lopen. */
  constructor(private readonly bulkRequests: number) {}

  /**
   * Een nieuwe intent vervangt het wensenlijstje: wat niemand meer wil vervalt, de rest wordt
   * opnieuw geordend.
   */
  setIntent(intent: Intent): void {
    this.ranker.intent = intent
    for (const stale of this.waiting.filter((waiting) => !waiting.wish.wanted())) {
      this.waiting.splice(this.waiting.indexOf(stale), 1)
      stale.reject(new DecodeCancelled())
    }
    this.startSoon()
  }

  fetch(wish: FetchWish): Promise<void> {
    return new Promise((resolve, reject) => {
      this.waiting.push({ wish, arrival: ++this.arrivals, resolve, reject })
      this.startSoon()
    })
  }

  // Pas na de lopende tik kiezen: wensen komen in bosjes binnen (alle velden van één locatie), en
  // de eerste die zich meldt is zelden de dichtstbijzijnde.
  private startSoon(): void {
    if (this.startPending) return
    this.startPending = true
    queueMicrotask(() => {
      this.startPending = false
      this.start()
    })
  }

  private start(): void {
    while (this.active.size < MAX_REQUESTS) {
      const next = this.next()
      if (!next) return
      this.waiting.splice(this.waiting.indexOf(next), 1)
      if (!next.wish.wanted()) {
        next.reject(new DecodeCancelled())
        continue
      }
      const nearest = this.nearestFrame(next)
      if (nearest) this.ranker.served(nearest.field)
      this.active.add(next)
      const finished = () => {
        this.active.delete(next)
        this.start()
      }
      next.wish.run().then(next.resolve, next.reject).then(finished, finished)
    }
  }

  private next(): WaitingWish | undefined {
    // Eén Range tegelijk per chunk-URL: Chromium cachet een tweede, gelijktijdige Range op een
    // bezette cache-entry niet, waarna die warm opnieuw overkomt.
    const busyUrls = new Set([...this.active].map((running) => running.wish.url))
    const bulkRunning = [...this.active].filter((running) => isBulk(running.wish)).length
    let best: WaitingWish | undefined
    let bestRank: number[] | undefined
    for (const candidate of this.waiting) {
      if (busyUrls.has(candidate.wish.url)) continue
      if (isBulk(candidate.wish) && bulkRunning >= this.bulkRequests) continue
      const rank = this.rank(candidate)
      if (bestRank && !ranksBefore(rank, bestRank)) continue
      best = candidate
      bestRank = rank
    }
    if (best && this.isIdle(best) && [...this.active].some((running) => !this.isIdle(running))) return undefined
    return best
  }

  private rank(waiting: WaitingWish): number[] {
    let best: number[] | undefined
    for (const frame of waiting.wish.frames) {
      const rank = this.ranker.rank(frame, waiting.arrival)
      if (!best || ranksBefore(rank, best)) best = rank
    }
    return best ?? [-1, 0, 0, waiting.arrival]
  }

  private nearestFrame(waiting: WaitingWish): FrameTiming | undefined {
    let nearest: FrameTiming | undefined
    let nearestRank: number[] | undefined
    for (const frame of waiting.wish.frames) {
      const rank = this.ranker.rank(frame, waiting.arrival)
      if (nearestRank && !ranksBefore(rank, nearestRank)) continue
      nearest = frame
      nearestRank = rank
    }
    return nearest
  }

  private isIdle(waiting: WaitingWish): boolean {
    const intent = this.ranker.intent
    if (!intent || !waiting.wish.frames.length) return false
    return waiting.wish.frames.every((frame) => isIdleWork(frame, intent))
  }
}

function isBulk(wish: FetchWish): boolean {
  return wish.bytes >= SMALL_REQUEST_BYTES
}
