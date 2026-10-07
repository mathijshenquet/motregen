import { TelegramApiError, type TelegramApi, type TelegramMessage, type TelegramUpdate } from './api.js'
import type { BotConfig } from './config.js'
import type { RenderedStill, StillRenderer } from './render.js'
import type { StillPhotos } from './photos.js'
import type { MessageSelections } from './selections.js'
import { cacheKey, keyboard, matchingModes, parseCallback, STILL_MODES, type StillManifest, type StillSelection } from './stills.js'

export interface BotRuntime {
  api: TelegramApi
  config: BotConfig
  renderer: StillRenderer
  photos: StillPhotos
  selections: MessageSelections
  username: string
  currentManifest(): Promise<StillManifest>
  availableStill(selection: StillSelection): RenderedStill | undefined
}

/** Alleen voor een poke-test door de PO: logt wat één opgegeven chat doet. Nooit in productie gezet. */
const debugChatId = process.env.MOTREGEN_DEBUG_CHAT_ID?.trim()

function logDebugChat(update: TelegramUpdate): void {
  if (!debugChatId) return
  const chatId = update.message?.chat.id ?? update.callback_query?.message?.chat.id ?? update.callback_query?.from?.id ?? update.inline_query?.from?.id
  if (String(chatId) !== debugChatId) return
  const action = update.message?.text !== undefined ? { kind: 'message', text: update.message.text }
    : update.callback_query ? { kind: 'callback', data: update.callback_query.data }
    : update.inline_query ? { kind: 'inline', query: update.inline_query.query }
    : { kind: 'other' }
  console.info(JSON.stringify({ event: 'debug-chat', ...action }))
}

export async function handleUpdate(update: TelegramUpdate, runtime: BotRuntime): Promise<void> {
  logDebugChat(update)
  if (update.callback_query) {
    await handleCallback(update.callback_query, runtime)
    return
  }
  if (update.inline_query) {
    await handleInline(update.inline_query, runtime)
    return
  }
  if (update.message?.text) await handleCommand(update.message, runtime)
}

async function handleCommand(message: TelegramMessage, runtime: BotRuntime): Promise<void> {
  const commandMatch = /^\/(\w+)(?:@([\w]+))?(?:\s|$)/.exec(message.text ?? '')
  if (!commandMatch) return
  if (commandMatch[2] && commandMatch[2].toLowerCase() !== runtime.username.toLowerCase()) return
  const command = commandMatch[1]
  if (command === 'start') {
    const launch = { text: 'Open motregen.nl', web_app: { url: `${runtime.config.origin}/?tg=1` } }
    const link = { text: 'Open motregen.nl', url: `https://t.me/${runtime.username}?startapp` }
    // Telegram accepteert web_app-URL's alleen over https; bij een http-dev-origin blijft de t.me-link over.
    const useLaunch = message.chat.type === 'private' && runtime.config.origin.startsWith('https:')
    await runtime.api.call('sendMessage', {
      chat_id: message.chat.id,
      text: 'Regen en weer voor Nederland en Vlaanderen. Open de app voor jouw plek, of gebruik /regen, /lucht en /gevoel voor een weerkaart. Inline: @' + runtime.username + ' regen.',
      reply_markup: { inline_keyboard: [[useLaunch ? launch : link]] },
    })
    return
  }
  const definition = STILL_MODES.find((entry) => entry.command === command)
  if (!definition) return
  const manifest = await runtime.currentManifest()
  const selection: StillSelection = { mode: definition.mode, hour: 0 }
  const still = await runtime.renderer.render(selection, manifest)
  const reply = await runtime.photos.send(still, {
    chat_id: message.chat.id,
    caption: still.caption,
    reply_markup: keyboard(selection, still.epoch, runtime.config.origin, runtime.username, message.chat.type === 'private'),
  })
  runtime.selections.remember(`chat:${message.chat.id}:${reply.message_id}`, still.key)
  console.info(JSON.stringify({ event: 'chat-still', messageId: reply.message_id, milliseconds: still.milliseconds, cached: still.cached }))
}

