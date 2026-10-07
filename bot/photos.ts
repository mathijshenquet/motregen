import type { TelegramApi, TelegramMessage } from './api.js'
import type { FileIdCache } from './file-ids.js'
import type { RenderedStill } from './render.js'

export class StillPhotos {
  constructor(private readonly api: TelegramApi, readonly fileIds: FileIdCache) {}

  async send(still: RenderedStill, fields: Record<string, unknown>): Promise<TelegramMessage> {
    const fileId = await this.fileIds.get(still)
    if (fileId) return this.api.call<TelegramMessage>('sendPhoto', { ...fields, photo: fileId })
    const message = await this.api.uploadPhoto(fields, still.path)
    await this.fileIds.remember(still, message)
    return message
  }

  async edit(still: RenderedStill, fields: Record<string, unknown>): Promise<{ fileIdCached: boolean }> {
    const fileId = await this.fileIds.get(still)
    const inline = Boolean(fields.inline_message_id)
    const media = { type: 'photo', media: fileId ?? (inline ? still.url : 'attach://photo'), caption: still.caption }
    const request = { ...fields, media }
    if (fileId || inline) {
      const message = await this.api.call<TelegramMessage | true>('editMessageMedia', request)
      if (!fileId) await this.fileIds.remember(still, message)
    } else {
      const message = await this.api.upload<TelegramMessage>('editMessageMedia', request, still.path)
      await this.fileIds.remember(still, message)
    }
    return { fileIdCached: Boolean(fileId) }
  }
}
