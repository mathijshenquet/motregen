import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TelegramApi, TelegramApiError, type TelegramUpdate } from './api.js'
import { FileIdCache } from './file-ids.js'
import { handleUpdate, type BotRuntime } from './handlers.js'
import { StillPhotos } from './photos.js'
import { MessageSelections } from './selections.js'
import type { RenderedMedia, StillRenderer } from './render.js'
import { cacheKey, caption, stillEpoch, type MediaSelection, type StillManifest } from './stills.js'

let directory: string
beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'motregen-handlers-')) })
afterEach(async () => { vi.restoreAllMocks(); await rm(directory, { recursive: true, force: true }) })

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
    config: { origin: 'http://localhost:4365', cacheDirectory: directory, token: 'test-token' },
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
  it('uploads a chat photo once and resends the cached Telegram file id', async () => {
    const { runtime, calls } = await setup()
    const command = { update_id: 1, message: { message_id: 1, chat: { id: 99, type: 'private' }, text: '/regen' } }
    await handleUpdate(command, runtime)
    await handleUpdate(command, runtime)
    expect(calls.map((call) => call.multipart)).toEqual([true, false])
    expect(calls[1].fields.photo).toBe('uploaded-1')
  })

  it('uploads the first edit, reuses its file id, and skips repeated chat and inline selections', async () => {
    const { runtime, calls, render } = await setup()
    await handleUpdate(callback('air:3'), runtime)
    await handleUpdate(callback('weather:0'), runtime)
    await handleUpdate(callback('air:3'), runtime)
    const edits = calls.filter((call) => call.method === 'editMessageMedia')
    expect(edits.map((call) => call.multipart)).toEqual([true, true, false])
    expect(edits[2].fields.media).toMatchObject({ media: 'uploaded-1' })
    const previousRenders = render.mock.calls.length
    await handleUpdate(callback('air:3'), runtime)
    expect(calls.at(-1)).toMatchObject({ method: 'answerCallbackQuery', fields: { text: 'Al in beeld' } })
    expect(render.mock.calls).toHaveLength(previousRenders)
    const inline = { update_id: 3, callback_query: { id: 'inline-callback', data: 'air:3', inline_message_id: 'inline-message' } }
    await handleUpdate(inline, runtime)
    expect(calls.findLast((call) => call.method === 'editMessageMedia')).toMatchObject({ multipart: false, fields: { inline_message_id: 'inline-message', media: { media: 'uploaded-1' } } })
    await handleUpdate(inline, runtime)
    expect(calls.at(-1)?.fields.text).toBe('Al in beeld')
  })

  it('isolates messages and refreshes the same selection after a new manifest', async () => {
    const { runtime, calls, renew } = await setup()
    await handleUpdate(callback('air:3'), runtime)
    await handleUpdate(callback('air:3', 100), runtime)
    renew()
    await handleUpdate(callback('air:3'), runtime)
    expect(calls.filter((call) => call.method === 'editMessageMedia').map((call) => call.multipart)).toEqual([true, false, true])
  })

  it('returns cached inline photos from a local preview without public URLs', async () => {
    const { runtime, calls, render } = await setup()
    const still = await render({ mode: 'weather', hour: 0 })
    await runtime.photos.send(still, { chat_id: 99 })
    await render({ mode: 'air', hour: 0 })
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
    fail('Bad Request: wrong file identifier/HTTP URL specified')
    await expect(handleUpdate(callback('weather:0'), runtime)).rejects.toBeInstanceOf(TelegramApiError)
    calls.length = 0
    render.mockClear()
    await handleUpdate(callback('wind:0'), runtime)
    await handleUpdate(callback('weather:24'), runtime)
    expect(calls.map((call) => call.method)).toEqual(['answerCallbackQuery', 'answerCallbackQuery'])
    expect(render).not.toHaveBeenCalled()
  })

  it.each(["Bad Request: message can't be edited", 'Bad Request: message to edit not found'])('answers an unavailable message with an expiry toast and remembers it: %s', async (description) => {
    const { runtime, calls, fail } = await setup()
    fail(description)
    await handleUpdate(callback('weather:0'), runtime)
    expect(calls.at(-1)).toMatchObject({ method: 'answerCallbackQuery', fields: { text: 'Verlopen, stuur /regen opnieuw' } })
    await handleUpdate(callback('air:3'), runtime)
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

  it('rejects an expired generation and keeps a delta anchored to its original absolute time', async () => {
    const { runtime, calls, render, renew } = await setup()
    const firstManifest = await runtime.currentManifest()
    runtime.manifestForGeneration = (generation) => generation === Date.parse(firstManifest.generated) ? firstManifest : undefined
    renew()
    await handleUpdate(callback(`weather:at:${stillEpoch(firstManifest, 1 / 6)}:${Date.parse(firstManifest.generated)}`), runtime)
    expect(render.mock.calls.at(-1)?.[0]).toEqual({ mode: 'weather', hour: 1 / 6 })
    const edits = calls.filter((call) => call.method === 'editMessageMedia').length
    runtime.manifestForGeneration = () => undefined
    await handleUpdate(callback(`weather:at:${stillEpoch(firstManifest, 1 / 6)}:${Date.parse(firstManifest.generated)}`), runtime)
    expect(calls.at(-1)?.fields.text).toBe('Verlopen, stuur /regen opnieuw')
    expect(calls.filter((call) => call.method === 'editMessageMedia')).toHaveLength(edits)
  })

  it('primes an album once, persists every id, and uses an id on the first user edit', async () => {
    const { runtime, calls, render } = await setup()
    runtime.photos = new StillPhotos(runtime.api, new FileIdCache('motregen_bot'), 'cache-chat')
    const media = await Promise.all([render({ mode: 'weather', hour: 0 }), render({ mode: 'air', hour: 1 / 6 }), render({ mode: 'feels', hour: 1 })])
    await runtime.photos.prime(media)
    expect(calls.filter((call) => call.method === 'sendMediaGroup')).toMatchObject([{ multipart: true, fields: { chat_id: 'cache-chat', disable_notification: 'true' } }])
    expect(calls.find((call) => call.method === 'deleteMessages')?.fields.message_ids).toEqual([100, 101, 102])
    runtime.photos = new StillPhotos(runtime.api, new FileIdCache('motregen_bot'), 'cache-chat')
    await runtime.photos.prime(media)
    await handleUpdate(callback(`air:at:${media[1].epoch}:${Date.parse(media[1].generated)}`), runtime)
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
    await handleUpdate({ update_id: 6, message: { message_id: 1, chat: { id: 99, type: 'private' }, text: '/loop wind' } }, runtime)
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
