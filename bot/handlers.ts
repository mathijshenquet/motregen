import { TelegramApiError, type TelegramApi, type TelegramMessage, type TelegramUpdate } from './api.js'
import { FRAME_PIXELS, type BotConfig } from './config.js'
import type { RenderedMedia } from './render.js'
import type { StillPhotos } from './photos.js'
import type { FileIdCache } from './file-ids.js'
import { MediaUnavailableError, REGISTER_NOTICE } from './register.js'
import type { PlaceWeather } from './place-weather.js'
import type { SearchPlace } from '../web/src/core/place-search.js'
import type { MessageSelections } from './selections.js'
import { cacheKey, keyboard, matchingModes, modeForCommand, parseCallback, LOOP_MODES, STILL_MINUTES, type MediaSelection, type StillManifest } from './stills.js'

export interface BotRuntime {
  api: TelegramApi
  config: BotConfig
  renderer: { render(selection: MediaSelection, manifest: StillManifest): Promise<RenderedMedia> }
  photos: Pick<StillPhotos, 'send' | 'edit'> & { fileIds: Pick<FileIdCache, 'get'> }
  selections: MessageSelections
  username: string
  weather?: PlaceWeather
  currentManifest(): Promise<StillManifest>
  manifestForGeneration?(generated: number): StillManifest | undefined
  availableStill(selection: MediaSelection): RenderedMedia | undefined
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
  try {
    await dispatchUpdate(update, runtime)
  } catch (error) {
    if (!(error instanceof MediaUnavailableError)) throw error
    if (update.callback_query) await answerCallback(runtime, update.callback_query.id, error.message)
    else if (update.inline_query) await runtime.api.call('answerInlineQuery', { inline_query_id: update.inline_query.id, results: [], cache_time: 5 })
    else if (update.message) await runtime.api.call('sendMessage', { chat_id: update.message.chat.id, text: error.message })
  }
}

async function dispatchUpdate(update: TelegramUpdate, runtime: BotRuntime): Promise<void> {
  if (update.callback_query) {
    await handleCallback(update.callback_query, runtime)
    return
  }
  if (update.inline_query) {
    await handleInline(update.inline_query, runtime)
    return
  }
  if (update.message?.text) {
    try {
      await handleCommand(update.message, runtime)
    } catch (error) {
      if (!(error instanceof TelegramApiError) || !error.invalidFile) throw error
      await runtime.api.call('sendMessage', { chat_id: update.message.chat.id, text: 'Beeld kon niet laden, probeer opnieuw' })
      console.info(JSON.stringify({ event: 'media-unavailable', description: error.description }))
    }
  }
}

export function startText(username: string): string {
  return 'motregen.nl -- Regenradar en Weersverwachting\n/weer amsterdam toont wolken en regen voor die plek; /regen ams werkt ook. /regen, /temperatuur (of /hitte) en /wind geven een bewegende kaart; met de knoppen eronder kies je een stilstaand moment. Inline: @' + username + ' regen.'
}

async function handleCommand(message: TelegramMessage, runtime: BotRuntime): Promise<void> {
  const commandMatch = /^\/(\w+)(?:@([\w]+))?(?:\s|$)/.exec(message.text ?? '')
  if (!commandMatch) return
  if (commandMatch[2] && commandMatch[2].toLowerCase() !== runtime.username.toLowerCase()) return
  const command = commandMatch[1]!.toLowerCase()
  const argument = message.text!.slice(commandMatch[0].length).trim().slice(0, 200)
  if (command === 'weer' || command === 'regen' && argument) {
    if (!runtime.weather) return
    const found = await runtime.weather.places.find(argument)
    if (found.place) await sendPlaceWeather(message.chat.id, found.place, runtime)
    else await runtime.api.call('sendMessage', {
      chat_id: message.chat.id,
      text: argument ? 'Welke plaats bedoel je?' : 'Voor welke plaats wil je het weer zien?',
      reply_markup: { inline_keyboard: found.suggestions.map((place) => [runtime.weather!.places.button(place)]) },
    })
    return
  }
  if (command === 'start') {
    const launch = { text: 'Open motregen.nl', web_app: { url: `${runtime.config.origin}/?tg=1` } }
    const link = { text: 'Open motregen.nl', url: `https://t.me/${runtime.username}?startapp` }
    // Telegram accepteert web_app-URL's alleen over https; bij een http-dev-origin blijft de t.me-link over.
    const useLaunch = message.chat.type === 'private' && runtime.config.origin.startsWith('https:')
    await runtime.api.call('sendMessage', {
      chat_id: message.chat.id,
      text: startText(runtime.username),
      reply_markup: { inline_keyboard: [[useLaunch ? launch : link]] },
    })
    return
  }
  if (command === 'regen_rich') {
    await sendRainSlideshow(message, runtime)
    return
  }
  const mode = modeForCommand(command!)
  if (!mode) return
  const manifest = await runtime.currentManifest()
  // Elk commando antwoordt met de bewegende kaart (PO 2026-10-07, U58); de tijdknoppen eronder geven een
  // stilstaand beeld van dat moment.
  const selection: MediaSelection = { mode, hour: 'loop' }
  const still = await runtime.renderer.render(selection, manifest)
  const reply = await runtime.photos.send(still, {
    chat_id: message.chat.id,
    caption: still.caption,
    reply_markup: keyboard(selection, still.epoch, still.generated),
  })
  runtime.selections.remember(`chat:${message.chat.id}:${reply.message_id}`, still.key)
  console.info(JSON.stringify({ event: 'chat-still', messageId: reply.message_id, milliseconds: still.milliseconds, cached: still.cached }))
}

