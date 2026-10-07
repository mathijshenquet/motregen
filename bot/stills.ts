import { createHash } from 'node:crypto'
import type { PresetMode } from '../web/src/core/presets.js'
import { telegramStartParameter } from '../web/src/core/telegram-presets.js'

export const STILL_MODES = [
  { mode: 'weather', command: 'regen', query: 'weer', label: 'Regen', explanation: 'Regenintensiteit: blauw is lichte regen, geel/rood is zware regen.' },
  { mode: 'air', command: 'lucht', query: 'lucht', label: 'Lucht', explanation: 'Bewolking: een grijze sluier betekent meer wolken; regen staat erachter.' },
  { mode: 'feels', command: 'gevoel', query: 'gevoel', label: 'Gevoelstemperatuur', explanation: 'Gevoelstemperatuur in °C: blauw is kouder, rood is warmer; lijnen en getallen geven de temperatuur.' },
] as const

export const LOOP_MODES = [...STILL_MODES,
  { mode: 'wind', command: 'wind', query: 'wind', label: 'Wind', explanation: 'Wind: de bewegende deeltjes volgen richting en snelheid; warmere kleuren betekenen meer wind.' },
] as const

export const STILL_HOURS = [0, 3, 6, 12] as const
export type StillHour = typeof STILL_HOURS[number]
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

export interface StillManifest {
  generated: string
  now: string
  version: number
  chunks: Array<{ url: string; times: string[]; field?: string }>
}

export function stillEpoch(manifest: StillManifest, hour: StillHour): number {
  return Date.parse(manifest.now) + hour * 3_600_000
}

export function stillTime(epoch: number): string {
  const date = new Date(epoch)
  const weekday = new Intl.DateTimeFormat('nl-NL', { weekday: 'short', timeZone: 'Europe/Amsterdam' }).format(date)
  const time = new Intl.DateTimeFormat('nl-NL', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Amsterdam' }).format(date)
  return `${weekday} ${time}`
}

export function caption(mode: LoopMode, epoch: number): string {
  const definition = LOOP_MODES.find((entry) => entry.mode === mode)!
  return `${stillTime(epoch)} · ${definition.label}\n${definition.explanation}\nKNMI · OpenFreeMap · © OpenStreetMap\n${presetUrl('https://motregen.nl', mode, epoch)}`
}

export function cacheKey(selection: MediaSelection, manifest: StillManifest): string {
  const epoch = selection.hour === 'loop' ? Date.parse(manifest.now) : stillEpoch(manifest, selection.hour)
  const identity = JSON.stringify({ renderer: 6, ...selection, epoch, generated: manifest.generated })
  const digest = createHash('sha256').update(identity).digest('hex').slice(0, 24)
  return `${selection.mode}-${selection.hour}-${digest}`
}

export function presetUrl(origin: string, mode: PresetMode, epoch: number, still = false): string {
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

export function callbackData(selection: MediaSelection): string {
  return `${selection.mode}:${selection.hour}`
}

export function parseCallback(data: string | undefined): MediaSelection | undefined {
  if (!data) return undefined
  const [mode, hourText, extra] = data.split(':')
  if (extra !== undefined || !LOOP_MODES.some((entry) => entry.mode === mode)) return undefined
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

export function keyboard(selection: MediaSelection, epoch: number, origin: string, username: string, privateChat = false): { inline_keyboard: InlineButton[][] } {
  const modeButtons = LOOP_MODES.map((entry) => ({
    text: `${selection.mode === entry.mode ? '✓ ' : ''}${entry.command === 'gevoel' ? 'Gevoel' : entry.label}`,
    callback_data: callbackData(entry.mode === 'wind' || selection.hour === 'loop' ? { mode: entry.mode, hour: 'loop' } : { mode: entry.mode, hour: selection.hour }),
  }))
  const timeButtons: InlineButton[] = selection.mode === 'wind' ? [] : STILL_HOURS.map((hour) => ({
    text: `${selection.hour === hour ? '✓ ' : ''}${hour === 0 ? 'nu' : `+${hour}u`}`,
    callback_data: callbackData({ mode: selection.mode as StillMode, hour }),
  }))
  timeButtons.push({ text: `${selection.hour === 'loop' ? '✓ ' : ''}Loop`, callback_data: callbackData({ mode: selection.mode, hour: 'loop' }) })
  const openButton: InlineButton = { text: 'Open in motregen.nl' }
  if (privateChat && origin.startsWith('https:')) openButton.web_app = { url: presetUrl(origin, selection.mode, epoch) }
  else openButton.url = miniAppLink(username, selection.mode, epoch)
  return { inline_keyboard: [modeButtons, timeButtons, [openButton]] }
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
