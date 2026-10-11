import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TelegramApi, TelegramApiError, type TelegramUpdate } from './api.js'
import { FileIdCache } from './file-ids.js'
import { handleUpdate, type BotRuntime } from './handlers.js'
import { StillPhotos } from './photos.js'
import { createPlaceWeather } from './place-weather.js'
import { MessageSelections } from './selections.js'
import type { RenderedMedia, StillRenderer } from './render.js'
import { cacheKey, caption, stillEpoch, type MediaSelection, type StillManifest } from './stills.js'

let directory: string
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'motregen-handlers-')) })
afterEach(async () => { vi.restoreAllMocks(); vi.unstubAllGlobals(); await rm(directory, { recursive: true, force: true }) })

async function setup() {
  let manifest: StillManifest = { version: 0, generated: '2026-10-07T12:00:00Z', now: '2026-10-07T12:00:00Z', chunks: [] }
  let failure: string | undefined
  let failureMethod = 'editMessageMedia'
  const calls: Array<{ method: string; fields: Record<string, unknown>; multipart: boolean }> = []
  const available = new Map<string, RenderedMedia>()
  const render = vi.fn(async (selection: MediaSelection) => {
    const key = cacheKey(selection, manifest)
    const animation = selection.hour === 'loop'
    const path = join(directory, `${key}.${animation ? 'mp4' : 'jpg'}`)
    await writeFile(path, 'jpeg')
    const epoch = animation ? Date.parse(manifest.now) : stillEpoch(manifest, selection.hour)
    const base = { key, path, url: `http://localhost:4365/telegram/stills/${key}.${animation ? 'mp4' : 'jpg'}`, epoch, generated: manifest.generated, caption: caption(selection.mode, epoch), milliseconds: 0, cached: true }
    const still: RenderedMedia = animation ? { ...base, kind: 'animation', frames: 49, fps: 4, bytes: 20000, renderMs: 1000, encodeMs: 100 } : { ...base, kind: 'photo' }
    available.set(`${selection.mode}:${selection.hour}`, still)
    return still
  })
  const request = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    const method = String(url).split('/').at(-1)!
    const multipart = options?.body instanceof FormData
    const fields = multipart ? Object.fromEntries((options!.body as FormData).entries()) : JSON.parse(options!.body as string)
    if (multipart && typeof fields.media === 'string') fields.media = JSON.parse(fields.media)
    calls.push({ method, fields, multipart })
    if (failure && method === failureMethod) return Response.json({ ok: false, error_code: 400, description: failure })
    if (method === 'sendMediaGroup') return Response.json({ ok: true, result: fields.media.map((_media: unknown, index: number) => ({ message_id: 100 + index, chat: { id: Number(fields.chat_id), type: 'private' }, photo: [{ file_id: `album-${calls.length}-${index}` }] })) })
    const animation = method === 'sendAnimation' || fields.media?.type === 'animation'
    const fileId = multipart ? `uploaded-${calls.length}` : fields.photo ?? fields.animation ?? fields.media?.media
    const result = method === 'sendPhoto' || method === 'sendAnimation' || method === 'editMessageMedia'
      ? fields.inline_message_id ? true : { message_id: Number(fields.message_id ?? 10), chat: { id: Number(fields.chat_id), type: 'private' }, ...animation ? { animation: { file_id: fileId } } : { photo: [{ file_id: fileId }] } }
      : true
    return Response.json({ ok: true, result })
  })
  const api = new TelegramApi('test-token', request as typeof fetch)
  const runtime: BotRuntime = {
    api,
    config: { role: 'combined', origin: 'http://localhost:4365', cacheDirectory: directory, token: 'test-token' },
    renderer: { render } as unknown as StillRenderer,
    username: 'motregen_bot',
    photos: new StillPhotos(api, new FileIdCache('motregen_bot')),
    selections: new MessageSelections(),
    currentManifest: async () => manifest,
    availableStill: (selection) => available.get(`${selection.mode}:${selection.hour}`),
  }
  return { runtime, calls, render, renew: () => { manifest = { ...manifest, generated: '2026-10-07T12:05:00Z' } }, fail: (description: string, method = 'editMessageMedia') => { failure = description; failureMethod = method } }
}

function callback(data: string, chatId = 99): TelegramUpdate {
  return { update_id: 2, callback_query: { id: 'callback', data, message: { message_id: 10, chat: { id: chatId, type: 'private' } } } }
}

