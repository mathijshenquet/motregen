import { resolve } from 'node:path'
import type { TelegramApi } from './api.js'

/**
 * Beeldmaat van stills en loops: viewport in CSS-px maal `scale` geeft de pixels van het bestand (960×1224).
 * Staand blijft (PO 2026-10-08 op echte berichten): een liggende proef met de klok in een paneel naast de
 * kaart viel af.
 */
export const FRAME_PIXELS = { width: 960, height: 1224 } as const
/**
 * De kaart met alles erop (plaatsnamen, labels, lijnen, wind, merktekens) 1,5× groter dan bij de oude schaal 1,5,
 * op hetzelfde bestand en dezelfde kaartuitsnede (U103, C8a): Telegram toont de films vaak klein. Vaste pixelmaten
 * zijn afgesteld bij BASE_FRAME_SCALE en schalen met ELEMENT_SCALE mee; klokpaneel en voetregel van de
 * Rust-renderer blijven op hun oude maat (PO 2026-11-09).
 */
export const BASE_FRAME_SCALE = 1.5
export const ELEMENT_SCALE = 1.5
const scale = BASE_FRAME_SCALE * ELEMENT_SCALE
// De CSS-breedte (426,67) is geen geheel getal; een browserviewport rondt naar boven af en knipt terug (FRAME_VIEWPORT, frameScreenshot).
export const FRAME = { width: FRAME_PIXELS.width / scale, height: FRAME_PIXELS.height / scale, scale } as const
/** Browserviewport voor FRAME: gehele CSS-px; frameScreenshot knipt de schermafdruk terug naar FRAME_PIXELS. */
export const FRAME_VIEWPORT = { width: Math.ceil(FRAME.width), height: Math.ceil(FRAME.height) } as const
/** Filmtijd van de winddeeltjes per afspeelseconde: 1 = de schermsnelheid van de app (U112; keuze van de PO). */
export const WIND_FILM_TEMPO = 1

export type BotRole = 'combined' | 'renderer' | 'poller'

export interface BotConfig {
  role: BotRole
  token: string
  origin: string
  cacheDirectory: string
  cacheChatId?: string
  registerPath?: string
  usageDirectory?: string
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
    usageDirectory: resolve(environment.MOTREGEN_USAGE_DIR ?? 'tmp/telegram-usage'),
  }
}
