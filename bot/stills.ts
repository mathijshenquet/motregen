import { createHash } from 'node:crypto'
import type { PresetMode } from '../web/src/core/presets.js'
import { telegramStartParameter } from '../web/src/core/telegram-presets.js'

export const STILL_MODES = [
  { mode: 'weather', command: 'regen', query: 'weer', label: 'Regen' },
  { mode: 'feels', command: 'gevoel', query: 'gevoel', label: 'Gevoelstemperatuur' },
] as const

export const LOOP_MODES = [...STILL_MODES,
  { mode: 'wind', command: 'wind', query: 'wind', label: 'Wind' },
] as const

export const STILL_MINUTES = Array.from({ length: 85 }, (_, index) => -120 + index * 10)
export const STILL_HOURS = STILL_MINUTES.map((minute) => minute / 60)
export const PREWARM_HOURS = [0, -1 / 6, 1 / 6, -1, 1] as const
export type StillHour = number
export type StillMode = typeof STILL_MODES[number]['mode']
export type LoopMode = typeof LOOP_MODES[number]['mode']

export interface StillSelection {
  mode: StillMode
  hour: StillHour
}

export interface LoopSelection {
  mode: LoopMode
  hour: 'loop'
}

export type MediaSelection = StillSelection | LoopSelection
export type CallbackSelection = (MediaSelection & { generated?: number }) | { mode: StillMode; hour: 'at'; epoch: number; generated: number }

export interface StillManifest {
  generated: string
  now: string
  version: number
  chunks: Array<{ url: string; times: string[]; field?: string }>
}

export function stillEpoch(manifest: StillManifest, hour: StillHour): number {
  return Date.parse(manifest.now) + Math.round(hour * 3_600_000)
}

export function stillTime(epoch: number): string {
  const date = new Date(epoch)
  const weekday = new Intl.DateTimeFormat('nl-NL', { weekday: 'short', timeZone: 'Europe/Amsterdam' }).format(date)
  const time = new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' }).format(date)
  return `${weekday} ${time}`
}

export function caption(mode: LoopMode, epoch: number): string {
  return `<a href="${presetUrl('https://motregen.nl', mode, epoch).replaceAll('&', '&amp;')}">motregen.nl</a>`
}

export function cacheKey(selection: MediaSelection, manifest: StillManifest): string {
  const epoch = selection.hour === 'loop' ? Date.parse(manifest.now) : stillEpoch(manifest, selection.hour)
  const identity = JSON.stringify({ renderer: 10, mode: selection.mode, kind: selection.hour === 'loop' ? 'loop' : 'photo', epoch, generated: Date.parse(manifest.generated) })
  const digest = createHash('sha256').update(identity).digest('hex').slice(0, 24)
  return `${selection.mode}-${selection.hour === 'loop' ? 'loop' : epoch}-${digest}`
}

export function presetUrl(origin: string, mode: LoopMode, epoch: number, still = false): string {
  const url = new URL('/', origin)
  const definition = LOOP_MODES.find((entry) => entry.mode === mode)!
  url.searchParams.set('modus', definition.query)
  url.searchParams.set('t', new Date(epoch).toISOString())
  url.searchParams.set(still ? 'still' : 'tg', '1')
  return url.href
}

export function miniAppLink(username: string, mode: PresetMode, epoch: number): string {
  const url = new URL(`https://t.me/${username}`)
  url.searchParams.set('startapp', telegramStartParameter(mode, epoch))
  return url.href
}

export function callbackData(selection: MediaSelection, epoch?: number, generated?: string): string {
  if (generated) {
    if (selection.hour === 'loop') return `${selection.mode}:loop:${Date.parse(generated)}`
    return `${selection.mode}:at:${epoch}:${Date.parse(generated)}`
  }
  return `${selection.mode}:${selection.hour}`
}

