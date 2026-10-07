import { resolve } from 'node:path'
import type { TelegramApi } from './api.js'

/** Beeldmaat van stills en loops: viewport in CSS-px maal `scale` geeft de pixels van het bestand. */
export const FRAMES = {
  portrait: { width: 640, height: 848, scale: 1.5 },
  // 1280×800: op desktop een brede bubbel met leesbare knoppen; de app zet de klok dan in een paneel rechts.
  landscape: { width: 800, height: 500, scale: 1.6 },
} as const
export type FrameName = keyof typeof FRAMES

export interface BotConfig {
  token: string
  origin: string
  cacheDirectory: string
  cacheChatId?: string
  /** Proef tot de PO kiest (U58 stap 5): `MOTREGEN_BOT_FRAME=landscape`; daarna een constante. */
  frame?: FrameName
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
  const frame = environment.MOTREGEN_BOT_FRAME?.trim() || 'portrait'
  if (!(frame in FRAMES)) throw new Error('MOTREGEN_BOT_FRAME moet portrait of landscape zijn')
  const cacheRoot = environment.MOTREGEN_RENDER_CACHE ?? 'tmp/telegram-stills'
  return {
    token,
    origin: origin.origin,
    // Een eigen map per beeldmaat: bestanden en Telegram-file_id's van de ene maat mogen de andere niet bedienen.
    cacheDirectory: frame === 'portrait' ? resolve(cacheRoot) : resolve(cacheRoot, frame),
    frame: frame as FrameName,
    cacheChatId: environment.MOTREGEN_CACHE_CHAT_ID?.trim() || undefined,
  }
}
