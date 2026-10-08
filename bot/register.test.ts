import { mkdtemp, readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TelegramApi } from './api.js'
import { REGISTER_FILENAME, RegisterMedia, TelegramRegister, registerSelections, validateRegister, writeRegister, type MediaRegister } from './register.js'

export function fixtureRegister(generated = '2026-10-08T12:00:00Z'): MediaRegister {
  return { version: 1, botId: 42, generated, now: generated, entries: registerSelections().map((selection, index) => ({ selection, fileId: `file-${generated}-${index}` })) }
}

const directories: string[] = []
afterEach(async () => { await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true, force: true }))) })

describe('atomic media register', () => {
  it('requires exactly 173 unique selections from the same bot', () => {
    const register = fixtureRegister()
    expect(validateRegister(register, 42).entries).toHaveLength(173)
    expect(() => validateRegister(register, 43)).toThrow('andere bot')
    expect(() => validateRegister({ ...register, entries: register.entries.slice(1) }, 42)).toThrow('Onvolledige')
    expect(() => validateRegister({ ...register, entries: [...register.entries, register.entries[0]] }, 42)).toThrow('registerselectie')
    expect(() => validateRegister({ ...register, entries: register.entries.map((entry) => ({ ...entry, fileId: '' })) }, 42)).toThrow('registerselectie')
  })

  it('keeps the old generation when an incomplete write is rejected', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'motregen-register-'))
    directories.push(directory)
    const path = join(directory, REGISTER_FILENAME)
    const first = fixtureRegister()
    await writeRegister(path, first)
    await expect(writeRegister(path, { ...fixtureRegister('2026-10-08T12:05:00Z'), entries: [] })).rejects.toThrow('Onvolledige')
    expect(JSON.parse(await readFile(path, 'utf8'))).toEqual(first)
  })

  it('retains available media after rejected updates and falls back to the latest generation', async () => {
    const media = new RegisterMedia(42)
    const register = fixtureRegister()
    media.accept(register)
    const manifest = media.currentManifest()
    expect(() => media.accept({ ...register, entries: [] })).toThrow('Onvolledige')
    expect(media.currentManifest()).toEqual(manifest)
    const loop = media.media({ mode: 'weather', hour: 'loop' }, { ...manifest, generated: '2026-10-08T11:00:00Z' })
    expect(loop.generated).toBe(register.generated)
    expect(loop.caption).toContain('Nieuwste beschikbare generatie')
    expect(await media.fileId(loop)).toBe(register.entries[0].fileId)
    media.accept(fixtureRegister('2026-10-08T11:00:00Z'))
    expect(media.currentManifest()).toEqual(manifest)
  })
})

describe('pinned Telegram document transport', () => {
  it('downloads a changed document even when the pinned message id stays the same', async () => {
    let register = fixtureRegister()
    let fileId = 'first'
    const methods: string[] = []
    const request = vi.fn(async (url: string | URL | Request) => {
      const method = String(url).split('/').at(-1)!
      methods.push(method)
      if (String(url).includes('/file/bot')) return Response.json(register)
      if (method === 'getChat') return Response.json({ ok: true, result: { pinned_message: { message_id: 1, document: { file_id: fileId, file_name: REGISTER_FILENAME } } } })
      return Response.json({ ok: true, result: { file_path: 'documents/register.json' } })
    })
    const transport = new TelegramRegister(new TelegramApi('test', request as typeof fetch), '-100123', 42)
    expect(await transport.read()).toEqual(register)
    expect(await transport.read()).toBeUndefined()
    fileId = 'second'
    register = fixtureRegister('2026-10-08T12:05:00Z')
    expect(await transport.read()).toEqual(register)
    expect(methods).toEqual(['getChat', 'getFile', 'register.json', 'getChat', 'getChat', 'getFile', 'register.json'])
  })

  it.each([false, true])('publishes through %s existing pinned register, without reading updates', async (existing) => {
    const directory = await mkdtemp(join(tmpdir(), 'motregen-register-'))
    directories.push(directory)
    const path = join(directory, REGISTER_FILENAME)
    await writeRegister(path, fixtureRegister())
    const methods: string[] = []
    const request = vi.fn(async (url: string | URL | Request, options?: RequestInit) => {
      const method = String(url).split('/').at(-1)!
      methods.push(method)
      if (method === 'getChat') return Response.json({ ok: true, result: existing ? { pinned_message: { message_id: 10, document: { file_id: 'old', file_name: REGISTER_FILENAME } } } : {} })
      if (method === 'sendDocument' || method === 'editMessageMedia') {
        const form = options!.body as FormData
        expect((form.get('document') as File).name).toBe(REGISTER_FILENAME)
        expect(JSON.parse(await (form.get('document') as File).text())).toEqual(fixtureRegister())
      }
      return Response.json({ ok: true, result: { message_id: 10 } })
    })
    await new TelegramRegister(new TelegramApi('test', request as typeof fetch), '-100123', 42).publish(path)
    expect(methods).toEqual(existing ? ['getChat', 'editMessageMedia'] : ['getChat', 'sendDocument', 'pinChatMessage'])
  })
})
