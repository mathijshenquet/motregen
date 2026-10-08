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

describe('register downloads', () => {
  it.each(['documents/register', 'documents/weer radar.json'])('downloads the opaque Telegram file path %s', async (path) => {
    const urls: string[] = []
    const api = new TelegramApi('test', (async (url) => {
      urls.push(String(url))
      if (String(url).endsWith('/getFile')) return Response.json({ ok: true, result: { file_path: path } })
      return Response.json({ version: 1 })
    }) as typeof fetch)
    expect(await api.downloadJson('file-id')).toEqual({ version: 1 })
    expect(urls[1]).toBe(`https://api.telegram.org/file/bottest/${path.split('/').map(encodeURIComponent).join('/')}`)
  })

  it.each(['/documents/register.json', '../register.json', 'documents/../register.json'])('rejects an unsafe file path %s before download', async (path) => {
    let requests = 0
    const api = new TelegramApi('test', (async () => {
      requests++
      return Response.json({ ok: true, result: { file_path: path } })
    }) as typeof fetch)
    await expect(api.downloadJson('file-id')).rejects.toThrow('Telegram getFile mislukt (0)')
    expect(requests).toBe(1)
  })

  it('keeps the token and upstream download exception out of errors', async () => {
    const api = new TelegramApi('secret', (async (url) => {
      if (String(url).endsWith('/getFile')) return Response.json({ ok: true, result: { file_path: 'documents/register.json' } })
      throw new Error(String(url))
    }) as typeof fetch)
    await expect(api.downloadJson('file-id')).rejects.toThrow('Telegram downloadRegister mislukt (0)')
  })
})