async function handleInline(query: NonNullable<TelegramUpdate['inline_query']>, runtime: BotRuntime): Promise<void> {
  const results = []
  const loopsOnly = /^loop(?:\s|$)/i.test(query.query.trim())
  const filter = loopsOnly ? query.query.trim().replace(/^loop\s*/i, '') : query.query
  for (const mode of matchingModes(filter)) {
    const loopSelection: MediaSelection = { mode, hour: 'loop' }
    const loop = runtime.availableStill(loopSelection)
    const loopFileId = loop ? await runtime.photos.fileIds.get(loop) : undefined
    const definition = LOOP_MODES.find((entry) => entry.mode === mode)!
    if (loop && loopFileId) results.push({
      type: 'mpeg4_gif', id: loop.key, mpeg4_file_id: loopFileId,
      title: `${definition.label} · Loop`, caption: loop.caption,
      parse_mode: 'HTML',
      reply_markup: keyboard(loopSelection, loop.epoch, loop.generated),
    })
    if (loopsOnly || mode === 'wind') continue
    const selection: MediaSelection = { mode, hour: 0 }
    const still = runtime.availableStill(selection)
    if (!still) continue
    const fileId = await runtime.photos.fileIds.get(still)
    if (!fileId && (runtime.config.role === 'poller' || !runtime.config.origin.startsWith('https:'))) continue
    results.push({
      type: 'photo',
      id: still.key,
      ...(fileId ? { photo_file_id: fileId } : { photo_url: still.url, thumbnail_url: still.url, photo_width: FRAME_PIXELS.width, photo_height: FRAME_PIXELS.height }),
      title: definition.label,
      description: definition.label,
      caption: still.caption,
      parse_mode: 'HTML',
      reply_markup: keyboard(selection, still.epoch, still.generated),
    })
  }
  await runtime.api.call('answerInlineQuery', { inline_query_id: query.id, results, cache_time: 5 })
}

async function handleCallback(query: NonNullable<TelegramUpdate['callback_query']>, runtime: BotRuntime): Promise<void> {
  if (query.data?.startsWith('weer:')) {
    const place = runtime.weather?.places.fromCallback(query.data)
    if (!place || !query.message) {
      await answerCallback(runtime, query.id, 'Verlopen, stuur /weer opnieuw')
      return
    }
    await answerCallback(runtime, query.id)
    await sendPlaceWeather(query.message.chat.id, place, runtime)
    return
  }
  const started = performance.now()
  const requested = parseCallback(query.data)
  if (!requested || (!query.inline_message_id && !query.message)) {
    await answerCallback(runtime, query.id, 'Verlopen, stuur /regen opnieuw')
    return
  }
  const message = query.inline_message_id ? `inline:${query.inline_message_id}` : `chat:${query.message!.chat.id}:${query.message!.message_id}`
  if (runtime.selections.has(message, 'expired')) {
    await answerCallback(runtime, query.id, 'Verlopen, stuur /regen opnieuw')
    return
  }
  const current = await runtime.currentManifest()
  let manifest = requested.generated === undefined || requested.generated === Date.parse(current.generated) ? current : runtime.manifestForGeneration?.(requested.generated)
  const fallback = !manifest && runtime.config.role === 'poller'
  if (fallback) manifest = current
  if (!manifest) {
    await answerCallback(runtime, query.id, 'Verlopen, stuur /regen opnieuw')
    return
  }
  let selection: MediaSelection
  if (requested.hour === 'at') {
    let minute = Math.round((requested.epoch - Date.parse(manifest.now)) / 60_000)
    if (fallback) minute = Math.max(STILL_MINUTES[0]!, Math.min(STILL_MINUTES.at(-1)!, Math.round(minute / 10) * 10))
    if (!STILL_MINUTES.includes(minute)) {
      await answerCallback(runtime, query.id, 'Verlopen, stuur /regen opnieuw')
      return
    }
    selection = { mode: requested.mode, hour: minute / 60 }
  } else if (requested.hour === 'loop') selection = { mode: requested.mode, hour: 'loop' }
  else selection = { mode: requested.mode, hour: requested.hour }
  const key = cacheKey(selection, manifest)
  if (runtime.selections.has(message, key)) {
    await answerCallback(runtime, query.id, 'Al in beeld')
    console.info(JSON.stringify({ event: 'still-no-op', mode: selection.mode, hour: selection.hour }))
    return
  }
  const target = query.inline_message_id ? { inline_message_id: query.inline_message_id } : {
    chat_id: query.message!.chat.id,
    message_id: query.message!.message_id,
  }
  try {
    const still = await runtime.renderer.render(selection, manifest)
    if (fallback) still.caption += `\n${REGISTER_NOTICE}`
    const result = await runtime.photos.edit(still, {
      ...target,
      reply_markup: keyboard(selection, still.epoch, still.generated),
    })
    runtime.selections.remember(message, still.key)
    await answerCallback(runtime, query.id, fallback || still.generated !== manifest.generated ? REGISTER_NOTICE : undefined)
    console.info(JSON.stringify({ event: 'still-edit', mode: selection.mode, hour: selection.hour, milliseconds: still.milliseconds, callbackMs: Math.round(performance.now() - started), cached: still.cached, fileIdCached: result.fileIdCached, key }))
  } catch (error) {
    if (error instanceof TelegramApiError && error.messageUnavailable) {
      runtime.selections.remember(message, 'expired')
      await answerCallback(runtime, query.id, 'Verlopen, stuur /regen opnieuw')
      console.info(JSON.stringify({ event: 'message-expired', mode: selection.mode, description: error.description }))
    } else if (error instanceof TelegramApiError && error.notModified) {
      runtime.selections.remember(message, key)
      await answerCallback(runtime, query.id, 'Al in beeld')
      console.info(JSON.stringify({ event: 'still-no-op', mode: selection.mode, hour: selection.hour }))
    } else if (error instanceof TelegramApiError && error.invalidFile) {
      await answerCallback(runtime, query.id, 'Beeld kon niet laden, probeer opnieuw')
      console.info(JSON.stringify({ event: 'media-unavailable', mode: selection.mode, description: error.description }))
    } else {
      await answerCallback(runtime, query.id)
      throw error
    }
  }
}

