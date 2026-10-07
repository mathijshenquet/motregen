import { describe, expect, it, vi } from 'vitest'
import { resolve } from 'node:path'
import { FRAME_PIXELS, readConfig, validateCacheChat } from './config.js'
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
  it('renders portrait media of 960×1272 into the configured cache directory', () => {
    expect(FRAME_PIXELS).toEqual({ width: 960, height: 1272 })
    expect(readConfig({ TG_BOT_KEY: 'test-token', MOTREGEN_RENDER_CACHE: 'tmp/frame-test' }).cacheDirectory).toBe(resolve('tmp/frame-test'))
  })
})