describe('still delivery and callbacks', () => {
  it('answers a command with the loop, uploads it once and resends the cached Telegram file id', async () => {
    const { runtime, calls } = await setup()
    const command = { update_id: 1, message: { message_id: 1, chat: { id: 99, type: 'private' }, text: '/regen' } }
    await handleUpdate(command, runtime)
    await handleUpdate(command, runtime)
    expect(calls.map((call) => [call.method, call.multipart])).toEqual([['sendAnimation', true], ['sendAnimation', false]])
    expect(calls[1].fields.animation).toBe('uploaded-1')
    // De upload noemt maat en duur, zodat de client de loop even breed toont als een foto van dezelfde maat.
    expect(calls[0].fields).toMatchObject({ width: '960', height: '1272' })
    expect(Number(calls[0].fields.duration)).toBeGreaterThan(0)
  })

  it('answers /temperatuur and its aliases with the feels loop, and ignores the removed /loop', async () => {
    const { runtime, calls, render } = await setup()
    const send = (text: string) => handleUpdate({ update_id: 1, message: { message_id: 1, chat: { id: 99, type: 'private' }, text } }, runtime)
    for (const text of ['/temperatuur', '/hitte', '/gevoel', '/Temperatuur@motregen_bot']) await send(text)
    expect(render.mock.calls.map((call) => call[0])).toEqual(Array.from({ length: 4 }, () => ({ mode: 'feels', hour: 'loop' })))
    expect(calls.every((call) => call.method === 'sendAnimation')).toBe(true)
    // De tijdknoppen onder de loop vragen een stilstaand beeld van dat moment.
    const keyboardRows = JSON.parse(String(calls[0].fields.reply_markup)).inline_keyboard as Array<Array<{ text: string; callback_data: string }>>
    expect(keyboardRows[0].map((button) => button.text)).toEqual(['Regen', '✓ Temperatuur', 'Wind'])
    expect(keyboardRows[1].map((button) => button.text)).toEqual(['−1u', '−10m', 'nu', '+10m', '+1u', '✓ Loop'])
    expect(keyboardRows[1][3].callback_data).toMatch(/^feels:at:\d{13}:\d{13}$/)
    const before = calls.length
    await send('/loop regen')
    await send('/loop')
    expect(calls).toHaveLength(before)
  })

  it('uploads the first edit, reuses its file id, and skips repeated chat and inline selections', async () => {
    const { runtime, calls, render } = await setup()
    await handleUpdate(callback('feels:3'), runtime)
    await handleUpdate(callback('weather:0'), runtime)
    await handleUpdate(callback('feels:3'), runtime)
    const edits = calls.filter((call) => call.method === 'editMessageMedia')
    expect(edits.map((call) => call.multipart)).toEqual([true, true, false])
    expect(edits[2].fields.media).toMatchObject({ media: 'uploaded-1' })
    const previousRenders = render.mock.calls.length
    await handleUpdate(callback('feels:3'), runtime)
    expect(calls.at(-1)).toMatchObject({ method: 'answerCallbackQuery', fields: { text: 'Al in beeld' } })
    expect(render.mock.calls).toHaveLength(previousRenders)
    const inline = { update_id: 3, callback_query: { id: 'inline-callback', data: 'feels:3', inline_message_id: 'inline-message' } }
    await handleUpdate(inline, runtime)
    expect(calls.findLast((call) => call.method === 'editMessageMedia')).toMatchObject({ multipart: false, fields: { inline_message_id: 'inline-message', media: { media: 'uploaded-1' } } })
    await handleUpdate(inline, runtime)
    expect(calls.at(-1)?.fields.text).toBe('Al in beeld')
  })

  it('isolates messages and refreshes the same selection after a new manifest', async () => {
    const { runtime, calls, renew } = await setup()
    await handleUpdate(callback('feels:3'), runtime)
    await handleUpdate(callback('feels:3', 100), runtime)
    renew()
    await handleUpdate(callback('feels:3'), runtime)
    expect(calls.filter((call) => call.method === 'editMessageMedia').map((call) => call.multipart)).toEqual([true, false, true])
  })

  it('returns cached inline photos from a local preview without public URLs', async () => {
    const { runtime, calls, render } = await setup()
    const still = await render({ mode: 'weather', hour: 0 })
    await runtime.photos.send(still, { chat_id: 99 })
    await render({ mode: 'feels', hour: 0 })
    await handleUpdate({ update_id: 3, inline_query: { id: 'inline', query: '' } }, runtime)
    const results = calls.at(-1)!.fields.results as Array<Record<string, unknown>>
    expect(results).toHaveLength(1)
    expect(results[0]).toMatchObject({ type: 'photo', photo_file_id: 'uploaded-1' })
    expect(results[0]).not.toHaveProperty('photo_url')
    expect(results[0]).not.toHaveProperty('thumbnail_url')
    expect(results[0].reply_markup).toHaveProperty('inline_keyboard')
  })

  it('keeps the HTTPS URL fallback for a first inline send or edit', async () => {
    const { runtime, calls, render } = await setup()
    runtime.config.origin = 'https://motregen.nl'
    const still = await render({ mode: 'weather', hour: 0 })
    await handleUpdate({ update_id: 3, inline_query: { id: 'inline', query: 'regen' } }, runtime)
    expect(calls.at(-1)!.fields.results).toMatchObject([{ photo_url: still.url }])
    await handleUpdate({ update_id: 4, callback_query: { id: 'callback', data: 'weather:0', inline_message_id: 'inline-message' } }, runtime)
    expect(calls.findLast((call) => call.method === 'editMessageMedia')).toMatchObject({ multipart: false, fields: { media: { media: still.url } } })
  })

  it('treats the exact not-modified response as a silent no-op after a restart', async () => {
    const { runtime, calls, fail } = await setup()
    fail('Bad Request: message is not modified: sensitive detail')
    await handleUpdate(callback('weather:0'), runtime)
    expect(calls.at(-1)?.fields.text).toBe('Al in beeld')
    await handleUpdate(callback('weather:0'), runtime)
    expect(calls.filter((call) => call.method === 'editMessageMedia')).toHaveLength(1)
  })

  it('preserves other edit failures and rejects removed buttons and commands', async () => {
    const { runtime, calls, render, fail } = await setup()
    fail('Bad Request: wrong HTTP URL specified')
    await expect(handleUpdate(callback('weather:0'), runtime)).rejects.toBeInstanceOf(TelegramApiError)
    calls.length = 0
    render.mockClear()
    await handleUpdate(callback('wind:0'), runtime)
    await handleUpdate(callback('weather:24'), runtime)
    await handleUpdate(callback('air:loop'), runtime)
    await handleUpdate({ update_id: 3, message: { message_id: 1, chat: { id: 99, type: 'private' }, text: '/lucht' } }, runtime)
    expect(calls.map((call) => call.method)).toEqual(['answerCallbackQuery', 'answerCallbackQuery', 'answerCallbackQuery'])
    expect(calls.at(-1)?.fields.text).toBe('Verlopen, stuur /regen opnieuw')
    expect(render).not.toHaveBeenCalled()
  })

  it.each(["Bad Request: message can't be edited", 'Bad Request: message to edit not found'])('answers an unavailable message with an expiry toast and remembers it: %s', async (description) => {
    const { runtime, calls, fail } = await setup()
    fail(description)
    await handleUpdate(callback('weather:0'), runtime)
    expect(calls.at(-1)).toMatchObject({ method: 'answerCallbackQuery', fields: { text: 'Verlopen, stuur /regen opnieuw' } })
    await handleUpdate(callback('feels:3'), runtime)
    expect(calls.filter((call) => call.method === 'editMessageMedia')).toHaveLength(1)
    expect(calls.at(-1)?.fields.text).toBe('Verlopen, stuur /regen opnieuw')
  })

  it('handles expired callback acknowledgements without hiding other API errors', async () => {
    const { runtime, calls, fail } = await setup()
    fail('Bad Request: query is too old and response timeout expired or query ID is invalid', 'answerCallbackQuery')
    await expect(handleUpdate(callback('weather:0'), runtime)).resolves.toBeUndefined()
    expect(calls.filter((call) => call.method === 'editMessageMedia')).toHaveLength(1)
    fail('Bad Request: unrelated acknowledgement failure', 'answerCallbackQuery')
    await expect(handleUpdate(callback('weather:0'), runtime)).rejects.toBeInstanceOf(TelegramApiError)
  })

  it('answers a failed bounded file recovery with friendly text for callbacks and commands', async () => {
    const { runtime, calls, fail } = await setup()
    await handleUpdate(callback('weather:0'), runtime)
    fail('Bad Request: file not found')
    await handleUpdate(callback('feels:3'), runtime)
    expect(calls.at(-1)).toMatchObject({ method: 'answerCallbackQuery', fields: { text: 'Beeld kon niet laden, probeer opnieuw' } })
    fail('Bad Request: wrong file identifier/HTTP URL specified', 'sendAnimation')
    await handleUpdate({ update_id: 1, message: { message_id: 1, chat: { id: 99, type: 'private' }, text: '/regen' } }, runtime)
    expect(calls.at(-1)).toMatchObject({ method: 'sendMessage', fields: { text: 'Beeld kon niet laden, probeer opnieuw' } })
  })

  it('keeps a delta anchored to its original absolute time and falls back to the newest generation once its own is gone', async () => {
    const { runtime, calls, render, renew } = await setup()
    const firstManifest = await runtime.currentManifest()
    runtime.manifestForGeneration = (generation) => generation === Date.parse(firstManifest.generated) ? firstManifest : undefined
    renew()
    await handleUpdate(callback(`weather:at:${stillEpoch(firstManifest, 1 / 6)}:${Date.parse(firstManifest.generated)}`), runtime)
    expect(render.mock.calls.at(-1)?.[0]).toEqual({ mode: 'weather', hour: 1 / 6 })
    const edits = calls.filter((call) => call.method === 'editMessageMedia').length
    runtime.manifestForGeneration = () => undefined
    // Een andere kaarttijd dan er al staat, anders is het antwoord terecht "Al in beeld".
    await handleUpdate(callback(`weather:at:${stillEpoch(firstManifest, 1 / 3)}:${Date.parse(firstManifest.generated)}`), runtime)
    expect(render.mock.calls.at(-1)?.[0]).toEqual({ mode: 'weather', hour: 1 / 3 })
    expect((render.mock.calls.at(-1) as unknown as [MediaSelection, StillManifest])[1].generated).not.toBe(firstManifest.generated)
    expect(calls.filter((call) => call.method === 'editMessageMedia')).toHaveLength(edits + 1)
    expect(JSON.stringify(calls.findLast((call) => call.method === 'editMessageMedia')?.fields)).toContain('Nieuwste beschikbare generatie getoond.')
  })

  it('primes an album once, persists every id, and uses an id on the first user edit', async () => {
    const { runtime, calls, render } = await setup()
    runtime.photos = new StillPhotos(runtime.api, new FileIdCache('motregen_bot'), 'cache-chat')
    const media = await Promise.all([render({ mode: 'weather', hour: 0 }), render({ mode: 'feels', hour: 1 / 6 }), render({ mode: 'feels', hour: 1 })])
    await runtime.photos.prime(media)
    expect(calls.filter((call) => call.method === 'sendMediaGroup')).toMatchObject([{ multipart: true, fields: { chat_id: 'cache-chat', disable_notification: 'true' } }])
    expect(calls.some((call) => call.method === 'deleteMessages')).toBe(false)
    runtime.photos = new StillPhotos(runtime.api, new FileIdCache('motregen_bot'), 'cache-chat')
    await runtime.photos.prime(media)
    await handleUpdate(callback(`feels:at:${media[1].epoch}:${Date.parse(media[1].generated)}`), runtime)
    expect(calls.filter((call) => call.method === 'sendMediaGroup')).toHaveLength(1)
    expect(calls.findLast((call) => call.method === 'editMessageMedia')).toMatchObject({ multipart: false, fields: { media: { type: 'photo', media: 'album-1-1', parse_mode: 'HTML' } } })
  })

  it('shares a concurrent cache upload between matrix priming and a user send', async () => {
    const { runtime, calls, render } = await setup()
    runtime.photos = new StillPhotos(runtime.api, new FileIdCache('motregen_bot'), 'cache-chat')
    const media = await render({ mode: 'weather', hour: 0 })
    await Promise.all([runtime.photos.prime([media]), runtime.photos.send(media, { chat_id: 99, caption: media.caption })])
    const sends = calls.filter((call) => call.method === 'sendPhoto')
    expect(sends.map((call) => call.multipart)).toEqual([true, false])
    expect(sends[0].fields.chat_id).toBe('cache-chat')
    expect(sends[1].fields.chat_id).toBe(99)
  })

  it('uploads loops as animations, edits photos into loops, reuses animation ids inline and skips duplicates', async () => {
    const { runtime, calls } = await setup()
    await handleUpdate({ update_id: 6, message: { message_id: 1, chat: { id: 99, type: 'private' }, text: '/wind' } }, runtime)
    expect(calls[0]).toMatchObject({ method: 'sendAnimation', multipart: true })
    await handleUpdate(callback('weather:0'), runtime)
    await handleUpdate(callback('wind:loop'), runtime)
    expect(calls.findLast((call) => call.method === 'editMessageMedia')).toMatchObject({ multipart: false, fields: { media: { type: 'animation', media: 'uploaded-1' } } })
    await handleUpdate(callback('wind:loop'), runtime)
    expect(calls.at(-1)?.fields.text).toBe('Al in beeld')
    await handleUpdate({ update_id: 7, inline_query: { id: 'inline', query: 'wind' } }, runtime)
    expect(calls.at(-1)!.fields.results).toMatchObject([{ type: 'mpeg4_gif', mpeg4_file_id: 'uploaded-1' }])
    expect((calls.at(-1)!.fields.results as unknown[]).length).toBe(1)
    await handleUpdate({ update_id: 8, message: { message_id: 1, chat: { id: 99, type: 'private' }, text: '/wind' } }, runtime)
    expect(calls.at(-1)).toMatchObject({ method: 'sendAnimation', multipart: false, fields: { animation: 'uploaded-1' } })
  })
})

