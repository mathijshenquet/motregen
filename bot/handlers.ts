import type { TelegramApi, TelegramMessage, TelegramUpdate } from './api.js'
import type { BotConfig } from './config.js'
import type { RenderedStill, StillRenderer } from './render.js'
import { cacheKey, keyboard, matchingModes, parseCallback, STILL_MODES, type StillManifest, type StillSelection } from './stills.js'

export interface BotRuntime {
  api: TelegramApi
  config: BotConfig
  renderer: StillRenderer
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
      text: 'Regen en weer voor Nederland en Vlaanderen. Open de app voor jouw plek, of gebruik /regen, /lucht, /gevoel en /wind voor een weerkaart. Inline: @' + runtime.username + ' wind.',
      reply_markup: { inline_keyboard: [[useLaunch ? launch : link]] },
    })
    return
  }
  const definition = STILL_MODES.find((entry) => entry.command === command)
  if (!definition) return
  const manifest = await runtime.currentManifest()
  const selection: StillSelection = { mode: definition.mode, hour: 0 }
  const still = await runtime.renderer.render(selection, manifest)
  const reply = await runtime.api.uploadPhoto({
    chat_id: message.chat.id,
    caption: still.caption,
    reply_markup: keyboard(selection, still.epoch, runtime.config.origin, runtime.username, message.chat.type === 'private'),
  }, still.path)
  console.info(JSON.stringify({ event: 'chat-still', messageId: reply.message_id, milliseconds: still.milliseconds, cached: still.cached }))
}

async function handleInline(query: NonNullable<TelegramUpdate['inline_query']>, runtime: BotRuntime): Promise<void> {
  const results = []
  for (const mode of matchingModes(query.query)) {
    const selection: StillSelection = { mode, hour: 0 }
    const still = runtime.availableStill(selection)
    if (!still) continue
    const definition = STILL_MODES.find((entry) => entry.mode === mode)!
    results.push({
      type: 'photo',
      id: new URL(still.url).pathname.split('/').at(-1)!.replace('.jpg', ''),
      photo_url: still.url,
      thumbnail_url: still.url,
      photo_width: 1800,
      photo_height: 2400,
      title: definition.label,
      description: still.caption,
      caption: still.caption,
      reply_markup: keyboard(selection, still.epoch, runtime.config.origin, runtime.username),
    })
  }
  await runtime.api.call('answerInlineQuery', { inline_query_id: query.id, results, cache_time: 5 })
}

async function handleCallback(query: NonNullable<TelegramUpdate['callback_query']>, runtime: BotRuntime): Promise<void> {
  const selection = parseCallback(query.data)
  await runtime.api.call('answerCallbackQuery', { callback_query_id: query.id, text: selection ? undefined : 'Deze knop is niet meer geldig.' })
  if (!selection || (!query.inline_message_id && !query.message)) return
  const manifest = await runtime.currentManifest()
  const still = await runtime.renderer.render(selection, manifest)
  const markup = keyboard(selection, still.epoch, runtime.config.origin, runtime.username, !query.inline_message_id && query.message?.chat.type === 'private')
  const media = { type: 'photo', media: query.inline_message_id ? still.url : 'attach://photo', caption: still.caption }
  if (query.inline_message_id) {
    await runtime.api.call('editMessageMedia', { inline_message_id: query.inline_message_id, media, reply_markup: markup })
  } else {
    await runtime.api.upload('editMessageMedia', {
      chat_id: query.message!.chat.id,
      message_id: query.message!.message_id,
      media,
      reply_markup: markup,
    }, still.path)
  }
  console.info(JSON.stringify({ event: 'still-edit', mode: selection.mode, hour: selection.hour, milliseconds: still.milliseconds, cached: still.cached, key: cacheKey(selection, manifest) }))
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
