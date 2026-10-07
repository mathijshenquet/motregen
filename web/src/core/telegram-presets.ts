import { parsePresets, type PresetMode, type UrlPresets } from './presets.js'

const telegramModes: Record<PresetMode, string> = {
  weather: 'weer',
  air: 'lucht',
  feels: 'gevoel',
  wind: 'wind',
}

export function telegramStartParameter(mode: PresetMode, epoch: number): string {
  return `${telegramModes[mode]}_${Math.floor(epoch / 1000)}`
}

export function telegramPresetSearch(search: string, startParameter?: string): URLSearchParams {
  const params = new URLSearchParams(search)
  if (params.get('tg') !== '1') return params
  const parameter = startParameter ?? params.get('tgWebAppStartParam') ?? params.get('startapp')
  const match = /^(weer|lucht|gevoel|wind)_(\d{1,12})$/.exec(parameter ?? '')
  if (!match) return params
  const epoch = Number(match[2]) * 1000
  if (!Number.isFinite(epoch)) return params
  if (!params.has('modus')) params.set('modus', match[1]!)
  if (!params.has('t')) params.set('t', new Date(epoch).toISOString())
  return params
}

export function telegramPresets(parameter: string): UrlPresets {
  return parsePresets(telegramPresetSearch('?tg=1', parameter))
}
