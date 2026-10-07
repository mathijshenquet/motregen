import { describe, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'
import { FRAMES, readConfig, validateCacheChat } from './config.js'
import type { TelegramApi } from './api.js'

describe('cache destination validation', () => {
  it('does no chat lookup in lazy mode', async () => {
    const call = vi.fn()
    await validateCacheChat({ call } as unknown as TelegramApi, undefined, 1)
    expect(call).not.toHaveBeenCalled()
  })

  it.each(['channel', 'group', 'supergroup'])('accepts an administrator with deletion rights in a %s', async (type) => {
    const call = vi.fn().mockResolvedValueOnce({ type }).mockResolvedValueOnce({ status: 'administrator', can_delete_messages: true })
    await validateCacheChat({ call } as unknown as TelegramApi, '-100123', 1)
    expect(call.mock.calls).toEqual([['getChat', { chat_id: '-100123' }], ['getChatMember', { chat_id: '-100123', user_id: 1 }]])
  })

  it('rejects a private user chat before any upload can start', async () => {
    const call = vi.fn().mockResolvedValue({ type: 'private' })
    await expect(validateCacheChat({ call } as unknown as TelegramApi, '99', 1)).rejects.toThrow('privékanaal of -groep')
    expect(call).toHaveBeenCalledTimes(1)
  })

  it.each([{ status: 'member' }, { status: 'administrator', can_delete_messages: false }])('rejects insufficient group permissions: %j', async (member) => {
    const call = vi.fn().mockResolvedValueOnce({ type: 'supergroup' }).mockResolvedValueOnce(member)
    await expect(validateCacheChat({ call } as unknown as TelegramApi, '-100123', 1)).rejects.toThrow('verwijderrechten')
  })
})

describe('frame size', () => {
  const environment = { TG_BOT_KEY: 'test-token', MOTREGEN_RENDER_CACHE: 'tmp/frame-test' }

  it('defaults to portrait and keeps the cache directory as it was', () => {
    const config = readConfig(environment)
    expect(config.frame).toBe('portrait')
    expect(config.cacheDirectory).toBe(resolve('tmp/frame-test'))
    expect([FRAMES.portrait.width * FRAMES.portrait.scale, FRAMES.portrait.height * FRAMES.portrait.scale]).toEqual([960, 1272])
  })

  it('gives landscape its own cache directory so files and file ids never mix', () => {
    const config = readConfig({ ...environment, MOTREGEN_BOT_FRAME: 'landscape' })
    expect(config.frame).toBe('landscape')
    expect(config.cacheDirectory).toBe(resolve('tmp/frame-test', 'landscape'))
    expect([FRAMES.landscape.width * FRAMES.landscape.scale, FRAMES.landscape.height * FRAMES.landscape.scale]).toEqual([1280, 800])
  })

  it('rejects an unknown frame name', () => {
    expect(() => readConfig({ ...environment, MOTREGEN_BOT_FRAME: 'vierkant' })).toThrow('MOTREGEN_BOT_FRAME')
  })
})
