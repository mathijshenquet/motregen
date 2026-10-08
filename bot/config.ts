import { resolve } from 'node:path'
import type { TelegramApi } from './api.js'

/**
 * Beeldmaat van stills en loops: viewport in CSS-px maal `scale` geeft de pixels van het bestand (960×1272).
 * Staand blijft (PO 2026-10-08 op echte berichten): een liggende proef met de klok in een paneel naast de
 * kaart viel af.
 */
export const FRAME = { width: 640, height: 848, scale: 1.5 } as const
export const FRAME_PIXELS = { width: FRAME.width * FRAME.scale, height: FRAME.height * FRAME.scale } as const

export type BotRole = 'combined' | 'renderer' | 'poller'

export interface BotConfig {
  role: BotRole
  token: string
  origin: string
  cacheDirectory: string
  cacheChatId?: string
  registerPath?: string
}

export async function validateCacheChat(api: TelegramApi, chatId: string | undefined, botId: number, requirePin = false): Promise<void> {
  if (!chatId) return
  const chat = await api.call<{ type: string }>('getChat', { chat_id: chatId })
  if (!['channel', 'group', 'supergroup'].includes(chat.type)) throw new Error('Cache-uploaddoel moet een privékanaal of -groep zijn')
  const member = await api.call<{ status: string; can_delete_messages?: boolean; can_pin_messages?: boolean; can_edit_messages?: boolean }>('getChatMember', { chat_id: chatId, user_id: botId })
  if (member.status !== 'creator' && !(member.status === 'administrator' && member.can_delete_messages)) throw new Error('Bot moet beheerder met verwijderrechten zijn in de cachechat')
  if (requirePin && member.status !== 'creator' && !(chat.type === 'channel' ? member.can_edit_messages : member.can_pin_messages)) throw new Error('Renderer heeft pinrechten nodig in de cachechat')
}

export function readConfig(environment: NodeJS.ProcessEnv = process.env, arguments_: string[] = []): BotConfig {
  const role = arguments_.find((argument) => argument.startsWith('--role='))?.slice(7) ?? environment.MOTREGEN_BOT_ROLE ?? 'combined'
  if (role !== 'combined' && role !== 'renderer' && role !== 'poller') throw new Error('Ongeldige MOTREGEN_BOT_ROLE')
  const token = environment.TG_BOT_KEY?.trim()
  if (!token) throw new Error('TG_BOT_KEY ontbreekt')
  const origin = new URL(environment.MOTREGEN_ORIGIN ?? 'https://motregen.nl')
  if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('MOTREGEN_ORIGIN moet HTTP(S) zijn')
  const cacheChatId = environment.MOTREGEN_CACHE_CHAT_ID?.trim() || undefined
  const registerPath = environment.MOTREGEN_REGISTER_PATH ? resolve(environment.MOTREGEN_REGISTER_PATH) : undefined
  if (role !== 'combined' && !cacheChatId && !(role === 'poller' && registerPath)) throw new Error('MOTREGEN_CACHE_CHAT_ID ontbreekt voor de gesplitste bot')
  return {
    role,
    token,
    origin: origin.origin,
    cacheDirectory: resolve(environment.MOTREGEN_RENDER_CACHE ?? 'tmp/telegram-stills'),
    cacheChatId,
    registerPath,
  }
}
