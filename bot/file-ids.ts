import { readFile, rename, rm, stat, writeFile } from 'node:fs/promises'
import type { TelegramMessage } from './api.js'
import type { RenderedMedia } from './render.js'

export const STILL_CACHE_TTL = 2 * 3_600_000
// Losse frames voor de tijdknoppen kosten ~300 MB per modus per generatie; twee uur bewaren vulde op de VM 16 GB en
// daarmee de schijf (prod 2026-10-10). Twintig minuten is een handvol generaties, ~3 GB.
export const FRAME_RETENTION = 20 * 60_000

export class FileIdCache {
  private readonly entries = new Map<string, { fileId: string; expires: number }>()

  constructor(readonly bot: string) {}

  async forget(still: RenderedMedia, rejectedId: string): Promise<void> {
    if (await this.get(still) !== rejectedId) return
    this.entries.delete(still.key)
    await rm(`${still.path}.file-id.json`, { force: true })
  }

  async get(still: RenderedMedia): Promise<string | undefined> {
    const now = Date.now()
    this.prune(now)
    const existing = this.entries.get(still.key)
    if (existing) return existing.fileId
    try {
      const metadata = await stat(still.path)
      const expires = metadata.mtimeMs + STILL_CACHE_TTL
      if (expires <= now) return undefined
      const entry = JSON.parse(await readFile(`${still.path}.file-id.json`, 'utf8'))
      if (entry.key !== still.key || entry.bot !== this.bot || typeof entry.fileId !== 'string' || !entry.fileId) return undefined
      this.entries.set(still.key, { fileId: entry.fileId, expires })
      return entry.fileId
    } catch {
      return undefined
    }
  }

  async remember(still: RenderedMedia, message: TelegramMessage | true): Promise<void> {
    if (message === true) return
    const fileId = still.kind === 'animation' ? message.animation?.file_id : message.photo?.at(-1)?.file_id
    if (!fileId) return
    const metadata = await stat(still.path)
    const expires = metadata.mtimeMs + STILL_CACHE_TTL
    if (expires <= Date.now()) return
    const path = `${still.path}.file-id.json`
    await writeFile(`${path}.tmp`, JSON.stringify({ key: still.key, bot: this.bot, fileId }))
    await rename(`${path}.tmp`, path)
    this.prune(Date.now())
    this.entries.set(still.key, { fileId, expires })
  }

  private prune(now: number): void {
    for (const [key, entry] of this.entries) {
      if (entry.expires <= now) this.entries.delete(key)
    }
  }
}
