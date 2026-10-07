import { resolve } from 'node:path'
import type { TelegramApi } from './api.js'

export interface BotConfig {
  token: string
  origin: string
  cacheDirectory: string
  cacheChatId?: string
}

export async function validateCacheChat(api: TelegramApi, chatId: string | undefined, botId: number): Promise<void> {
  if (!chatId) return
  const chat = await api.call<{ type: string }>('getChat', { chat_id: chatId })
  if (!['channel', 'group', 'supergroup'].includes(chat.type)) throw new Error('Cache-uploaddoel moet een privékanaal of -groep zijn')
  const member = await api.call<{ status: string; can_delete_messages?: boolean }>('getChatMember', { chat_id: chatId, user_id: botId })
  if (member.status !== 'creator' && !(member.status === 'administrator' && member.can_delete_messages)) throw new Error('Bot moet beheerder met verwijderrechten zijn in de cachechat')
}

export function readConfig(environment: NodeJS.ProcessEnv = process.env): BotConfig {
  const token = environment.TG_BOT_KEY?.trim()
  if (!token) throw new Error('TG_BOT_KEY ontbreekt')
  const origin = new URL(environment.MOTREGEN_ORIGIN ?? 'https://motregen.nl')
  if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('MOTREGEN_ORIGIN moet HTTP(S) zijn')
  return {
    token,
    origin: origin.origin,
    cacheDirectory: resolve(environment.MOTREGEN_RENDER_CACHE ?? 'tmp/telegram-stills'),
    cacheChatId: environment.MOTREGEN_CACHE_CHAT_ID?.trim() || undefined,
  }
}
