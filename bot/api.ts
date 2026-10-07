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
  animation?: { file_id: string }
}

export interface TelegramUpdate {
  update_id: number
  message?: TelegramMessage
  channel_post?: { chat: { id: number; type: string } }
  my_chat_member?: { chat: { id: number; type: string }; new_chat_member: { status: string } }
  inline_query?: { id: string; query: string; from?: { id: number } }
  callback_query?: { id: string; data?: string; message?: TelegramMessage; inline_message_id?: string; from?: { id: number } }
}

type FailureReason = 'not-modified' | 'message-unavailable' | 'callback-expired' | 'invalid-file'
type KnownDescription = 'Bad Request: message is not modified' | "Bad Request: message can't be edited" | 'Bad Request: message to edit not found' | 'Bad Request: query is too old and response timeout expired or query ID is invalid' | 'Bad Request: wrong file identifier' | 'Bad Request: file not found'

export class TelegramApiError extends Error {
  constructor(readonly method: string, readonly code: number, readonly retryAfter?: number, readonly reason?: FailureReason, readonly description?: KnownDescription) {
    super(`Telegram ${method} mislukt (${code})`)
  }

  get notModified(): boolean { return this.reason === 'not-modified' }
  get messageUnavailable(): boolean { return this.reason === 'message-unavailable' }
  get callbackExpired(): boolean { return this.reason === 'callback-expired' }
  get invalidFile(): boolean { return this.reason === 'invalid-file' }
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

  async upload<Result>(method: string, fields: Record<string, unknown>, path: string, attachment = { name: 'photo', mime: 'image/jpeg', filename: 'motregen.jpg' }): Promise<Result> {
    const form = new FormData()
    for (const [name, value] of Object.entries(fields)) {
      form.set(name, typeof value === 'string' ? value : JSON.stringify(value))
    }
    const contents = await readFile(path)
    form.set(attachment.name, new Blob([contents], { type: attachment.mime }), attachment.filename)
    return this.send<Result>(method, form)
  }

  async uploadAlbum(fields: Record<string, unknown>, photos: Array<{ path: string; caption: string }>): Promise<TelegramMessage[]> {
    const form = new FormData()
    for (const [name, value] of Object.entries(fields)) form.set(name, typeof value === 'string' ? value : JSON.stringify(value))
    form.set('media', JSON.stringify(photos.map((photo, index) => ({ type: 'photo', media: `attach://photo${index}`, caption: photo.caption, parse_mode: 'HTML' }))))
    const contents = await Promise.all(photos.map((photo) => readFile(photo.path)))
    for (const [index, data] of contents.entries()) form.set(`photo${index}`, new Blob([data], { type: 'image/jpeg' }), `motregen-${index}.jpg`)
    return this.send<TelegramMessage[]>('sendMediaGroup', form)
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
      const code = reply.error_code ?? response.status
      const description = reply.description?.toLowerCase() ?? ''
      let reason: FailureReason | undefined
      let knownDescription: KnownDescription | undefined
      if (code === 400 && method === 'editMessageMedia') {
        if (description.includes('message is not modified')) {
          reason = 'not-modified'
          knownDescription = 'Bad Request: message is not modified'
        } else if (description.includes("message can't be edited")) {
          reason = 'message-unavailable'
          knownDescription = "Bad Request: message can't be edited"
        } else if (description.includes('message to edit not found')) {
          reason = 'message-unavailable'
          knownDescription = 'Bad Request: message to edit not found'
        }
      } else if (code === 400 && method === 'answerCallbackQuery' && (description.includes('query is too old') || description.includes('query id is invalid'))) {
        reason = 'callback-expired'
        knownDescription = 'Bad Request: query is too old and response timeout expired or query ID is invalid'
      }
      if (code === 400 && ['sendPhoto', 'sendAnimation', 'editMessageMedia'].includes(method)) {
        if (description.includes('wrong file identifier') || description.includes('wrong remote file identifier')) {
          reason = 'invalid-file'
          knownDescription = 'Bad Request: wrong file identifier'
        } else if (description.includes('file not found')) {
          reason = 'invalid-file'
          knownDescription = 'Bad Request: file not found'
        }
      }
      throw new TelegramApiError(method, code, reply.parameters?.retry_after, reason, knownDescription)
    }
    return reply.result
  }
}
