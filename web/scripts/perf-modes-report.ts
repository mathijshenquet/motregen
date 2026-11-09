import type { Field, Manifest } from '../src/core/contract.js'
import type { LoadTraceSnapshot } from '../src/core/perf.js'
import { buildTimeline, epochInWindow, scrubberViewWindow, type EpochWindow } from '../src/core/time-model.js'

// Meetsuite U102 (C7): per kaartmodus × profiel de tijd tot kaart, histogram en tabel, bytes per bron
// en lange frames per interactie. Dit bestand is de pure analyse; e2e/perf-modes.rig.ts meet.

export const MAP_MODES = ['weer', 'lucht', 'gevoel', 'wind'] as const
export type MapMode = typeof MAP_MODES[number]

export const MODE_BUTTONS: Record<MapMode, string> = { weer: 'Weer', lucht: 'Lucht', gevoel: 'Gevoel', wind: 'Wind' }

/** De velden die de scrubber in deze modus tekent (HistogramScrubber: balken, wolken/zon, temperatuurlijn, wind). */
export const HISTOGRAM_FIELDS: Record<MapMode, readonly Field[]> = {
  weer: ['rain_rate'],
  lucht: ['cloud_low', 'cloud_mid', 'cloud_high', 'radiation', 'radiation_direct'],
  gevoel: ['feels_like_c', 'temp_c'],
  wind: ['wind_u_ms', 'wind_v_ms', 'gust_ms'],
}

/** De velden van de kaartlaag van deze modus (regen, bewolkingssluier, isolijnen, windlaag). */
export const MAP_FIELDS: Record<MapMode, readonly Field[]> = {
  weer: ['rain_rate'],
  lucht: ['cloud_frac'],
  gevoel: ['feels_like_c'],
  wind: ['wind_u_ms', 'wind_v_ms'],
}

/** Per kaartveld de twee frames rond `epoch` (de kaart mengt die twee). */
export function mapFrames(manifest: Manifest, mode: MapMode, epoch = Date.parse(manifest.now)): WantedFrame[] {
  return MAP_FIELDS[mode].flatMap((field) => {
    const timeline = buildTimeline(manifest, field)
    const right = timeline.findIndex((frame) => frame.epoch >= epoch)
    const indexes = right < 0 ? [timeline.length - 1] : right === 0 || timeline[right]!.epoch === epoch ? [right] : [right - 1, right]
    return indexes.filter((index) => index >= 0).map((index) => {
      const frame = timeline[index]!
      return { url: frame.chunk.url, frameIndex: frame.frameIndex, field, epoch: frame.epoch }
    })
  })
}

/**
 * Wat de kaart zelf rond "nu" decodeert: het framepaar en de buffer die showFrame (App.tsx) voor het afspelen
 * vooruithaalt, twee frames terug tot drie vooruit.
 */
export function mapBufferFrames(manifest: Manifest, mode: MapMode, epoch = Date.parse(manifest.now)): WantedFrame[] {
  return MAP_FIELDS[mode].flatMap((field) => {
    const timeline = buildTimeline(manifest, field)
    const right = timeline.findIndex((frame) => frame.epoch >= epoch)
    const upper = right < 0 ? timeline.length - 1 : right
    const lower = right <= 0 || timeline[right]!.epoch === epoch ? upper : right - 1
    return timeline.slice(Math.max(0, lower - 2), upper + 4).map((frame) => ({ url: frame.chunk.url, frameIndex: frame.frameIndex, field, epoch: frame.epoch }))
  })
}

export type DataSource = 'manifest' | 'rtcor' | 'nowcast' | 'seamless' | 'harmonie' | 'icon_d2' | 'ecmwf' | 'uv' | 'basemap' | 'plaatsen' | 'app' | 'overig'
export const DATA_SOURCES: readonly DataSource[] = ['manifest', 'rtcor', 'nowcast', 'seamless', 'harmonie', 'icon_d2', 'ecmwf', 'uv', 'basemap', 'plaatsen', 'app', 'overig']