async function handleInline(query: NonNullable<TelegramUpdate['inline_query']>, runtime: BotRuntime): Promise<void> {
  const results = []
  for (const mode of matchingModes(query.query)) {
    const selection: StillSelection = { mode, hour: 0 }
    const still = runtime.availableStill(selection)
    if (!still) continue
    const fileId = await runtime.photos.fileIds.get(still)
    if (!fileId && !runtime.config.origin.startsWith('https:')) continue
    const definition = STILL_MODES.find((entry) => entry.mode === mode)!
    results.push({
      type: 'photo',
      id: still.key,
      ...(fileId ? { photo_file_id: fileId } : { photo_url: still.url, thumbnail_url: still.url, photo_width: 960, photo_height: 1272 }),
      title: definition.label,
      description: still.caption,
      caption: still.caption,
      reply_markup: keyboard(selection, still.epoch, runtime.config.origin, runtime.username),
    })
  }
  await runtime.api.call('answerInlineQuery', { inline_query_id: query.id, results, cache_time: 5 })
}

async function handleCallback(query: NonNullable<TelegramUpdate['callback_query']>, runtime: BotRuntime): Promise<void> {
  const started = performance.now()
  const selection = parseCallback(query.data)
  if (!selection || (!query.inline_message_id && !query.message)) {
    await runtime.api.call('answerCallbackQuery', { callback_query_id: query.id, text: 'Deze knop is niet meer geldig.' })
    return
  }
  const manifest = await runtime.currentManifest()
  const key = cacheKey(selection, manifest)
  const message = query.inline_message_id ? `inline:${query.inline_message_id}` : `chat:${query.message!.chat.id}:${query.message!.message_id}`
  if (runtime.selections.has(message, key)) {
    await runtime.api.call('answerCallbackQuery', { callback_query_id: query.id, text: 'Al in beeld' })
    console.info(JSON.stringify({ event: 'still-no-op', mode: selection.mode, hour: selection.hour }))
    return
  }
  await runtime.api.call('answerCallbackQuery', { callback_query_id: query.id })
  const still = await runtime.renderer.render(selection, manifest)
  const markup = keyboard(selection, still.epoch, runtime.config.origin, runtime.username, !query.inline_message_id && query.message?.chat.type === 'private')
  const target = query.inline_message_id ? { inline_message_id: query.inline_message_id } : {
    chat_id: query.message!.chat.id,
    message_id: query.message!.message_id,
  }
  try {
    const result = await runtime.photos.edit(still, {
      ...target,
      reply_markup: markup,
    })
    runtime.selections.remember(message, key)
    console.info(JSON.stringify({ event: 'still-edit', mode: selection.mode, hour: selection.hour, milliseconds: still.milliseconds, callbackMs: Math.round(performance.now() - started), cached: still.cached, fileIdCached: result.fileIdCached, key }))
  } catch (error) {
    if (!(error instanceof TelegramApiError) || !error.notModified) throw error
    runtime.selections.remember(message, key)
    await runtime.api.call('answerCallbackQuery', { callback_query_id: query.id, text: 'Al in beeld' })
    console.info(JSON.stringify({ event: 'still-no-op', mode: selection.mode, hour: selection.hour }))
  }
}

export async function configureBot(runtime: BotRuntime): Promise<void> {
  // De Mini App-menuknop vereist een https-origin; een http-dev-origin laat de bestaande knop staan.
  if (runtime.config.origin.startsWith('https:')) {
    await runtime.api.call('setChatMenuButton', { menu_button: { type: 'web_app', text: 'motregen.nl', web_app: { url: `${runtime.config.origin}/?tg=1` } } })
  }
  await runtime.api.call('setMyCommands', {
    commands: [
      { command: 'start', description: 'Open de motregen Mini App' },
      ...STILL_MODES.map((entry) => ({ command: entry.command, description: entry.label })),
    ],
  })
}
