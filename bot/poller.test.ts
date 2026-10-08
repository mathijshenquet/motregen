import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TelegramApi } from './api.js'
import { readConfig } from './config.js'
import { handleUpdate } from './handlers.js'
import { createPoller } from './poller.js'
import { REGISTER_NOTICE, registerSelections, writeRegister, type MediaRegister } from './register.js'
import { runBot } from './runtime.js'

vi.mock('./render.js', () => { throw new Error('Poller must never load the renderer or Playwright') })

const directories: string[] = []
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))) })

async function setup(withRegister = true) {
  const directory = await mkdtemp(join(tmpdir(), 'motregen-poller-'))
  directories.push(directory)
  const path = join(directory, 'register.json')
  const register: MediaRegister = { version: 1, botId: 42, generated: new Date().toISOString(), now: '2026-10-08T12:00:00Z', entries: registerSelections().map((selection, index) => ({ selection, fileId: `file-${index}` })) }
  if (withRegister) await writeRegister(path, register)
  const config = readConfig({ TG_BOT_KEY: 'test', MOTREGEN_BOT_ROLE: 'poller', MOTREGEN_REGISTER_PATH: path, MOTREGEN_RENDER_CACHE: directory })
  const methods: Array<{ method: string; fields: Record<string, unknown> }> = []
  const controller = new AbortController()
  const request = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
    expect(options?.body).not.toBeInstanceOf(FormData)
    const method = String(url).split('/').at(-1)!
    const fields = JSON.parse(options!.body as string)
    methods.push({ method, fields })
    if (method === 'getMe') return Response.json({ ok: true, result: { id: 42, username: 'motregen_bot' } })
    if (method === 'getWebhookInfo') return Response.json({ ok: true, result: { url: '' } })
    if (method === 'getUpdates') {
      if (methods.filter((entry) => entry.method === 'getUpdates').length === 1) return Response.json({ ok: true, result: [{ update_id: 1, message: { message_id: 1, chat: { id: 99, type: 'private' }, text: '/regen' } }] })
      controller.abort()
      return Response.json({ ok: true, result: [] })
    }
    return Response.json({ ok: true, result: { message_id: 10 } })
  })
  const api = new TelegramApi('test', request as typeof fetch)
  const poller = await createPoller(config, api, { id: 42, username: 'motregen_bot' })
  return { config, api, poller, methods, controller, register, path }
}

describe('renderer-free poller', () => {
  it('starts without Chromium or Playwright and answers a command from the register', async () => {
    vi.stubEnv('MOTREGEN_CHROMIUM_PATH', '/does-not-exist')
    vi.stubEnv('PLAYWRIGHT_BROWSERS_PATH', '/does-not-exist')
    const { config, api, methods, controller } = await setup()
    await runBot(config, api, controller.signal)
    expect(methods.map((entry) => entry.method)).toEqual(['getMe', 'getWebhookInfo', 'setChatMenuButton', 'setMyCommands', 'getUpdates', 'sendAnimation', 'getUpdates'])
    expect(methods.find((entry) => entry.method === 'sendAnimation')?.fields.animation).toBe('file-0')
  })

  it('serves every still, inline file ids, and a newer generation for an expired callback', async () => {
    const { poller, methods, register } = await setup()
    await handleUpdate({ update_id: 1, callback_query: { id: 'callback', data: 'weather:3', message: { message_id: 10, chat: { id: 99, type: 'private' } } } }, poller.runtime)
    const selected = register.entries.find((entry) => entry.selection.mode === 'weather' && entry.selection.hour === 3)!
    expect(methods[0]).toMatchObject({ method: 'editMessageMedia', fields: { media: { media: selected.fileId } } })
    await handleUpdate({ update_id: 2, inline_query: { id: 'inline', query: '' } }, poller.runtime)
    const results = methods.find((entry) => entry.method === 'answerInlineQuery')!.fields.results as Array<Record<string, unknown>>
    expect(results).toHaveLength(5)
    expect(results.every((entry) => entry.photo_file_id || entry.mpeg4_file_id)).toBe(true)
    await handleUpdate({ update_id: 3, callback_query: { id: 'expired', data: 'feels:at:1791453900000:1791446400000', inline_message_id: 'inline-message' } }, poller.runtime)
    expect(methods.at(-1)).toMatchObject({ method: 'answerCallbackQuery', fields: { text: REGISTER_NOTICE } })
    expect((methods.at(-2)!.fields.media as { caption: string }).caption).toContain(REGISTER_NOTICE)
  })

  it('keeps the previous matrix on a broken refresh and answers gracefully with an empty register', async () => {
    const previous = await setup()
    await rm(previous.path)
    await expect(previous.poller.refresh()).rejects.toThrow()
    await handleUpdate({ update_id: 1, message: { message_id: 1, chat: { id: 99, type: 'private' }, text: '/wind' } }, previous.poller.runtime)
    expect(previous.methods.at(-1)?.method).toBe('sendAnimation')
    const empty = await setup(false)
    await handleUpdate({ update_id: 1, message: { message_id: 1, chat: { id: 99, type: 'private' }, text: '/regen' } }, empty.poller.runtime)
    expect(empty.methods.at(-1)).toMatchObject({ method: 'sendMessage', fields: { text: 'Beeld wordt klaargezet, probeer zo opnieuw.' } })
  })

  it('does not repair invalid Telegram ids by uploading or rendering', async () => {
    const { config } = await setup()
    const methods: string[] = []
    const api = new TelegramApi('test', (async (url) => {
      const method = String(url).split('/').at(-1)!
      methods.push(method)
      if (method === 'sendAnimation') return Response.json({ ok: false, error_code: 400, description: 'Bad Request: wrong file identifier' })
      return Response.json({ ok: true, result: true })
    }) as typeof fetch)
    const poller = await createPoller(config, api, { id: 42, username: 'motregen_bot' })
    await handleUpdate({ update_id: 1, message: { message_id: 1, chat: { id: 99, type: 'private' }, text: '/regen' } }, poller.runtime)
    expect(methods).toEqual(['sendAnimation', 'sendMessage'])
  })
})
