import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { TelegramApi, TelegramApiError, type TelegramMessage } from './api.js'
import { FileIdCache } from './file-ids.js'
import { StillPhotos } from './photos.js'
import type { RenderedMedia } from './render.js'

let directory: string
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'motregen-cache-posts-'))
  let now = Date.now()
  vi.spyOn(Date, 'now').mockImplementation(() => { now += 2000; return now })
})
afterEach(async () => { vi.restoreAllMocks(); await rm(directory, { recursive: true, force: true }) })

async function media(kind: 'photo' | 'animation', generated = '2026-10-07T12:00:00Z'): Promise<RenderedMedia> {
  const key = `${kind}-${Date.parse(generated)}`
  const path = join(directory, `${key}.${kind === 'photo' ? 'jpg' : 'mp4'}`)
  await writeFile(path, 'media')
  const base = { kind, key, path, generated, epoch: Date.parse(generated), url: `https://motregen.nl/telegram/stills/${key}`, caption: 'motregen.nl', milliseconds: 0, cached: true }
  return kind === 'photo' ? { ...base, kind } : { ...base, kind, frames: 49, fps: 4, bytes: 100, renderMs: 100, encodeMs: 10 }
}

function setup() {
  const calls: Array<{ method: string; fields: Record<string, any>; multipart: boolean }> = []
  let nextMessage = 1
  let uploadFailure: string | undefined
  let invalidDescription = 'Bad Request: wrong file identifier/HTTP URL specified'
  let rejectEveryId = false
  const request = async (url: string | URL | Request, options?: RequestInit) => {
    const method = String(url).split('/').at(-1)!
    const multipart = options?.body instanceof FormData
    const fields = multipart ? Object.fromEntries((options!.body as FormData).entries()) : JSON.parse(options!.body as string)
    if (multipart && typeof fields.media === 'string') fields.media = JSON.parse(fields.media)
    calls.push({ method, fields, multipart })
    if (multipart && method === uploadFailure) return Response.json({ ok: false, error_code: 500 })
    const fileId = fields.photo ?? fields.animation ?? fields.media?.media
    if (!multipart && (fileId === 'stale-file' || (rejectEveryId && typeof fileId === 'string'))) return Response.json({ ok: false, error_code: 400, description: invalidDescription })
    const message = (animation = false): TelegramMessage => ({
      message_id: nextMessage++, chat: { id: Number(fields.chat_id ?? 99), type: String(fields.chat_id) === '-100123' ? 'supergroup' : 'private' },
      ...animation ? { animation: { file_id: `uploaded-${nextMessage}` } } : { photo: [{ file_id: `uploaded-${nextMessage}` }] },
    })
    const result = method === 'sendMediaGroup' ? fields.media.map(() => message())
      : method === 'deleteMessages' ? true
      : fields.inline_message_id ? true
      : message(method === 'sendAnimation' || fields.media?.type === 'animation')
    return Response.json({ ok: true, result })
  }
  const api = new TelegramApi('test-token', request as typeof fetch)
  const cache = new FileIdCache('motregen_bot')
  return { api, cache, calls, failUpload: (method?: string) => { uploadFailure = method }, invalid: (description: string, everyId = false) => { invalidDescription = description; rejectEveryId = everyId } }
}

async function stale(cache: FileIdCache, item: RenderedMedia) {
  await cache.remember(item, { message_id: 1, chat: { id: 99, type: 'private' }, ...item.kind === 'photo' ? { photo: [{ file_id: 'stale-file' }] } : { animation: { file_id: 'stale-file' } } })
}

