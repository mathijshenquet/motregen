import { createHash } from 'node:crypto'
import type { PresetMode } from '../web/src/core/presets.js'
import { telegramStartParameter } from '../web/src/core/telegram-presets.js'

// `command` staat in het commandomenu; `aliases` werken ook maar staan er alleen in als `listed`.
// `button` is de tekst op de modusknop onder het beeld. `deltaMinutes` zijn de tijdknoppen rond "nu", per
// modus instelbaar; elke stap moet een veelvoud van tien minuten zijn (STILL_MINUTES).
const DEFAULT_DELTA_MINUTES = [-60, -10, 10, 60] as const
export const STILL_MODES = [
  { mode: 'weather', command: 'regen', aliases: [], listed: [], query: 'weer', label: 'Regen', button: 'Regen', deltaMinutes: DEFAULT_DELTA_MINUTES },
  // PO 2026-10-07: /temperatuur met alias /hitte. /gevoel (de naam tot U58) blijft werken zonder vermelding.
  // De knop heet Temperatuur, net als het commando (PO 2026-10-08); de tab in de app blijft "Gevoel".
  { mode: 'feels', command: 'temperatuur', aliases: ['hitte', 'gevoel'], listed: ['hitte'], query: 'gevoel', label: 'Gevoelstemperatuur', button: 'Temperatuur', deltaMinutes: DEFAULT_DELTA_MINUTES },
] as const

export const LOOP_MODES = [...STILL_MODES,
  { mode: 'wind', command: 'wind', aliases: [], listed: [], query: 'wind', label: 'Wind', button: 'Wind', deltaMinutes: [] },
] as const

/** De modus van een commando of alias, zonder schuine streep. */
export function modeForCommand(command: string): LoopMode | undefined {
  const name = command.toLowerCase()
  return LOOP_MODES.find((entry) => entry.command === name || (entry.aliases as readonly string[]).includes(name))?.mode
}

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
  const identity = JSON.stringify({ renderer: 13, mode: selection.mode, kind: selection.hour === 'loop' ? 'loop' : 'photo', epoch, generated: Date.parse(manifest.generated) })
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
    return !normalized || [entry.command, ...entry.aliases, entry.label.toLocaleLowerCase('nl-NL')].some((name) => name.includes(normalized))
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
    text: `${selection.mode === entry.mode ? '✓ ' : ''}${entry.button}`,
    callback_data: callbackData(entry.mode === 'wind' || selection.hour === 'loop' ? { mode: entry.mode, hour: 'loop' } : { mode: entry.mode, hour: selection.hour }, epoch, generated),
  }))
  const timeButtons: InlineButton[] = []
  if (selection.mode !== 'wind') {
    const stillMode = selection.mode
    const minute = selection.hour === 'loop' ? 0 : Math.round(selection.hour * 60)
    const deltas: readonly number[] = STILL_MODES.find((entry) => entry.mode === stillMode)!.deltaMinutes
    const deltaButton = (delta: number): InlineButton[] => STILL_MINUTES.includes(minute + delta)
      ? [{ text: deltaLabel(delta), callback_data: callbackData({ mode: stillMode, hour: (minute + delta) / 60 }, epoch + delta * 60_000, generated) }]
      : []
    timeButtons.push(...deltas.filter((delta) => delta < 0).flatMap(deltaButton))
    timeButtons.push({ text: `${selection.hour === 0 ? '✓ ' : ''}nu`, callback_data: callbackData({ mode: stillMode, hour: 0 }) })
    timeButtons.push(...deltas.filter((delta) => delta > 0).flatMap(deltaButton))
  }
  timeButtons.push({ text: `${selection.hour === 'loop' ? '✓ ' : ''}Loop`, callback_data: callbackData({ mode: selection.mode, hour: 'loop' }, epoch, generated) })
  return { inline_keyboard: [modeButtons, timeButtons] }
}

/** −1u, −10m, +10m, +1u: hele uren in uren, de rest in minuten. */
export function deltaLabel(minutes: number): string {
  const size = Math.abs(minutes)
  return `${minutes < 0 ? '−' : '+'}${size % 60 === 0 ? `${size / 60}u` : `${size}m`}`
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
