import { TelegramApi, type TelegramUpdate } from './api.js'
import { readConfig, validateCacheChat } from './config.js'
import { setTimeout as delay } from 'node:timers/promises'
import { FileIdCache } from './file-ids.js'
import { StillPhotos } from './photos.js'
import { startText } from './handlers.js'
import { StillRenderer, StillRenderError, type RenderedMedia } from './render.js'
import { keyboard, PREWARM_HOURS, STILL_HOURS, LOOP_MODES } from './stills.js'

async function smoke(): Promise<void> {
  const config = readConfig()
  const renderer = new StillRenderer(config.origin, config.cacheDirectory, config.frame)
  try {
    const manifest = await renderer.manifest()
    if (process.argv.includes('--render-only')) {
      const modeFilter = process.argv.find((argument) => argument.startsWith('--mode='))?.slice(7)
      for (const definition of LOOP_MODES) {
        if (modeFilter && modeFilter !== definition.mode) continue
        const loop = await renderer.render({ mode: definition.mode, hour: 'loop' }, manifest)
        console.info(JSON.stringify({ event: 'loop-render-receipt', mode: definition.mode, path: loop.path, frames: loop.frames, fps: loop.fps, renderMs: loop.renderMs, encodeMs: loop.encodeMs, bytes: loop.bytes, cached: loop.cached }))
        if (definition.mode === 'wind') continue
        const hours = process.argv.includes('--matrix') ? STILL_HOURS : [0] as const
        for (const hour of hours) {
          const still = await renderer.render({ mode: definition.mode, hour }, manifest)
          console.info(JSON.stringify({ event: 'render-receipt', mode: definition.mode, hour, path: still.path, milliseconds: still.milliseconds, cached: still.cached }))
        }
      }
      return
    }
    const api = new TelegramApi(config.token)
    const identity = await api.call<{ id: number; username: string }>('getMe')
    await validateCacheChat(api, config.cacheChatId, identity.id)
    const photos = new StillPhotos(api, new FileIdCache(identity.username), config.cacheChatId, config.cacheDirectory)
    const webhook = await api.call<{ url: string }>('getWebhookInfo')
    if (webhook.url) throw new Error('Webhook geconfigureerd')
    const updates = process.env.MOTREGEN_SMOKE_CHAT_ID ? [] : await api.call<TelegramUpdate[]>('getUpdates', { timeout: 0, allowed_updates: ['message'] })
    const start = updates.findLast((update) => update.message?.chat.type === 'private' && update.message.text === '/start')
    const chatId = process.env.MOTREGEN_SMOKE_CHAT_ID ?? start?.message?.chat.id
    if (!chatId) throw new Error('Geen rooktestchat: stuur /start of zet MOTREGEN_SMOKE_CHAT_ID')
    if (!config.cacheChatId) throw new Error('MOTREGEN_CACHE_CHAT_ID ontbreekt voor de matrixrooktest')
    const matrixStarted = performance.now()
    const batches = await Promise.all(LOOP_MODES.map(async (definition) => {
      const media: RenderedMedia[] = [await renderer.render({ mode: definition.mode, hour: 'loop' }, manifest)]
      if (definition.mode !== 'wind') for (const hour of PREWARM_HOURS) media.push(await renderer.render({ mode: definition.mode, hour }, manifest))
      return media
    }))
    const matrix = batches.flat()
    const primeStarted = performance.now()
    await photos.primeGeneration(matrix)
    console.info(JSON.stringify({ event: 'matrix-primed', count: matrix.length, generated: manifest.generated, renderMs: Math.round(primeStarted - matrixStarted), primeMs: Math.round(performance.now() - primeStarted), milliseconds: Math.round(performance.now() - matrixStarted) }))
    // De renderer mag localhost gebruiken; Telegram-knoppen vereisen een publieke HTTPS-URL.
    const buttonOrigin = config.origin.startsWith('https://') ? config.origin : 'https://motregen.nl'
    await api.call('sendMessage', {
      chat_id: chatId,
      text: startText(identity.username),
      reply_markup: { inline_keyboard: [[{ text: 'Open motregen.nl', web_app: { url: `${buttonOrigin}/?tg=1` } }]] },
    })
    const first = await renderer.render({ mode: 'weather', hour: 0 }, manifest)
    const message = await photos.send(first, {
      chat_id: chatId,
      caption: first.caption,
      reply_markup: keyboard({ mode: 'weather', hour: 0 }, first.epoch, first.generated),
    })
    const next = await renderer.render({ mode: 'feels', hour: 1 / 6 }, manifest)
    if (!await photos.fileIds.get(next)) throw new Error('Eerste selectie is niet vooraf geprimed')
    const firstEditStarted = performance.now()
    const edited = await photos.edit(next, {
      chat_id: chatId,
      message_id: message.message_id,
      reply_markup: keyboard({ mode: 'feels', hour: 1 / 6 }, next.epoch, next.generated),
    })
    const firstEditMs = Math.round(performance.now() - firstEditStarted)
    if (!edited.fileIdCached) throw new Error('Eerste edit gebruikt geen matrix-file_id')
    await delay(1100)
    await photos.edit(first, { chat_id: chatId, message_id: message.message_id, reply_markup: keyboard({ mode: 'weather', hour: 0 }, first.epoch, first.generated) })
    await delay(1100)
    const cachedStarted = performance.now()
    const cachedEdit = await photos.edit(next, { chat_id: chatId, message_id: message.message_id, reply_markup: keyboard({ mode: 'feels', hour: 1 / 6 }, next.epoch, next.generated) })
    const cachedMs = Math.round(performance.now() - cachedStarted)
    if (!cachedEdit.fileIdCached) throw new Error('file_id niet hergebruikt')
    await api.call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'motregen.nl', web_app: { url: `${buttonOrigin}/?tg=1` } } })
    console.info(JSON.stringify({ event: 'telegram-smoke', messageId: message.message_id, firstEditMs, cachedMs, firstEditFileIdCached: edited.fileIdCached, fileIdCached: cachedEdit.fileIdCached, generated: manifest.generated }))
    const lazy = await renderer.render({ mode: 'feels', hour: 1 / 3 }, manifest)
    if (await photos.fileIds.get(lazy)) throw new Error('Luie selectie is onverwacht vooraf geüpload')
    const lazyStarted = performance.now()
    await photos.edit(lazy, { chat_id: chatId, message_id: message.message_id, reply_markup: keyboard({ mode: 'feels', hour: 1 / 3 }, lazy.epoch, lazy.generated) })
    const lazyMs = Math.round(performance.now() - lazyStarted)
    const lazyId = await photos.fileIds.get(lazy)
    if (!lazyId) throw new Error('Luie selectie heeft geen file_id gekregen')
    await delay(1100)
    await photos.edit(first, { chat_id: chatId, message_id: message.message_id })
    await delay(1100)
    const repeatStarted = performance.now()
    await photos.edit(lazy, { chat_id: chatId, message_id: message.message_id, reply_markup: keyboard({ mode: 'feels', hour: 1 / 3 }, lazy.epoch, lazy.generated) })
    if (await photos.fileIds.get(lazy) !== lazyId) throw new Error('Luie selectie is opnieuw geüpload')
    console.info(JSON.stringify({ event: 'lazy-still-smoke', hour: 1 / 3, encodeMs: lazy.milliseconds, firstEditMs: lazyMs, cachedMs: Math.round(performance.now() - repeatStarted) }))
    for (const definition of LOOP_MODES) {
      const selection = { mode: definition.mode, hour: 'loop' } as const
      const loop = await renderer.render(selection, manifest)
      await delay(1100)
      const started = performance.now()
      const animation = await photos.send(loop, { chat_id: chatId, caption: loop.caption, reply_markup: keyboard(selection, loop.epoch, loop.generated) })
      const sendMs = Math.round(performance.now() - started)
      await delay(1100)
      await photos.edit(first, { chat_id: chatId, message_id: animation.message_id, reply_markup: keyboard({ mode: 'weather', hour: 0 }, first.epoch, first.generated) })
      await delay(1100)
      const editStarted = performance.now()
      const result = await photos.edit(loop, { chat_id: chatId, message_id: animation.message_id, reply_markup: keyboard(selection, loop.epoch, loop.generated) })
      if (!result.fileIdCached) throw new Error('Animation-file_id niet hergebruikt')
      console.info(JSON.stringify({ event: 'loop-smoke', mode: definition.mode, frames: loop.frames, renderMs: loop.renderMs, encodeMs: loop.encodeMs, bytes: loop.bytes, sendMs, editMs: Math.round(performance.now() - editStarted), fileIdCached: true, generated: manifest.generated }))
    }
  } finally {
    await renderer.close()
  }
}

void smoke().catch((error) => {
  if (error instanceof StillRenderError) console.error(JSON.stringify({ event: 'render-failed', mode: error.mode, phase: error.phase, frame: error.frame, timeout: error.timeout }))
  else console.error(error instanceof Error && !error.message.includes('http') ? error.message : 'Rooktest mislukt')
  process.exitCode = 1
})
