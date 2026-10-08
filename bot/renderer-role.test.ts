import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TelegramApi } from './api.js'
import { readConfig } from './config.js'
import { runBot } from './runtime.js'
import { registerSelections, validateRegister } from './register.js'
import { cacheKey, caption, stillEpoch, type MediaSelection, type StillManifest } from './stills.js'
import type { RenderedMedia } from './render.js'

const state = vi.hoisted(() => ({ controller: undefined as AbortController | undefined, failPrime: false, operations: [] as string[], selections: [] as MediaSelection[], closed: false }))
const manifest: StillManifest = { version: 0, generated: '2026-10-08T12:00:00Z', now: '2026-10-08T12:00:00Z', chunks: [] }

vi.mock('./render.js', () => ({ StillRenderer: class {
  async prune() {}
  async manifest() { return manifest }
  async render(selection: MediaSelection, current: StillManifest): Promise<RenderedMedia> {
    state.selections.push(selection)
    const epoch = selection.hour === 'loop' ? Date.parse(current.now) : stillEpoch(current, selection.hour)
    const base = { key: cacheKey(selection, current), path: '', url: '', generated: current.generated, epoch, caption: caption(selection.mode, epoch), milliseconds: 0, cached: true }
    return selection.hour === 'loop' ? { ...base, kind: 'animation', frames: 169, fps: 10, bytes: 1, renderMs: 0, encodeMs: 0 } : { ...base, kind: 'photo' }
  }
  async close() { state.closed = true }
} }))

vi.mock('./photos.js', () => ({ StillPhotos: class {
  fileIds = { get: async (media: RenderedMedia) => `file-${media.key}` }
  async prime(media: RenderedMedia[]) {
    expect(media).toHaveLength(173)
    state.operations.push('prime')
    if (state.failPrime) {
      state.controller!.abort()
      throw new Error('Failed prime')
    }
  }
  async retainGeneration() {
    state.operations.push('retain')
    state.controller!.abort()
  }
} }))

const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))) })

describe('renderer role isolation', () => {
  it.each([false, true])('publishes only after a complete prime; failed prime=%s', async (failPrime) => {
    const directory = await mkdtemp(join(tmpdir(), 'motregen-renderer-role-'))
    directories.push(directory)
    state.controller = new AbortController()
    state.failPrime = failPrime
    state.operations = []
    state.selections = []
    state.closed = false
    const methods: string[] = []
    const api = new TelegramApi('test', (async (url, options) => {
      const method = String(url).split('/').at(-1)!
      methods.push(method)
      if (method === 'getMe') return Response.json({ ok: true, result: { id: 42, username: 'motregen_bot' } })
      if (method === 'getChat') return Response.json({ ok: true, result: { type: 'supergroup' } })
      if (method === 'getChatMember') return Response.json({ ok: true, result: { status: 'administrator', can_delete_messages: true, can_pin_messages: true } })
      if (method === 'sendDocument') {
        const document = (options!.body as FormData).get('document') as File
        expect(validateRegister(JSON.parse(await document.text()), 42).entries).toHaveLength(173)
        state.operations.push('publish')
      }
      return Response.json({ ok: true, result: { message_id: 10 } })
    }) as typeof fetch)
    const config = readConfig({ TG_BOT_KEY: 'test', MOTREGEN_BOT_ROLE: 'renderer', MOTREGEN_CACHE_CHAT_ID: '-100123', MOTREGEN_RENDER_CACHE: directory })
    await runBot(config, api, state.controller.signal)
    expect(state.selections).toHaveLength(173)
    expect(new Set(state.selections.map((selection) => JSON.stringify(selection)))).toEqual(new Set(registerSelections().map((selection) => JSON.stringify(selection))))
    expect(state.operations).toEqual(failPrime ? ['prime'] : ['prime', 'publish', 'retain'])
    expect(methods).toEqual(failPrime ? ['getMe', 'getChat', 'getChatMember'] : ['getMe', 'getChat', 'getChatMember', 'getChat', 'sendDocument', 'pinChatMessage'])
    expect(state.closed).toBe(true)
  })
})
