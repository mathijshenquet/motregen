import { TelegramApi, type TelegramMessage, type TelegramUpdate } from './api.js'
import { readConfig } from './config.js'
import { setTimeout as delay } from 'node:timers/promises'
import { FileIdCache } from './file-ids.js'
import { StillPhotos } from './photos.js'
import { StillRenderer } from './render.js'
import { keyboard, STILL_HOURS, STILL_MODES } from './stills.js'

async function smoke(): Promise<void> {
  const config = readConfig()
  const renderer = new StillRenderer(config.origin, config.cacheDirectory)
  try {
    const manifest = await renderer.manifest()
    if (process.argv.includes('--render-only')) {
      const hours = process.argv.includes('--matrix') ? STILL_HOURS : [0] as const
      for (const hour of hours) {
        for (const definition of STILL_MODES) {
          const still = await renderer.render({ mode: definition.mode, hour }, manifest)
          console.info(JSON.stringify({ event: 'render-receipt', mode: definition.mode, hour, path: still.path, milliseconds: still.milliseconds, cached: still.cached }))
        }
      }
      return
    }
    const api = new TelegramApi(config.token)
    const identity = await api.call<{ username: string }>('getMe')
    const photos = new StillPhotos(api, new FileIdCache(identity.username))
    const webhook = await api.call<{ url: string }>('getWebhookInfo')
    if (webhook.url) throw new Error('Webhook geconfigureerd')
    const updates = process.env.MOTREGEN_SMOKE_CHAT_ID ? [] : await api.call<TelegramUpdate[]>('getUpdates', { timeout: 0, allowed_updates: ['message'] })
    const start = updates.findLast((update) => update.message?.chat.type === 'private' && update.message.text === '/start')
    const chatId = process.env.MOTREGEN_SMOKE_CHAT_ID ?? start?.message?.chat.id
    if (!chatId) throw new Error('Geen rooktestchat: stuur /start of zet MOTREGEN_SMOKE_CHAT_ID')
    // De renderer mag localhost gebruiken; Telegram-knoppen vereisen een publieke HTTPS-URL.
    const buttonOrigin = config.origin.startsWith('https://') ? config.origin : 'https://motregen.nl'
    await api.call('sendMessage', {
      chat_id: chatId,
      text: 'Regen en weer voor Nederland en Vlaanderen. Open de app voor jouw plek; /regen, /lucht en /gevoel geven een weerkaart.',
      reply_markup: { inline_keyboard: [[{ text: 'Open motregen.nl', web_app: { url: `${buttonOrigin}/?tg=1` } }]] },
    })
    const first = await renderer.render({ mode: 'weather', hour: 0 }, manifest)
    const message = await photos.send(first, {
      chat_id: chatId,
      caption: first.caption,
      reply_markup: keyboard({ mode: 'weather', hour: 0 }, first.epoch, buttonOrigin, identity.username, true),
    })
    const next = await renderer.render({ mode: 'air', hour: 3 }, manifest)
    const uploadStarted = performance.now()
    const edited = await api.upload<TelegramMessage>('editMessageMedia', {
      chat_id: chatId,
      message_id: message.message_id,
      media: { type: 'photo', media: 'attach://photo', caption: next.caption },
      reply_markup: keyboard({ mode: 'air', hour: 3 }, next.epoch, buttonOrigin, identity.username, true),
    }, next.path)
    const uploadMs = Math.round(performance.now() - uploadStarted)
    await photos.fileIds.remember(next, edited)
    if (edited.message_id !== message.message_id) throw new Error('Bericht-id gewijzigd bij edit')
    await delay(1100)
    await photos.edit(first, { chat_id: chatId, message_id: message.message_id, reply_markup: keyboard({ mode: 'weather', hour: 0 }, first.epoch, buttonOrigin, identity.username, true) })
    await delay(1100)
    const cachedStarted = performance.now()
    const cachedEdit = await photos.edit(next, { chat_id: chatId, message_id: message.message_id, reply_markup: keyboard({ mode: 'air', hour: 3 }, next.epoch, buttonOrigin, identity.username, true) })
    const cachedMs = Math.round(performance.now() - cachedStarted)
    if (!cachedEdit.fileIdCached) throw new Error('file_id niet hergebruikt')
    await api.call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'motregen.nl', web_app: { url: `${buttonOrigin}/?tg=1` } } })
    console.info(JSON.stringify({ event: 'telegram-smoke', messageId: message.message_id, editedMessageId: edited.message_id, firstRenderMs: first.milliseconds, editRenderMs: next.milliseconds, uploadMs, cachedMs, fileIdCached: cachedEdit.fileIdCached, generated: manifest.generated }))
  } finally {
    await renderer.close()
  }
}

void smoke().catch((error) => {
  console.error(error instanceof Error && !error.message.includes('http') ? error.message : 'Rooktest mislukt')
  process.exitCode = 1
})
