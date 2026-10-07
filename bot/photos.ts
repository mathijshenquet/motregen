import type { TelegramApi, TelegramMessage } from './api.js'
import type { FileIdCache } from './file-ids.js'
import type { RenderedMedia } from './render.js'

export class StillPhotos {
  constructor(private readonly api: TelegramApi, readonly fileIds: FileIdCache) {}

  async send(still: RenderedMedia, fields: Record<string, unknown>): Promise<TelegramMessage> {
    const fileId = await this.fileIds.get(still)
    const animation = still.kind === 'animation'
    const method = animation ? 'sendAnimation' : 'sendPhoto'
    const name = animation ? 'animation' : 'photo'
    if (fileId) return this.api.call<TelegramMessage>(method, { ...fields, [name]: fileId })
    const started = performance.now()
    const message = animation
      ? await this.api.upload<TelegramMessage>(method, fields, still.path, { name, mime: 'video/mp4', filename: 'motregen.mp4' })
      : await this.api.uploadPhoto(fields, still.path)
    console.info(JSON.stringify({ event: 'media-upload', kind: still.kind, key: still.key, uploadMs: Math.round(performance.now() - started) }))
    await this.fileIds.remember(still, message)
    return message
  }

  async edit(still: RenderedMedia, fields: Record<string, unknown>): Promise<{ fileIdCached: boolean }> {
    const fileId = await this.fileIds.get(still)
    const inline = Boolean(fields.inline_message_id)
    const name = still.kind === 'animation' ? 'animation' : 'photo'
    const media = { type: still.kind, media: fileId ?? (inline ? still.url : `attach://${name}`), caption: still.caption }
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