describe('cache group generation posts', () => {
  it('keeps the current matrix, replaces it after a successful prime and remembers posts across restarts', async () => {
    const { api, cache, calls } = setup()
    let photos = new StillPhotos(api, cache, '-100123', directory)
    const first = await Promise.all([media('photo'), media('animation')])
    await photos.primeGeneration(first)
    expect(calls.some((call) => call.method === 'deleteMessages')).toBe(false)
    const second = await Promise.all([media('photo', '2026-10-07T12:05:00Z'), media('animation', '2026-10-07T12:05:00Z')])
    await photos.primeGeneration(second)
    expect(calls.at(-1)).toMatchObject({ method: 'deleteMessages', fields: { chat_id: '-100123', message_ids: [1, 2] } })
    photos = new StillPhotos(api, new FileIdCache('motregen_bot'), '-100123', directory)
    const previousCalls = calls.length
    await photos.primeGeneration(second)
    expect(calls).toHaveLength(previousCalls)
    const third = await Promise.all([media('photo', '2026-10-07T12:10:00Z'), media('animation', '2026-10-07T12:10:00Z')])
    await photos.primeGeneration(third)
    expect(calls.at(-1)?.fields.message_ids).toEqual([3, 4])
    const ledger = (await readdir(directory)).find((name) => name.startsWith('.cache-posts-'))!
    const state = JSON.parse(await readFile(join(directory, ledger), 'utf8'))
    expect(state.posts).toEqual([{ generated: third[0].generated, messageIds: [5, 6] }])
    expect(calls.filter((call) => call.multipart).every((call) => call.fields.chat_id === '-100123')).toBe(true)
  })

  it('keeps previous posts when the next generation fails and resumes the partial matrix before deleting them', async () => {
    const { api, cache, calls, failUpload } = setup()
    const photos = new StillPhotos(api, cache, '-100123', directory)
    await photos.primeGeneration(await Promise.all([media('photo'), media('animation')]))
    const second = await Promise.all([media('photo', '2026-10-07T12:05:00Z'), media('animation', '2026-10-07T12:05:00Z')])
    failUpload('sendAnimation')
    await expect(photos.primeGeneration(second)).rejects.toBeInstanceOf(TelegramApiError)
    expect(calls.some((call) => call.method === 'deleteMessages')).toBe(false)
    failUpload()
    await photos.primeGeneration(second)
    expect(calls.at(-1)?.fields.message_ids).toEqual([1, 2])
    expect(calls.filter((call) => call.method === 'sendPhoto')).toHaveLength(2)
  })
})

describe('invalid Telegram file ids', () => {
  it.each([
    ['photo', 'send', 'Bad Request: wrong file identifier/HTTP URL specified'],
    ['photo', 'edit', 'Bad Request: file not found'],
    ['animation', 'send', 'Bad Request: file not found'],
    ['animation', 'edit', 'Bad Request: wrong remote file identifier specified'],
  ] as const)('reuploads one %s once for lazy %s and persists the replacement: %s', async (kind, operation, description) => {
    const { api, cache, calls, invalid } = setup()
    invalid(description)
    const item = await media(kind)
    await stale(cache, item)
    const photos = new StillPhotos(api, cache)
    await photos[operation](item, { chat_id: 99, message_id: 10 })
    expect(calls.map((call) => call.multipart)).toEqual([false, true])
    const replacement = await cache.get(item)
    expect(replacement).toMatch(/^uploaded-/)
    expect(await new FileIdCache('motregen_bot').get(item)).toBe(replacement)
    await photos.send(item, { chat_id: 99 })
    expect(calls.at(-1)?.multipart).toBe(false)
    expect(calls.filter((call) => call.multipart)).toHaveLength(1)
  })

  it.each(['photo', 'animation'] as const)('reuploads an invalid inline %s into the group and retries the inline edit with its new id', async (kind) => {
    const { api, cache, calls } = setup()
    const item = await media(kind)
    await stale(cache, item)
    const photos = new StillPhotos(api, cache, '-100123', directory)
    await photos.edit(item, { inline_message_id: 'inline' })
    expect(calls.map((call) => call.multipart)).toEqual([false, true, false])
    expect(calls[1].fields.chat_id).toBe('-100123')
    expect(calls[2].fields.media.media).toBe(await cache.get(item))
    expect(calls[2].fields.media.media).not.toBe('stale-file')
    expect(await new FileIdCache('motregen_bot').get(item)).toBe(calls[2].fields.media.media)
  })

  it('bounds an invalid-id recovery to one reupload', async () => {
    const { api, cache, calls, invalid } = setup()
    invalid('Bad Request: file not found', true)
    const item = await media('photo')
    await stale(cache, item)
    const photos = new StillPhotos(api, cache, '-100123', directory)
    await expect(photos.send(item, { chat_id: 99 })).rejects.toBeInstanceOf(TelegramApiError)
    expect(calls.map((call) => call.multipart)).toEqual([false, true, false])
  })
})
