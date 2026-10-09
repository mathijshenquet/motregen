import type { TelegramApi, TelegramMessage } from './api.js'
import type { FileIdCache } from './file-ids.js'
import type { RenderedLoop, RenderedMedia } from './render.js'
import { FRAME_PIXELS } from './config.js'
import { TelegramApiError } from './api.js'
import { setTimeout as delay } from 'node:timers/promises'
import { CachePosts } from './cache-posts.js'

/**
 * Afmetingen en duur van een loop, expliciet bij het uploaden: zonder kan een client de bubbel anders
 * schalen dan een foto van dezelfde maat (PO 2026-10-08: de mp4 stond kleiner dan de stills). De loop eindigt
 * met één seconde stilstaand beeld (encode.ts).
 */
function animationSize(loop: RenderedLoop): { width: number; height: number; duration: number } {
  return { ...FRAME_PIXELS, duration: Math.round(loop.frames / loop.fps + 1) }
}

export class StillPhotos {
  private queue: Promise<void> = Promise.resolve()
  private priming = new Map<string, Promise<void>>()
  private lastUpload = 0
  private readonly posts?: CachePosts

  constructor(private readonly api: TelegramApi, readonly fileIds: Pick<FileIdCache, 'bot' | 'get' | 'remember' | 'forget'>, private readonly cacheChatId?: string, cacheDirectory?: string, private readonly uploadSpacingMs = 1100) {
    if (cacheChatId) this.posts = new CachePosts(api, cacheChatId, fileIds.bot, cacheDirectory)
  }

  async primeGeneration(media: RenderedMedia[]): Promise<void> {
    if (!media.length || !this.posts) return
    const generated = media[0]!.generated
    if (media.some((item) => item.generated !== generated)) throw new Error('Cachematrix bevat meerdere generaties')
    const started = performance.now()
    await this.prime(media)
    const counts = await this.retainGeneration(generated)
    console.info(JSON.stringify({ event: 'media-generation-primed', generated, count: media.length, ...counts, primeMs: Math.round(performance.now() - started) }))
  }

  async retainGeneration(generated: string): Promise<{ posts: number; removed: number }> {
    return this.posts ? this.posts.retain(generated) : { posts: 0, removed: 0 }
  }

  async prime(media: RenderedMedia[]): Promise<void> {
    if (!this.cacheChatId) return
    const missing: RenderedMedia[] = []
    for (const item of media) if (!await this.fileIds.get(item)) missing.push(item)
    const photos = missing.filter((item) => item.kind === 'photo')
    const tasks: Promise<void>[] = []
    for (let index = 0; index < photos.length; index += 10) tasks.push(this.enqueue(photos.slice(index, index + 10)))
    for (const item of missing.filter((item) => item.kind === 'animation')) tasks.push(this.enqueue([item]))
    const results = await Promise.allSettled(tasks)
    const failed = results.find((result) => result.status === 'rejected')
    if (failed?.status === 'rejected') throw failed.reason
  }

  private enqueue(media: RenderedMedia[]): Promise<void> {
    const existing = media.flatMap((item) => this.priming.has(item.key) ? [this.priming.get(item.key)!] : [])
    const pending = media.filter((item) => !this.priming.has(item.key))
    if (!pending.length) return Promise.all(existing).then(() => undefined)
    const operation = this.queue.then(async () => {
      const missing: RenderedMedia[] = []
      for (const item of pending) if (!await this.fileIds.get(item)) missing.push(item)
      if (!missing.length) return
      await delay(Math.max(0, this.lastUpload + this.uploadSpacingMs - Date.now()))
      const started = performance.now()
      const messages = await this.uploadCached(missing)
      const uploadMs = Math.round(performance.now() - started)
      for (const generated of new Set(missing.map((item) => item.generated))) {
        await this.posts!.remember(generated, messages.filter((_message, index) => missing[index]!.generated === generated).map((message) => message.message_id))
      }
      for (const [index, item] of missing.entries()) {
        await this.fileIds.remember(item, messages[index]!)
        if (!await this.fileIds.get(item)) throw new Error('Telegram geeft geen file_id voor de cache-upload')
      }
      this.lastUpload = Date.now()
      console.info(JSON.stringify({ event: 'media-cache-primed', kind: missing[0]!.kind, key: missing.length === 1 ? missing[0]!.key : undefined, count: missing.length, uploadMs }))
    })
    this.queue = operation.catch(() => undefined)
    for (const item of pending) this.priming.set(item.key, operation)
    void operation.finally(() => { for (const item of pending) this.priming.delete(item.key) }).catch(() => undefined)
    return Promise.all([...existing, operation]).then(() => undefined)
  }