const CHUNK_SOURCES = ['rtcor', 'nowcast', 'seamless', 'harmonie', 'icon_d2', 'ecmwf', 'uv'] as const

export function classifyRequest(url: string): DataSource {
  const parsed = new URL(url)
  const path = parsed.pathname
  if (path.endsWith('/manifest.json')) return 'manifest'
  // Chunknamen beginnen met de bron: `harmonie-20261109T0700-…` (regen) of `harmonie-wind_u_ms-20261109T0700-…`.
  const chunk = /\/chunks\/([^/]+)$/.exec(path)
  if (chunk) {
    const source = CHUNK_SOURCES.find((candidate) => chunk[1]!.startsWith(`${candidate}-`))
    if (source) return source
    if (chunk[1]!.startsWith('icon-d2-')) return 'icon_d2'
    if (chunk[1]!.startsWith('uv_clear-')) return 'uv'
  }
  if (/\/plaatsen[^/]*\.json$/.test(path)) return 'plaatsen'
  if (/\.(?:pmtiles|pbf|mvt)$/.test(path) || path.includes('/tiles/') || path.includes('/basemap/') || path.endsWith('style.json') || path.includes('/fonts/') || path.includes('/sprites/')) return 'basemap'
  if (/\.(?:js|mjs|ts|tsx|css|html|woff2?|svg|png|webmanifest|wasm|gz)$/.test(path) || path === '/' || !path.includes('.')) return 'app'
  return 'overig'
}

export interface NetworkEntry {
  url: string
  startMs: number
  endMs: number | null
  bytes: number
  fromCache: boolean
  failed: string | null
}

export interface SourceTotals {
  requests: number
  bytes: number
  firstStartMs: number | null
  lastEndMs: number | null
}

/** Requests en overgedragen bytes per bron tot `untilMs` (start vóór die grens telt mee). */
export function totalsBySource(entries: readonly NetworkEntry[], untilMs = Number.POSITIVE_INFINITY): Record<DataSource | 'totaal', SourceTotals> {
  const empty = (): SourceTotals => ({ requests: 0, bytes: 0, firstStartMs: null, lastEndMs: null })
  const totals = Object.fromEntries([...DATA_SOURCES, 'totaal'].map((source) => [source, empty()])) as Record<DataSource | 'totaal', SourceTotals>
  for (const entry of entries) {
    if (entry.startMs > untilMs || entry.url.startsWith('data:') || entry.url.startsWith('blob:')) continue
    for (const key of [classifyRequest(entry.url), 'totaal'] as const) {
      const row = totals[key]
      row.requests += 1
      row.bytes += entry.bytes
      row.firstStartMs = row.firstStartMs === null ? entry.startMs : Math.min(row.firstStartMs, entry.startMs)
      if (entry.endMs !== null) row.lastEndMs = row.lastEndMs === null ? entry.endMs : Math.max(row.lastEndMs, entry.endMs)
    }
  }
  return totals
}

export interface WantedFrame { url: string; frameIndex: number; field: Field; epoch: number }

/**
 * De frames die het histogram van deze modus nodig heeft voor het venster dat bij openen in beeld staat
 * (`scrubberViewWindow(now)`); per tijdstip het frame dat de app ook kiest (`buildTimeline`).
 */
export function histogramFrames(manifest: Manifest, mode: MapMode, window: EpochWindow = scrubberViewWindow(Date.parse(manifest.now))): WantedFrame[] {
  return HISTOGRAM_FIELDS[mode].flatMap((field) => buildTimeline(manifest, field)
    .filter((frame) => epochInWindow(frame.epoch, window))
    .map((frame) => ({ url: frame.chunk.url, frameIndex: frame.frameIndex, field, epoch: frame.epoch })))
}

