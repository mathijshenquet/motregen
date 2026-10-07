import { readFile } from 'node:fs/promises'

interface ApiReply<Result> {
  ok: boolean
  result: Result
  error_code?: number
  description?: string
  parameters?: { retry_after?: number }
}

export interface TelegramMessage {
  message_id: number
  chat: { id: number; type: string }
  text?: string
  photo?: Array<{ file_id: string }>
}

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  inline_query?: { id: string; query: string; from?: { id: number } }
  callback_query?: { id: string; data?: string; message?: TelegramMessage; inline_message_id?: string; from?: { id: number } }
}

export class TelegramApiError extends Error {
  constructor(readonly method: string, readonly code: number, readonly retryAfter?: number, readonly notModified = false) {
    super(`Telegram ${method} mislukt (${code})`)
  }
}

export class TelegramApi {
  constructor(private readonly token: string, private readonly request: typeof fetch = fetch) {}

  async call<Result>(method: string, fields: Record<string, unknown> = {}, signal?: AbortSignal): Promise<Result> {
    const response = await this.send<Result>(method, JSON.stringify(fields), { 'Content-Type': 'application/json' }, signal)
    return response
  }

  async uploadPhoto(fields: Record<string, unknown>, path: string): Promise<TelegramMessage> {
    return this.upload<TelegramMessage>('sendPhoto', fields, path)
  }

  async upload<Result>(method: string, fields: Record<string, unknown>, path: string): Promise<Result> {
    const form = new FormData()
    for (const [name, value] of Object.entries(fields)) {
      form.set(name, typeof value === 'string' ? value : JSON.stringify(value))
    }
    const contents = await readFile(path)
    form.set('photo', new Blob([contents], { type: 'image/jpeg' }), 'motregen.jpg')
    return this.send<Result>(method, form)
  }

  private async send<Result>(method: string, body: string | FormData, headers?: Record<string, string>, signal?: AbortSignal): Promise<Result> {
    let response: Response
    try {
      response = await this.request(`https://api.telegram.org/bot${this.token}/${method}`, {
        method: 'POST', body, headers, signal: signal ?? AbortSignal.timeout(45_000),
      })
    } catch {
      throw new TelegramApiError(method, 0)
    }
    let reply: ApiReply<Result>
    try {
      reply = await response.json() as ApiReply<Result>
    } catch {
      throw new TelegramApiError(method, response.status)
    }
    if (!reply.ok) {
      const notModified = method === 'editMessageMedia' && reply.error_code === 400 && Boolean(reply.description?.includes('message is not modified'))
      throw new TelegramApiError(method, reply.error_code ?? response.status, reply.parameters?.retry_after, notModified)
    }
    return reply.result
  }
}
