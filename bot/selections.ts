import { STILL_CACHE_TTL } from './file-ids.js'

export class MessageSelections {
  private readonly entries = new Map<string, { key: string; expires: number }>()

  has(message: string, key: string): boolean {
    this.prune()
    return this.entries.get(message)?.key === key
  }

  remember(message: string, key: string): void {
    this.prune()
    this.entries.set(message, { key, expires: Date.now() + STILL_CACHE_TTL })
  }

  private prune(): void {
    const now = Date.now()
    for (const [message, entry] of this.entries) {
      if (entry.expires <= now) this.entries.delete(message)
    }
  }
}