/** Moment (ms sinds timeOrigin) waarop het laatste gevraagde frame gedecodeerd was; null als er één ontbreekt. */
export function framesCompleteMs(wanted: readonly WantedFrame[], trace: LoadTraceSnapshot): { completeMs: number | null; missing: WantedFrame[] } {
  const decoded = new Map<string, number>()
  for (const frame of trace.frames) {
    if (frame.decodedMs === undefined) continue
    decoded.set(`${pathOf(frame.url)}#${frame.frameIndex}`, frame.decodedMs)
  }
  let completeMs = 0
  const missing: WantedFrame[] = []
  for (const frame of wanted) {
    const at = decoded.get(`${pathOf(frame.url)}#${frame.frameIndex}`)
    if (at === undefined) missing.push(frame)
    else completeMs = Math.max(completeMs, at)
  }
  return { completeMs: missing.length || !wanted.length ? null : completeMs, missing }
}

// Manifest-URL's zijn relatief (`chunks/…`), de trace kent ze absoluut.
function pathOf(url: string): string {
  const index = url.indexOf('chunks/')
  return index >= 0 ? url.slice(index) : url
}

export interface LongFrame { startMs: number; durationMs: number; blockingMs: number }
export interface PhaseWindow { name: string; startMs: number; endMs: number }
export interface LongFrameStats { count: number; totalMs: number; blockingMs: number; maxMs: number }

/** Lange animatieframes (LoAF, ≥ 50 ms) die in het tijdvak van een fase beginnen. */
export function longFramesIn(frames: readonly LongFrame[], phase: Pick<PhaseWindow, 'startMs' | 'endMs'>): LongFrameStats {
  const inside = frames.filter((frame) => frame.startMs >= phase.startMs && frame.startMs < phase.endMs)
  return {
    count: inside.length,
    totalMs: Math.round(inside.reduce((sum, frame) => sum + frame.durationMs, 0)),
    blockingMs: Math.round(inside.reduce((sum, frame) => sum + frame.blockingMs, 0)),
    maxMs: Math.round(Math.max(0, ...inside.map((frame) => frame.durationMs))),
  }
}

export interface VisitReport {
  mode: MapMode
  profile: string
  visit: 'koud' | 'warm'
  run: number
  origin: string
  capturedAt: string
  loadAverage: number
  settled: boolean
  milestones: {
    firstMapMs: number | null
    ttfrMs: number | null
    histogramCompleteMs: number | null
    tableCompleteMs: number | null
    settledMs: number
  }
  histogram: { frames: number; missing: number }
  table: { rowsChecked: number }
  /** Tot het histogram compleet was (of tot settle als dat nooit gebeurde). */
  untilHistogram: Record<DataSource | 'totaal', SourceTotals>
  /** Tot de laadfase voorbij was: kaart, histogram en tabel compleet, daarna hooguit 3 s wachten op een stil netwerk. */
  untilSettled: Record<DataSource | 'totaal', SourceTotals>
  longFrames: Record<string, LongFrameStats>
  /** Alle requests tot het einde van de laadfase, voor nader onderzoek per bron. */
  network?: NetworkEntry[]
}

/** Bronsommen opnieuw uit de opgeslagen requests, bijvoorbeeld na een betere classificatie. */
export function withRecomputedTotals(report: VisitReport): VisitReport {
  if (!report.network) return report
  return {
    ...report,
    untilHistogram: totalsBySource(report.network, report.milestones.histogramCompleteMs ?? report.milestones.settledMs),
    untilSettled: totalsBySource(report.network, report.milestones.settledMs),
  }
}

