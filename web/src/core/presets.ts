export type PresetMode = 'weather' | 'air' | 'feels' | 'wind'

export interface PresetPoint {
  lng: number
  lat: number
}

export interface UrlPresets {
  mode?: PresetMode
  epoch?: number
  place?: string
  point?: PresetPoint
}

export interface ShareState {
  mode: PresetMode
  epoch: number
  point: PresetPoint
  /** Label van de gekozen plek (zoekresultaat of dichtstbijzijnde plaats). */
  place?: string
}

/** URL-termen blijven los van de interne focusnamen; de focusnamen staan hier als losse literals zodat de
 * bot (nodenext) presets.ts kan typechecken zonder focus-mode/wind-layer mee te trekken. */
type FocusName = 'weather' | 'air' | 'temperature' | 'wind'

const modeNames = {
  weer: 'weather',
  lucht: 'air',
  gevoel: 'feels',
  wind: 'wind',
} as const satisfies Record<string, PresetMode>

const queryModes = {
  weather: 'weer',
  air: 'lucht',
  feels: 'gevoel',
  wind: 'wind',
} as const satisfies Record<PresetMode, string>

const focusModes = {
  weather: 'weather',
  air: 'air',
  feels: 'temperature',
  wind: 'wind',
} as const satisfies Record<PresetMode, FocusName>

const relativeTime = /^([+-])(\d+)([um])$/
const isoTime = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:?\d{2})$/

export function parsePresets(search: string | URLSearchParams, now = Date.now()): UrlPresets {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search
  const point = parsePoint(params)
  const place = point ? undefined : parsePlace(params.get('plaats'))
  const mode = modeNames[params.get('modus') as keyof typeof modeNames]
  const epoch = parseEpoch(params.get('t'), now)
  return { ...(mode && { mode }), ...(epoch !== undefined && { epoch }), ...(place && { place }), ...(point && { point }) }
}

export function modeForFocus(mode: PresetMode): FocusName {
  return focusModes[mode]
}

export function modeForActiveFocus(focus: string | undefined): PresetMode {
  return (Object.entries(focusModes).find(([, value]) => value === focus)?.[0] as PresetMode | undefined) ?? 'weather'
}

/** Schrijft modus, plek en (optioneel) tijdstip in bestaande zoekparameters; andere parameters (dev, perf, tg) blijven. */
/** Een plaatsnaam in de link leest beter en lekt minder dan een pin (PO 2026-10-07); generieke labels tellen niet. */
export function shareablePlace(label: string | undefined): string | undefined {
  const place = label?.trim()
  if (!place || place === 'Mijn locatie' || /^-?\d/.test(place)) return undefined
  return place
}

export function applyPresetParams(params: URLSearchParams, state: ShareState, includeTime: boolean): URLSearchParams {
  params.set('modus', queryModes[state.mode])
  if (includeTime) params.set('t', new Date(Math.round(state.epoch / 60_000) * 60_000).toISOString().replace('.000Z', 'Z'))
  else params.delete('t')
  const place = shareablePlace(state.place)
  if (place) {
    params.set('plaats', place)
    params.delete('lat')
    params.delete('lon')
  } else {
    params.set('lat', state.point.lat.toFixed(3))
    params.set('lon', state.point.lng.toFixed(3))
    params.delete('plaats')
  }
  return params
}

/** Maakt altijd een productie-link: gedeelde previews horen naar de publieke app te wijzen. */
export function shareUrl(state: ShareState): string {
  const url = new URL('https://motregen.nl/')
  applyPresetParams(url.searchParams, state, true)
  return url.href
}

/** Een moment buiten de beschikbare tijdlijn blijft op de dichtstbijzijnde rand staan. */
export function cursorForPresetEpoch(timeline: readonly { epoch: number }[], epoch: number): number | undefined {
  if (!timeline.length || !Number.isFinite(epoch)) return undefined
  const first = timeline[0]!.epoch
  const lastIndex = timeline.length - 1
  const last = timeline[lastIndex]!.epoch
  if (epoch <= first) return 0
  if (epoch >= last) return lastIndex
  let right = 1
  while (timeline[right]!.epoch < epoch) right++
  const left = right - 1
  const span = timeline[right]!.epoch - timeline[left]!.epoch
  return left + (epoch - timeline[left]!.epoch) / span
}

function parseEpoch(value: string | null, now: number): number | undefined {
  if (!value) return undefined
  // URLSearchParams decodeert een ongeëscapete `+` als spatie; deelbare `?t=+2u` blijft zo leesbaar.
  const normalized = value.startsWith(' ') ? `+${value.trimStart()}` : value
  const relative = relativeTime.exec(normalized)
  if (relative) {
    const amount = Number(relative[2])
    if (!Number.isSafeInteger(amount) || !Number.isFinite(now)) return undefined
    const unit = relative[3] === 'u' ? 3_600_000 : 60_000
    return now + (relative[1] === '+' ? amount : -amount) * unit
  }
  if (!isoTime.test(normalized)) return undefined
  const epoch = Date.parse(normalized)
  return Number.isFinite(epoch) ? epoch : undefined
}

function parsePoint(params: URLSearchParams): PresetPoint | undefined {
  const lat = parseCoordinate(params.get('lat'), -90, 90)
  const lng = parseCoordinate(params.get('lon'), -180, 180)
  return lat === undefined || lng === undefined ? undefined : { lng, lat }
}

function parseCoordinate(value: string | null, minimum: number, maximum: number): number | undefined {
  if (!value?.trim()) return undefined
  const coordinate = Number(value)
  return Number.isFinite(coordinate) && coordinate >= minimum && coordinate <= maximum ? coordinate : undefined
}

function parsePlace(value: string | null): string | undefined {
  const place = value?.trim()
  return place && place.length <= 120 ? place : undefined
}
