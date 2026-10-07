import { describe, expect, it } from 'vitest'
import { TelegramApi, TelegramApiError } from './api.js'

describe('Telegram API errors', () => {
  it('keeps token, chat ids and upstream descriptions out of exceptions', async () => {
    const request = async () => {
      throw new Error('https://api.telegram.org/botsecret/getUpdates?chat_id=123')
    }
    const api = new TelegramApi('secret', request as typeof fetch)
    await expect(api.call('getUpdates')).rejects.toThrow('Telegram getUpdates mislukt (0)')
  })

  it('retains the rate-limit backoff without exposing the response body', async () => {
    const request = async () => Response.json({ ok: false, error_code: 429, description: 'sensitive', parameters: { retry_after: 17 } })
    const api = new TelegramApi('secret', request as typeof fetch)
    try {
      await api.call('sendPhoto')
      throw new Error('Expected rate-limit error')
    } catch (error) {
      expect(error).toBeInstanceOf(TelegramApiError)
      expect((error as TelegramApiError).retryAfter).toBe(17)
      expect((error as Error).message).not.toContain('sensitive')
    }
  })
})
