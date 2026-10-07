/**
 * Volgorde waarin de decode-workers werk oppakken: het frame onder de cursor (kaart, afspelen)
 * gaat vóór een puntreeks waar de gebruiker op wacht, en die vóór alles wat vooruit laadt.
 */
export const DECODE_LANES = ['cursor', 'series', 'background'] as const
export type DecodeLane = typeof DECODE_LANES[number]

/** Een wachtende decode waar niemand meer op wacht, bijvoorbeeld omdat de cursor verder is gesprongen. */
export class DecodeCancelled extends Error {
  constructor() {
    super('Decode geannuleerd: niemand wacht er nog op')
    this.name = 'DecodeCancelled'
  }
}

interface QueuedJob<Job> { key: string; job: Job }

export class DecodeQueue<Job> {
  private readonly lanes: Record<DecodeLane, Array<QueuedJob<Job>>> = { cursor: [], series: [], background: [] }

  get size(): number {
    return DECODE_LANES.reduce((total, lane) => total + this.lanes[lane].length, 0)
  }

  enqueue(key: string, lane: DecodeLane, job: Job): void {
    this.lanes[lane].push({ key, job })
  }

  /** Een al wachtende decode die nu dringender gevraagd wordt schuift naar die baan; nooit terug. */
  promote(key: string, lane: DecodeLane): void {
    for (const slower of DECODE_LANES.slice(DECODE_LANES.indexOf(lane) + 1)) {
      const waiting = this.lanes[slower]
      const promoted = waiting.filter((queued) => queued.key === key)
      if (!promoted.length) continue
      this.lanes[slower] = waiting.filter((queued) => queued.key !== key)
      this.lanes[lane].push(...promoted)
    }
  }

  take(): Job | undefined {
    for (const lane of DECODE_LANES) {
      const next = this.lanes[lane].shift()
      if (next) return next.job
    }
    return undefined
  }
}
