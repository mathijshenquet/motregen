import { resolve } from 'node:path'

export interface BotConfig {
  token: string
  origin: string
  cacheDirectory: string
  port: number
}

export function readConfig(environment: NodeJS.ProcessEnv = process.env): BotConfig {
  const token = environment.TG_BOT_KEY?.trim()
  if (!token) throw new Error('TG_BOT_KEY ontbreekt')
  const origin = new URL(environment.MOTREGEN_ORIGIN ?? 'https://motregen.nl')
  if (!['http:', 'https:'].includes(origin.protocol)) throw new Error('MOTREGEN_ORIGIN moet HTTP(S) zijn')
  const port = Number(environment.MOTREGEN_BOT_PORT ?? 8090)
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Ongeldige MOTREGEN_BOT_PORT')
  return {
    token,
    origin: origin.origin,
    cacheDirectory: resolve(environment.MOTREGEN_RENDER_CACHE ?? 'tmp/telegram-stills'),
    port,
  }
}
