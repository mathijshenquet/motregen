import type { FocusKind } from './focus-mode'

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
}

/** URL-termen blijven los van de interne focusnamen, zodat U42 die namen plaatselijk kan wijzigen. */
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
} as const satisfies Record<PresetMode, FocusKind>

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

export function modeForFocus(mode: PresetMode): FocusKind {
  return focusModes[mode]
}

export function modeForActiveFocus(focus: FocusKind | undefined): PresetMode {
  return (Object.entries(focusModes).find(([, value]) => value === focus)?.[0] as PresetMode | undefined) ?? 'weather'
}

/** Maakt altijd een productie-link: gedeelde previews horen naar de publieke app te wijzen. */
export function shareUrl({ mode, epoch, point }: ShareState): string {
  const url = new URL('https://motregen.nl/')
  url.searchParams.set('modus', queryModes[mode])
  url.searchParams.set('t', new Date(epoch).toISOString())
  url.searchParams.set('lat', point.lat.toFixed(3))
  url.searchParams.set('lon', point.lng.toFixed(3))
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
