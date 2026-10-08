import { placeName, placeSlug } from './place-slug.js'
import { nearestPlace } from './places.js'

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
  savedPlace?: boolean
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

export const pathModes = {
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
/** Compacte lokale vorm zonder dubbele punten (URL-vriendelijk), Europe/Amsterdam: `2026-10-08T0757` (PO 2026-10-07). */
const localTime = /^(\d{4})-(\d{2})-(\d{2})T(\d{2})(\d{2})$/
const LOCAL_ZONE = 'Europe/Amsterdam'
const localParts = new Intl.DateTimeFormat('en-GB', { timeZone: LOCAL_ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })

function localWallClock(epoch: number): { year: number; month: number; day: number; hour: number; minute: number } {
  const part = Object.fromEntries(localParts.formatToParts(epoch).map((item) => [item.type, item.value]))
  return { year: Number(part.year), month: Number(part.month), day: Number(part.day), hour: Number(part.hour), minute: Number(part.minute) }
}

/** `2026-10-08T0757` in Europe/Amsterdam; minuten-precisie. */
export function formatLocalTime(epoch: number): string {
  const wall = localWallClock(epoch)
  const two = (value: number) => String(value).padStart(2, '0')
  return `${wall.year}-${two(wall.month)}-${two(wall.day)}T${two(wall.hour)}${two(wall.minute)}`
}

/** Omgekeerde van formatLocalTime: zoek de UTC-epoch waarvan de Amsterdamse wandklok op de gevraagde minuut staat. */
function parseLocalTime(value: string): number | undefined {
  const match = localTime.exec(value)
  if (!match) return undefined
  const [, year, month, day, hour, minute] = match.map(Number)
  const wanted = Date.UTC(year!, month! - 1, day!, hour!, minute!)
  // Eerste gok: alsof het UTC was; de echte offset volgt uit de wandklok van die gok (één correctie volstaat,
  // behalve in het DST-overgangsuur, waar de eerste geldige lezing wint).
  for (const guess of [wanted, wanted - 3_600_000, wanted - 7_200_000]) {
    const wall = localWallClock(guess)
    if (Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute) === wanted) return guess
  }
  return undefined
}

export function parsePresetPath(pathname: string): UrlPresets {
  const segments = pathname.replace(/^\/|\/$/g, '').split('/')
  if (segments.length > 2 || (segments.length === 2 && !segments[1])) return {}
  const mode = modeNames[segments[0]?.toLowerCase() as keyof typeof modeNames]
  if (!mode) return {}
  try {
    const place = segments[1] ? placeName(decodeURIComponent(segments[1])) : undefined
    return segments[1] && !place ? {} : { mode, ...(place && { place }) }
  } catch { return {} }
}

export function parsePresets(search: string | URLSearchParams, now = Date.now(), pathname = '/', hash = ''): UrlPresets {
  const params = typeof search === 'string' ? new URLSearchParams(search) : search
  const path = parsePresetPath(pathname)
  const point = parsePoint(params)
  const place = point ? undefined : parsePlace(params.get('plaats')) ?? path.place
  const mode = modeNames[params.get('modus') as keyof typeof modeNames] ?? path.mode
  const epoch = parseEpoch(new URLSearchParams(hash.replace(/^#/, '')).get('t') ?? params.get('t'), now)
  return { ...(mode && { mode }), ...(epoch !== undefined && { epoch }), ...(place && { place }), ...(point && { point }) }
}

export function modeForFocus(mode: PresetMode): FocusName {
  return focusModes[mode]
}

export function modeForActiveFocus(focus: string | undefined): PresetMode {
  return (Object.entries(focusModes).find(([, value]) => value === focus)?.[0] as PresetMode | undefined) ?? 'weather'
}

/** Een plaatsnaam in de link leest beter en lekt minder dan een pin (PO 2026-10-07); generieke labels tellen niet. */
export function shareablePlace(label: string | undefined): string | undefined {
  const place = label?.trim()
  if (!place || /^(mijn locatie|thuis|werk)$/i.test(place) || /^-?\d/.test(place)) return undefined
  return place
}

export function presetPath(mode: PresetMode, place?: string): string {
  const slug = place && placeSlug(place)
  return `/${pathModes[mode]}${slug ? `/${slug}` : ''}`
}

export function sharePlace(state: ShareState): string | undefined {
  return (!state.savedPlace && shareablePlace(state.place)) || nearestPlace(state.point.lng, state.point.lat).name
}

/** Andere queryparameters (dev, perf, tg) blijven behouden; modus en plek staan in het pad. */
export function applyPresetParams(params: URLSearchParams): URLSearchParams {
  for (const key of ['modus', 'plaats', 'lat', 'lon', 't']) params.delete(key)
  return params
}

export function applyPresetUrl(url: URL, state: ShareState, includeTime: boolean): URL {
  url.pathname = presetPath(state.mode, sharePlace(state))
  applyPresetParams(url.searchParams)
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ''))
  if (includeTime) fragment.set('t', formatLocalTime(Math.round(state.epoch / 60_000) * 60_000))
  else fragment.delete('t')
  url.hash = fragment.toString()
  return url
}

/** Maakt altijd een productie-link: gedeelde previews horen naar de publieke app te wijzen. */
export function shareUrl(state: ShareState): string {
  const url = new URL('https://motregen.nl/')
  applyPresetUrl(url, state, true)
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
  const local = parseLocalTime(normalized)
  if (local !== undefined) return local
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