  private async uploadCached(media: RenderedMedia[]): Promise<TelegramMessage[]> {
    const fields = { chat_id: this.cacheChatId, disable_notification: true }
    for (let attempt = 0; ; attempt++) {
      try {
        if (media.length > 1) return await this.api.uploadAlbum(fields, media)
        return [await this.upload(media[0]!, { ...fields, caption: media[0]!.caption })]
      } catch (error) {
        if (!(error instanceof TelegramApiError) || !error.retryAfter || attempt >= 2) throw error
        await delay(error.retryAfter * 1000)
      }
    }
  }

  private async upload(still: RenderedMedia, fields: Record<string, unknown>): Promise<TelegramMessage> {
    const animation = still.kind === 'animation'
    if (still.path.endsWith('.png')) return this.api.upload<TelegramMessage>('sendPhoto', { ...fields, parse_mode: 'HTML' }, still.path, { name: 'photo', mime: 'image/png', filename: 'motregen.png' })
    return animation
      ? this.api.upload<TelegramMessage>('sendAnimation', { ...fields, ...animationSize(still), parse_mode: 'HTML' }, still.path, { name: 'animation', mime: 'video/mp4', filename: 'motregen.mp4' })
      : this.api.uploadPhoto({ ...fields, parse_mode: 'HTML' }, still.path)
  }

  async send(still: RenderedMedia, fields: Record<string, unknown>): Promise<TelegramMessage> {
    for (let attempt = 0; ; attempt++) {
      await this.prime([still])
      const fileId = await this.fileIds.get(still)
      const animation = still.kind === 'animation'
      const method = animation ? 'sendAnimation' : 'sendPhoto'
      const name = animation ? 'animation' : 'photo'
      try {
        if (fileId) return await this.api.call<TelegramMessage>(method, { ...fields, parse_mode: 'HTML', [name]: fileId })
        const started = performance.now()
        const message = await this.upload(still, fields)
        console.info(JSON.stringify({ event: 'media-upload', kind: still.kind, key: still.key, uploadMs: Math.round(performance.now() - started) }))
        await this.fileIds.remember(still, message)
        return message
      } catch (error) {
        if (!await this.recoverFileId(still, fileId, attempt, error)) throw error
      }
    }
  }

  async edit(still: RenderedMedia, fields: Record<string, unknown>): Promise<{ fileIdCached: boolean }> {
    for (let attempt = 0; ; attempt++) {
      await this.prime([still])
      const fileId = await this.fileIds.get(still)
      const inline = Boolean(fields.inline_message_id)
      const name = still.kind === 'animation' ? 'animation' : 'photo'
      const media = { type: still.kind, media: fileId ?? (inline ? still.url : `attach://${name}`), caption: still.caption, parse_mode: 'HTML', ...still.kind === 'animation' && !fileId ? animationSize(still) : {} }
      const request = { ...fields, media }
      try {
        if (fileId || inline) {
          const message = await this.api.call<TelegramMessage | true>('editMessageMedia', request)
          if (!fileId) await this.fileIds.remember(still, message)
        } else {
          const attachment = still.kind === 'animation' ? { name, mime: 'video/mp4', filename: 'motregen.mp4' } : undefined
          const message = await this.api.upload<TelegramMessage>('editMessageMedia', request, still.path, attachment)
          await this.fileIds.remember(still, message)
        }
        return { fileIdCached: Boolean(fileId) }
      } catch (error) {
        if (!await this.recoverFileId(still, fileId, attempt, error)) throw error
      }
    }
  }

  private async recoverFileId(still: RenderedMedia, fileId: string | undefined, attempt: number, error: unknown): Promise<boolean> {
    if (attempt || !fileId || !(error instanceof TelegramApiError) || !error.invalidFile) return false
    await this.fileIds.forget(still, fileId)
    console.info(JSON.stringify({ event: 'file-id-invalidated', key: still.key, description: error.description }))
    return true
  }
}