describe('native weather per place', () => {
  async function weatherSetup(missing = false) {
    const setupResult = await setup()
    setupResult.runtime.config = { ...setupResult.runtime.config, role: 'poller', origin: 'https://fixture.test', cacheChatId: '-10099' }
    setupResult.runtime.weather = createPlaceWeather(setupResult.runtime.config, setupResult.runtime.api, 77)
    vi.stubGlobal('fetch', vi.fn(async (input: URL | string) => {
      const url = new URL(String(input))
      if (url.hostname !== 'fixture.test') return Response.json({})
      if (missing && url.pathname.endsWith('.mrf')) return new Response('missing', { status: 404 })
      return new Response(await readFile(resolve('../web/public', `.${url.pathname}`)))
    }))
    return setupResult
  }

  const command = (text: string): TelegramUpdate => ({ update_id: 1, message: { message_id: 1, chat: { id: 99, type: 'private' }, text } })

  it('uploads a native PNG to the requesting chat in poller mode, then uses file_id for the alias', async () => {
    const { runtime, calls, render } = await weatherSetup()
    await handleUpdate(command('/weer ams'), runtime)
    await handleUpdate(command('/regen Amsterdam'), runtime)
    expect(render).not.toHaveBeenCalled()
    expect(calls.map((call) => [call.method, call.multipart])).toEqual([['sendPhoto', true], ['sendPhoto', false]])
    const upload = calls[0].fields.photo as File
    expect(upload.type).toBe('image/png')
    expect(calls.every((call) => Number(call.fields.chat_id) === 99)).toBe(true)
    expect(calls[0].fields.caption).toContain('Amsterdam')
    const markup = JSON.parse(String(calls[0].fields.reply_markup))
    expect(markup.inline_keyboard[0][0]).toMatchObject({ text: 'Open in de app', url: expect.stringContaining('/weer/amsterdam') })
    await handleUpdate(command('/regen'), runtime)
    expect(render).toHaveBeenCalledWith({ mode: 'weather', hour: 'loop' }, expect.anything())
  })

  it('offers at most three places, resolves a suggestion callback and expires unknown callbacks gracefully', async () => {
    const { runtime, calls } = await weatherSetup()
    await handleUpdate(command('/weer onbekende-plaats-xyz'), runtime)
    const markup = calls[0].fields.reply_markup as { inline_keyboard: Array<Array<{ callback_data: string }>> }
    expect(calls[0].method).toBe('sendMessage')
    expect(markup.inline_keyboard.length).toBeGreaterThan(0)
    expect(markup.inline_keyboard.length).toBeLessThanOrEqual(3)
    const data = markup.inline_keyboard[0][0].callback_data
    expect(Buffer.byteLength(data)).toBeLessThanOrEqual(64)
    await handleUpdate(callback(data), runtime)
    expect(calls[1].method).toBe('answerCallbackQuery')
    expect(calls[2].method).toBe('sendPhoto')
    await handleUpdate(callback('weer:unknown'), runtime)
    expect(calls.at(-1)?.fields.text).toContain('Verlopen')
  })

  it('sends useful text and an app link when a chunk is missing, and ignores another bot’s command', async () => {
    const { runtime, calls } = await weatherSetup(true)
    await handleUpdate(command('/weer@andere_bot ams'), runtime)
    expect(calls).toHaveLength(0)
    await handleUpdate(command('/weer ams'), runtime)
    expect(calls).toHaveLength(1)
    expect(calls[0]).toMatchObject({ method: 'sendMessage', fields: { parse_mode: 'HTML', text: expect.stringContaining('tijdelijk niet compleet') } })
  })
})