export function median(values: readonly number[]): number | null {
  if (!values.length) return null
  const sorted = [...values].sort((left, right) => left - right)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

const kilobytes = (bytes: number | null) => bytes === null ? '—' : `${(bytes / 1000).toLocaleString('nl-NL', { maximumFractionDigits: 0 })} kB`
const seconds = (ms: number | null) => ms === null ? '—' : `${(ms / 1000).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s`

function medianOf(reports: readonly VisitReport[], pick: (report: VisitReport) => number | null): number | null {
  return median(reports.flatMap((report) => { const value = pick(report); return value === null ? [] : [value] }))
}

/** Mediaan per combinatie; een combinatie waarin een run iets niet haalde zegt dat met "n/m". */
export function renderSummary(reports: readonly VisitReport[]): string {
  const groups = new Map<string, VisitReport[]>()
  for (const report of reports) {
    const key = `${report.profile} ${report.visit}|${report.mode}`
    groups.set(key, [...groups.get(key) ?? [], report])
  }
  const reached = (group: VisitReport[], pick: (report: VisitReport) => number | null) => {
    const count = group.filter((report) => pick(report) !== null).length
    return count === group.length ? '' : ` (${count}/${group.length})`
  }
  const lines = [
    '| profiel | modus | runs | eerste kaart | histogram compleet | tabel compleet | bytes tot histogram | requests tot histogram | bytes laadfase | requests laadfase |',
    '| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ]
  for (const [key, group] of groups) {
    const [profile, mode] = key.split('|')
    lines.push(`| ${profile} | ${mode} | ${group.length} | ${seconds(medianOf(group, (report) => report.milestones.firstMapMs))}${reached(group, (report) => report.milestones.firstMapMs)} | ${seconds(medianOf(group, (report) => report.milestones.histogramCompleteMs))}${reached(group, (report) => report.milestones.histogramCompleteMs)} | ${seconds(medianOf(group, (report) => report.milestones.tableCompleteMs))}${reached(group, (report) => report.milestones.tableCompleteMs)} | ${kilobytes(medianOf(group, (report) => report.untilHistogram.totaal.bytes))} | ${medianOf(group, (report) => report.untilHistogram.totaal.requests) ?? '—'} | ${kilobytes(medianOf(group, (report) => report.untilSettled.totaal.bytes))} | ${medianOf(group, (report) => report.untilSettled.totaal.requests) ?? '—'} |`)
  }
  const sources = DATA_SOURCES.filter((source) => reports.some((report) => report.untilSettled[source].requests > 0))
  lines.push('', '**Bytes per bron in de laadfase** (mediaan, kB = 1000 B overgedragen; tussen haakjes requests)', '',
    `| profiel | modus | ${sources.join(' | ')} |`, `| --- | --- | ${sources.map(() => '---:').join(' | ')} |`)
  for (const [key, group] of groups) {
    const [profile, mode] = key.split('|')
    lines.push(`| ${profile} | ${mode} | ${sources.map((source) => `${kilobytes(medianOf(group, (report) => report.untilSettled[source].bytes))} (${medianOf(group, (report) => report.untilSettled[source].requests)})`).join(' | ')} |`)
  }
  lines.push('', '**Wanneer elke bron binnen was** (mediaan van het einde van de laatste request in de laadfase, s sinds navigatie)', '',
    `| profiel | modus | ${sources.join(' | ')} |`, `| --- | --- | ${sources.map(() => '---:').join(' | ')} |`)
  for (const [key, group] of groups) {
    const [profile, mode] = key.split('|')
    lines.push(`| ${profile} | ${mode} | ${sources.map((source) => seconds(medianOf(group, (report) => report.untilSettled[source].lastEndMs))).join(' | ')} |`)
  }
  const phases = [...new Set(reports.flatMap((report) => Object.keys(report.longFrames)))]
  lines.push('', '**Lange frames (LoAF ≥ 50 ms) per fase** (mediaan: aantal / blokkerende tijd / langste frame)', '',
    `| profiel | modus | ${phases.join(' | ')} |`, `| --- | --- | ${phases.map(() => '---:').join(' | ')} |`)
  for (const [key, group] of groups) {
    const [profile, mode] = key.split('|')
    lines.push(`| ${profile} | ${mode} | ${phases.map((phase) => {
      const stats = group.flatMap((report) => report.longFrames[phase] ? [report.longFrames[phase]] : [])
      if (!stats.length) return '—'
      return `${median(stats.map((stat) => stat.count))} / ${median(stats.map((stat) => stat.blockingMs))} ms / ${median(stats.map((stat) => stat.maxMs))} ms`
    }).join(' | ')} |`)
  }
  return `${lines.join('\n')}\n`
}