export function parseCallback(data: string | undefined): CallbackSelection | undefined {
  if (!data) return undefined
  const [mode, hourText, epochText, generatedText, extra] = data.split(':')
  if (extra !== undefined || !LOOP_MODES.some((entry) => entry.mode === mode)) return undefined
  if (hourText === 'loop' && epochText !== undefined && generatedText === undefined && /^\d{13}$/.test(epochText)) return { mode: mode as LoopMode, hour: 'loop', generated: Number(epochText) }
  if (hourText === 'at' && STILL_MODES.some((entry) => entry.mode === mode) && /^\d{13}$/.test(epochText ?? '') && /^\d{13}$/.test(generatedText ?? '')) return { mode: mode as StillMode, hour: 'at', epoch: Number(epochText), generated: Number(generatedText) }
  if (epochText !== undefined) return undefined
  if (hourText === 'loop') return { mode: mode as LoopMode, hour: 'loop' }
  if (!STILL_MODES.some((entry) => entry.mode === mode)) return undefined
  const hour = STILL_HOURS.find((candidate) => String(candidate) === hourText)
  if (hour === undefined) return undefined
  return { mode: mode as StillMode, hour }
}

export function matchingModes(query: string): LoopMode[] {
  const normalized = query.trim().toLocaleLowerCase('nl-NL')
  return LOOP_MODES.filter((entry) => {
    return !normalized || entry.command.includes(normalized) || entry.label.toLocaleLowerCase('nl-NL').includes(normalized)
  }).map((entry) => entry.mode)
}

export interface InlineButton {
  text: string
  callback_data?: string
  url?: string
  web_app?: { url: string }
}

export function keyboard(selection: MediaSelection, epoch: number, generated?: string): { inline_keyboard: InlineButton[][] } {
  const modeButtons = LOOP_MODES.map((entry) => ({
    text: `${selection.mode === entry.mode ? '✓ ' : ''}${entry.command === 'gevoel' ? 'Gevoel' : entry.label}`,
    callback_data: callbackData(entry.mode === 'wind' || selection.hour === 'loop' ? { mode: entry.mode, hour: 'loop' } : { mode: entry.mode, hour: selection.hour }, epoch, generated),
  }))
  const timeButtons: InlineButton[] = []
  if (selection.mode !== 'wind') {
    const minute = selection.hour === 'loop' ? 0 : Math.round(selection.hour * 60)
    for (const [delta, label] of [[-60, '−1u'], [-10, '−10m'], [0, 'nu'], [10, '+10m'], [60, '+1u']] as const) {
      if (delta === 0) timeButtons.push({ text: `${selection.hour === 0 ? '✓ ' : ''}nu`, callback_data: callbackData({ mode: selection.mode, hour: 0 }) })
      else if (STILL_MINUTES.includes(minute + delta)) timeButtons.push({ text: label, callback_data: callbackData({ mode: selection.mode, hour: (minute + delta) / 60 }, epoch + delta * 60_000, generated) })
    }
  }
  timeButtons.push({ text: `${selection.hour === 'loop' ? '✓ ' : ''}Loop`, callback_data: callbackData({ mode: selection.mode, hour: 'loop' }, epoch, generated) })
  return { inline_keyboard: [modeButtons, timeButtons] }
}

export function validateManifest(value: unknown): StillManifest {
  const manifest = value as StillManifest | null
  if (!manifest || manifest.version !== 0 || !Number.isFinite(Date.parse(manifest.generated)) || !Number.isFinite(Date.parse(manifest.now)) || !Array.isArray(manifest.chunks) || !manifest.chunks.length) {
    throw new Error('Ongeldig of leeg manifest')
  }
  for (const chunk of manifest.chunks) {
    if (typeof chunk.url !== 'string' || !Array.isArray(chunk.times) || !chunk.times.every((time) => Number.isFinite(Date.parse(time)))) {
      throw new Error('Ongeldige manifestchunk')
    }
  }
  return manifest
}
