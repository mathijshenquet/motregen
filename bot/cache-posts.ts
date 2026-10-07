import { createHash } from 'node:crypto'
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { TelegramApi } from './api.js'

export class CachePosts {
  private posts = new Map<string, Set<number>>()
  private loaded = false
  private queue: Promise<void> = Promise.resolve()
  private readonly path?: string

  constructor(private readonly api: TelegramApi, private readonly chatId: string, private readonly bot: string, directory?: string) {
    if (directory) {
      const scope = createHash('sha256').update(JSON.stringify([bot, chatId])).digest('hex').slice(0, 24)
      this.path = join(directory, `.cache-posts-${scope}.json`)
    }
  }

  remember(generated: string, messageIds: number[]): Promise<void> {
    return this.enqueue(async () => {
      const ids = this.posts.get(generated) ?? new Set<number>()
      for (const id of messageIds) ids.add(id)
      this.posts.set(generated, ids)
      await this.save()
    })
  }

  retain(generated: string): Promise<{ posts: number; removed: number }> {
    return this.enqueue(async () => {
      let removed = 0
      for (const [generation, ids] of this.posts) {
        if (generation === generated) continue
        const messageIds = [...ids]
        for (let index = 0; index < messageIds.length; index += 100) {
          const batch = messageIds.slice(index, index + 100)
          await this.api.call('deleteMessages', { chat_id: this.chatId, message_ids: batch })
          removed += batch.length
          for (const id of batch) ids.delete(id)
          if (!ids.size) this.posts.delete(generation)
          await this.save()
        }
      }
      return { posts: this.posts.get(generated)?.size ?? 0, removed }
    })
  }

  private enqueue<Result>(operation: () => Promise<Result>): Promise<Result> {
    const pending = this.queue.then(async () => { await this.load(); return operation() })
    this.queue = pending.then(() => undefined, () => undefined)
    return pending
  }

  private async load(): Promise<void> {
    if (this.loaded) return
    if (this.path) {
      try {
        const state = JSON.parse(await readFile(this.path, 'utf8'))
        if (state.version !== 1 || state.bot !== this.bot || state.chatId !== this.chatId || !Array.isArray(state.posts)) throw new Error('Ongeldig cachepostregister')
        for (const entry of state.posts) {
          if (typeof entry.generated !== 'string' || !Array.isArray(entry.messageIds) || !entry.messageIds.every((id: unknown) => Number.isSafeInteger(id) && Number(id) > 0)) throw new Error('Ongeldige cachepostids')
          this.posts.set(entry.generated, new Set(entry.messageIds))
        }
      } catch (error) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
      }
    }
    this.loaded = true
  }

  private async save(): Promise<void> {
    if (!this.path) return
    await mkdir(dirname(this.path), { recursive: true })
    const posts = [...this.posts].map(([generated, ids]) => ({ generated, messageIds: [...ids] }))
    await writeFile(`${this.path}.tmp`, JSON.stringify({ version: 1, bot: this.bot, chatId: this.chatId, posts }))
    await rename(`${this.path}.tmp`, this.path)
  }
}
