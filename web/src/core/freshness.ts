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
}

const SOURCE_ROWS: Array<Omit<SourceFreshness, 'epoch'>> = [
  { source: 'rtcor', label: 'Radar', kind: 'measured', cadence: 'elke 5 min' },
  { source: 'nowcast', label: 'Nowcast', kind: 'run', cadence: 'elke 5 min' },
  { source: 'seamless', label: 'Blend', kind: 'run', cadence: 'elk kwartier' },
  { source: 'harmonie', label: 'HARMONIE', kind: 'run', cadence: 'elke 3 uur' },
  { source: 'uv', label: 'UV', kind: 'run', cadence: 'elk kwartier' },
]

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
