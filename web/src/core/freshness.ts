import type { Manifest, Source } from './contract'

export type FreshnessStatus = 'fresh' | 'aging' | 'stale' | 'offline'

// Een radarframe verschijnt nominaal ~3–5 min na zijn scantijd en daarna
// elke 5 min; met de 60 s-manifestpoll piekt de leeftijd in normaal bedrijf
// net onder de 10 min (prod-steekproef 2026-09-23, LOG u10).
export const FRESH_MAX_MS = 10 * 60_000
export const AGING_MAX_MS = 20 * 60_000

export interface RefreshState {
  // Laatste geslaagde controle van het manifest (ook als er niets nieuws was).
  checkedAt: number
  // Tijdstip van de laatste mislukte controle; undefined zodra een controle weer slaagt.
  failedAt?: number
}

export interface SourceFreshness {
  source: Source
  label: string
  // Wat het tijdstip betekent: laatste meting (radar) of run-/referentietijd (verwachtingen).
  kind: 'measured' | 'run'
  epoch: number
  cadence: string
  provider: string
  explanation: string
  cadenceMs: number
  // Gebruikelijke tijd tussen meting/run en publicatie; schatting uit één prod-steekproef
  // (2026-09-25 13:43, U34), behalve de radar (LOG u17).
  delayMs: number
}

const MINUTE = 60_000
const SOURCE_ROWS: Array<Omit<SourceFreshness, 'epoch'>> = [
  { source: 'rtcor', label: 'Radar', kind: 'measured', cadence: 'elke 5 min', provider: 'KNMI-radar', explanation: 'Gemeten neerslag, bijgesteld met regenmeters', cadenceMs: 5 * MINUTE, delayMs: 3 * MINUTE },
  { source: 'nowcast', label: 'Nowcast', kind: 'run', cadence: 'elke 5 min', provider: 'KNMI-nowcast', explanation: 'Radarbeeld doorgetrokken, 2 uur vooruit', cadenceMs: 5 * MINUTE, delayMs: 3 * MINUTE },
  { source: 'seamless', label: 'Blend', kind: 'run', cadence: 'elk kwartier', provider: 'KNMI seamless', explanation: 'Nowcast die overloopt in het weermodel, 6 uur vooruit', cadenceMs: 15 * MINUTE, delayMs: 15 * MINUTE },
  { source: 'harmonie', label: 'HARMONIE', kind: 'run', cadence: 'elke 3 uur', provider: 'KNMI HARMONIE-AROME', explanation: 'Weermodel voor regen, wind en temperatuur, 60 uur vooruit', cadenceMs: 180 * MINUTE, delayMs: 120 * MINUTE },
  { source: 'uv', label: 'UV', kind: 'run', cadence: 'elk kwartier', provider: 'KNMI UV-index', explanation: 'Zonkracht met en zonder wolken', cadenceMs: 15 * MINUTE, delayMs: 0 },
]

/** Wanneer de volgende meting/run ongeveer binnenkomt. */
export function expectedNext(row: SourceFreshness): number {
  return row.epoch + row.cadenceMs + row.delayMs
}

// Per bron het recentste tijdstip: voor de radar de laatste meting (niet de
// chunk-run, want een rtcor-chunk groeit binnen zijn uur), elders de nieuwste run.
export function sourceFreshness(manifest: Manifest): SourceFreshness[] {
  const latest = new Map<Source, number>()
  for (const chunk of manifest.chunks) {
    const stamps = chunk.source === 'rtcor' ? chunk.times : [chunk.run]
    for (const stamp of stamps) {
      const epoch = Date.parse(stamp)
      if (Number.isFinite(epoch) && epoch > (latest.get(chunk.source) ?? -Infinity)) latest.set(chunk.source, epoch)
    }
  }
  return SOURCE_ROWS.flatMap((row) => {
    const epoch = latest.get(row.source)
    return epoch === undefined ? [] : [{ ...row, epoch }]
  })
}

// Scantijd + 5 min cadans + publicatievertraging (prod 2026-09-24: ~3 min, LOG u17).
const RADAR_NEXT_MS = 8 * 60_000

export function expectedNextRadar(radarEpoch: number): number {
  return radarEpoch + RADAR_NEXT_MS
}

export function latestRadarEpoch(manifest: Manifest): number | undefined {
  return sourceFreshness(manifest).find((row) => row.source === 'rtcor')?.epoch
}

// Een klok die voorloopt op de server mag geen negatieve leeftijd opleveren.
export function ageMs(epoch: number, now: number): number {
  return Math.max(0, now - epoch)
}

export function freshnessStatus(radarEpoch: number | undefined, now: number, refresh: RefreshState | undefined): FreshnessStatus {
  if (refresh?.failedAt !== undefined) return 'offline'
  if (radarEpoch === undefined) return 'stale'
  const age = ageMs(radarEpoch, now)
  if (age <= FRESH_MAX_MS) return 'fresh'
  if (age <= AGING_MAX_MS) return 'aging'
  return 'stale'
}

export const STATUS_LABELS: Record<FreshnessStatus, string> = {
  fresh: 'Actueel',
  aging: 'Loopt achter',
  stale: 'Verouderd',
  offline: 'Offline',
}

export function formatAge(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'zojuist'
  if (minutes < 60) return `${minutes} min geleden`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) {
    const rest = minutes % 60
    return rest ? `${hours} u ${rest} min geleden` : `${hours} u geleden`
  }
  const days = Math.floor(hours / 24)
  return days === 1 ? '1 dag geleden' : `${days} dagen geleden`
}

// Kort genoeg voor de kaartpil op een smalle telefoon.
export function formatAgeShort(ms: number): string {
  const minutes = Math.floor(ms / 60_000)
  if (minutes < 1) return 'zojuist'
  if (minutes < 60) return `${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} u`
  return `${Math.floor(hours / 24)} d`
}

export function formatClock(epoch: number, now: number): string {
  const time = new Date(epoch).toLocaleTimeString('nl-NL', { hour: '2-digit', minute: '2-digit' })
  const day = (at: number) => new Date(at).toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' })
  return day(epoch) === day(now) ? time : `${day(epoch)} ${time}`
}
