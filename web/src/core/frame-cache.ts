import { intentDistance, isIdleWork, type FrameTiming, type Intent } from './intent'

interface CachedFrame {
  frame: Uint8Array
  timing: FrameTiming
}

/**
 * Gedecodeerde frames, met een plafond. Is de cache vol, dan gaat het frame eruit dat het verst
 * van de intent ligt, idle-werk eerst. Een LRU doet met een tijd-majeure decodevolgorde het
 * omgekeerde: de frames rond de cursor zijn het eerst gedecodeerd en dus het oudst (gemeten in
 * perf.spec: na een locatiewissel moesten juist de uren rond "nu" opnieuw van het netwerk komen).
 */
export class FrameCache {
  private readonly entries = new Map<string, CachedFrame>()
  intent?: Intent

  constructor(private readonly capacity: number) {}

  get size(): number {
    return this.entries.size
  }

  get(key: string): Uint8Array | undefined {
    return this.entries.get(key)?.frame
  }

  set(key: string, frame: Uint8Array, timing: FrameTiming): void {
    this.entries.set(key, { frame, timing })
    while (this.entries.size > this.capacity) this.entries.delete(this.farthestKey())
  }

  /** Zonder intent het oudste frame; een `Map` bewaart de volgorde van invoegen. */
  private farthestKey(): string {
    const intent = this.intent
    if (!intent) return this.entries.keys().next().value!
    let farthestKey = ''
    let farthestIdle = false
    let farthestDistance = -1
    for (const [key, cached] of this.entries) {
      const idle = isIdleWork(cached.timing, intent)
      const distance = intentDistance(cached.timing, intent)
      if (idle === farthestIdle ? distance <= farthestDistance : farthestIdle) continue
      farthestKey = key
      farthestIdle = idle
      farthestDistance = distance
    }
    return farthestKey
  }
}
