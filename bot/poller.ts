import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { TelegramApi, TelegramMessage } from './api.js'
import type { BotConfig } from './config.js'
import type { BotRuntime } from './handlers.js'
import type { RenderedMedia } from './render.js'
import { MessageSelections } from './selections.js'
import { MediaUnavailableError, REGISTER_FILENAME, RegisterMedia, TelegramRegister, writeRegister } from './register.js'

export async function createPoller(config: BotConfig, api: TelegramApi, identity: { id: number; username: string }): Promise<{ runtime: BotRuntime; refresh(): Promise<void> }> {
  const media = new RegisterMedia(identity.id)
  const path = config.registerPath ?? join(config.cacheDirectory, REGISTER_FILENAME)
  const transport = config.registerPath ? undefined : new TelegramRegister(api, config.cacheChatId!, identity.id)
  try {
    media.accept(JSON.parse(await readFile(path, 'utf8')))
  } catch {
    console.info(JSON.stringify({ event: 'register-local-unavailable' }))
  }
  const refresh = async () => {
    const register = transport ? await transport.read() : JSON.parse(await readFile(path, 'utf8'))
    if (!register) return
    if (!media.accept(register)) return
    if (transport) await writeRegister(path, register)
    console.info(JSON.stringify({ event: 'register-refreshed', generated: media.currentManifest().generated }))
  }
  const fileIds = { get: (item: RenderedMedia) => media.fileId(item) }
  const runtime: BotRuntime = {
    api, config, username: identity.username,
    selections: new MessageSelections(),
    currentManifest: async () => media.currentManifest(),
    manifestForGeneration: (generated) => media.manifestForGeneration(generated),
    availableStill: (selection) => media.available(selection),
    renderer: { render: async (selection, manifest) => media.media(selection, manifest) },
    photos: {
      fileIds,
      send: async (item, fields) => {
        const fileId = await fileIds.get(item)
        if (!fileId) throw new MediaUnavailableError()
        const animation = item.kind === 'animation'
        return api.call<TelegramMessage>(animation ? 'sendAnimation' : 'sendPhoto', { ...fields, parse_mode: 'HTML', [animation ? 'animation' : 'photo']: fileId })
      },
      edit: async (item, fields) => {
        const fileId = await fileIds.get(item)
        if (!fileId) throw new MediaUnavailableError()
        await api.call('editMessageMedia', { ...fields, media: { type: item.kind, media: fileId, caption: item.caption, parse_mode: 'HTML' } })
        return { fileIdCached: true }
      },
    },
  }
  return { runtime, refresh }
}