async function answerCallback(runtime: BotRuntime, id: string, text?: string): Promise<void> {
  try {
    await runtime.api.call('answerCallbackQuery', { callback_query_id: id, text })
  } catch (error) {
    if (!(error instanceof TelegramApiError) || !error.callbackExpired) throw error
    console.info(JSON.stringify({ event: 'callback-expired', description: error.description }))
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
      { command: 'weer', description: 'Wolken en regen voor een plaats: /weer ams' },
      ...LOOP_MODES.flatMap((entry) => [
        { command: entry.command, description: `${entry.label} als bewegende kaart` },
        ...entry.listed.map((alias) => ({ command: alias, description: `Zelfde als /${entry.command}` })),
      ]),
    ],
  })
}

async function sendPlaceWeather(chatId: number, place: SearchPlace, runtime: BotRuntime): Promise<void> {
  const weather = runtime.weather!
  const result = await weather.renderer.render(place)
  const replyMarkup = { inline_keyboard: [[{ text: 'Open in de app', url: result.url }]] }
  if (result.media) await weather.photos.send(result.media, { chat_id: chatId, caption: result.caption, reply_markup: replyMarkup })
  else await runtime.api.call('sendMessage', { chat_id: chatId, text: result.caption, parse_mode: 'HTML', reply_markup: replyMarkup })
  console.info(JSON.stringify({ event: 'chat-weather', milliseconds: Math.round(result.milliseconds), cached: result.cached, image: Boolean(result.media) }))
}

// Proef (PO 2026-10-09): één rich message met de regen-stills als slideshow (Bot API 10.2, InputRichBlockSlideshow),
// uit de bestaande file_id-cache; nog zonder knoppen of klokonderschrift.
async function sendRainSlideshow(message: TelegramMessage, runtime: BotRuntime): Promise<void> {
  const manifest = await runtime.currentManifest()
  const slides: Array<{ type: 'photo'; photo: { type: 'photo'; media: string } }> = []
  for (const minute of STILL_MINUTES.filter((candidate) => [-60, -30, -10, 0, 10, 30, 60].includes(candidate))) {
    const still = await runtime.renderer.render({ mode: 'weather', hour: minute / 60 }, manifest)
    const fileId = await runtime.photos.fileIds.get(still)
    if (fileId) slides.push({ type: 'photo', photo: { type: 'photo', media: fileId } })
  }
  if (!slides.length) {
    await runtime.api.call('sendMessage', { chat_id: message.chat.id, text: 'Nog geen regenbeelden in de cache; probeer het over een paar minuten.' })
    return
  }
  const reply = await runtime.api.call<{ message_id: number }>('sendRichMessage', {
    chat_id: message.chat.id,
    rich_message: { blocks: [{ type: 'slideshow', blocks: slides }] },
  })
  console.info(JSON.stringify({ event: 'chat-rich-slideshow', messageId: reply.message_id, slides: slides.length }))
}
