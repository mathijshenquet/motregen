import type { TelegramApi, TelegramMessage } from './api.js'
import type { FileIdCache } from './file-ids.js'
import type { RenderedMedia } from './render.js'
import { TelegramApiError } from './api.js'
import { setTimeout as delay } from 'node:timers/promises'

export class StillPhotos {
  private queue: Promise<void> = Promise.resolve()
  private priming = new Map<string, Promise<void>>()
  private lastUpload = 0

  constructor(private readonly api: TelegramApi, readonly fileIds: FileIdCache, private readonly cacheChatId?: string) {}

  async prime(media: RenderedMedia[]): Promise<void> {
    if (!this.cacheChatId) return
    const missing = []
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
      const missing = []
      for (const item of pending) if (!await this.fileIds.get(item)) missing.push(item)
      if (!missing.length) return
      await delay(Math.max(0, this.lastUpload + 1100 - Date.now()))
      const started = performance.now()
      const messages = await this.uploadCached(missing)
      const uploadMs = Math.round(performance.now() - started)
      for (const [index, item] of missing.entries()) {
        await this.fileIds.remember(item, messages[index]!)
        if (!await this.fileIds.get(item)) throw new Error('Telegram geeft geen file_id voor de cache-upload')
      }
      await this.api.call('deleteMessages', { chat_id: this.cacheChatId, message_ids: messages.map((message) => message.message_id) })
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
    return animation
      ? this.api.upload<TelegramMessage>('sendAnimation', { ...fields, parse_mode: 'HTML' }, still.path, { name: 'animation', mime: 'video/mp4', filename: 'motregen.mp4' })
      : this.api.uploadPhoto({ ...fields, parse_mode: 'HTML' }, still.path)
  }

  async send(still: RenderedMedia, fields: Record<string, unknown>): Promise<TelegramMessage> {
    await this.prime([still])
    const fileId = await this.fileIds.get(still)
    const animation = still.kind === 'animation'
    const method = animation ? 'sendAnimation' : 'sendPhoto'
    const name = animation ? 'animation' : 'photo'
    if (fileId) return this.api.call<TelegramMessage>(method, { ...fields, parse_mode: 'HTML', [name]: fileId })
    const started = performance.now()
    const message = await this.upload(still, fields)
    console.info(JSON.stringify({ event: 'media-upload', kind: still.kind, key: still.key, uploadMs: Math.round(performance.now() - started) }))
    await this.fileIds.remember(still, message)
    return message
  }

  async edit(still: RenderedMedia, fields: Record<string, unknown>): Promise<{ fileIdCached: boolean }> {
    await this.prime([still])
    const fileId = await this.fileIds.get(still)
    const inline = Boolean(fields.inline_message_id)
    const name = still.kind === 'animation' ? 'animation' : 'photo'
    const media = { type: still.kind, media: fileId ?? (inline ? still.url : `attach://${name}`), caption: still.caption, parse_mode: 'HTML' }
    const request = { ...fields, media }
    if (fileId || inline) {
      const message = await this.api.call<TelegramMessage | true>('editMessageMedia', request)
      if (!fileId) await this.fileIds.remember(still, message)
    } else {
      const attachment = still.kind === 'animation' ? { name, mime: 'video/mp4', filename: 'motregen.mp4' } : undefined
      const message = await this.api.upload<TelegramMessage>('editMessageMedia', request, still.path, attachment)
      await this.fileIds.remember(still, message)
    }
    return { fileIdCached: Boolean(fileId) }
  }
}
