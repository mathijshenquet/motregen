import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { basename } from 'node:path'
import { distribution, relativeDelta } from './mobile-fidelity'
import type { MobileReport } from './mobile-report'

interface TraceEvent {
  cat: string
  name: string
  ts: number
  dur?: number
  args?: { field?: string; blockingDuration?: number }
}

export interface PoReference {
  source: string
  sha256: string
  userAgent: string
  /** Tijden in ms sinds navigatiestart; die volgt uit een `window-ready`-meting (start 0, duur = tijdstip). */
  firstDecodeMs: number
  firstTextureUploadMs: number
  /** Start van de eerste reeks texture-uploads op afspeelcadans: de kaart wisselt vanaf hier van frame. */
  playbackUploadsFromMs: number | null
  windowReadyMs: Record<string, number>
  phases: Record<string, ReturnType<typeof distribution>>
  decodesBeforeRainWindow: number
  longFramesFirst12s: { count: number; totalMs: number; blockingMs: number }
}

const PLAYBACK_CADENCE_MS = 700

export function summarizePoRecording(path: string): PoReference {
  const contents = readFileSync(path)
  const trace = JSON.parse(contents.toString()) as { metadata: { userAgent: string }; traceEvents: TraceEvent[] }
  const windowReady = trace.traceEvents.filter((event) => event.name.startsWith('window-ready:'))
  if (!windowReady.length) throw new Error(`${path}: geen window-ready-meting, dus geen navigatiestart`)
  const navigationStartUs = windowReady[0]!.ts
  const sinceNavigation = (event: TraceEvent) => (event.ts - navigationStartUs) / 1_000
  const named = (name: string) => trace.traceEvents.filter((event) => event.cat === 'motregen.phase' && event.name === name)
  const grouped = new Map<string, number[]>()
  for (const event of trace.traceEvents) {
    if (event.cat !== 'motregen.phase' || event.name.startsWith('window-ready:')) continue
    grouped.set(event.name, [...grouped.get(event.name) ?? [], (event.dur ?? 0) / 1_000])
  }
  const uploads = named('texture-upload').map(sinceNavigation).sort((left, right) => left - right)
  // Drie uploads op rij binnen de afspeelcadans: los van de eerste beelden en de motion-texturen.
  const playbackStart = uploads.findIndex((time, index) => index + 2 < uploads.length && uploads[index + 1]! - time < PLAYBACK_CADENCE_MS && uploads[index + 2]! - uploads[index + 1]! < PLAYBACK_CADENCE_MS && index > 0 && time - uploads[index - 1]! > PLAYBACK_CADENCE_MS)
  const rainWindowMs = (windowReady.find((event) => event.name === 'window-ready:rain_rate')?.dur ?? Number.POSITIVE_INFINITY) / 1_000
  const longFrames = trace.traceEvents.filter((event) => event.cat === 'motregen.long-frame' && sinceNavigation(event) < 12_000)
  return {
    source: basename(path),
    sha256: createHash('sha256').update(contents).digest('hex'),
    userAgent: trace.metadata.userAgent,
    firstDecodeMs: Math.round(Math.min(...named('frame-decode').map(sinceNavigation))),
    firstTextureUploadMs: Math.round(uploads[0] ?? Number.NaN),
    playbackUploadsFromMs: playbackStart < 0 ? null : Math.round(uploads[playbackStart]!),
    windowReadyMs: Object.fromEntries(windowReady.map((event) => [event.name.slice('window-ready:'.length), Math.round((event.dur ?? 0) / 1_000)])),
    phases: Object.fromEntries([...grouped].map(([phase, durations]) => [phase, distribution(durations)])),
    decodesBeforeRainWindow: named('frame-decode').filter((event) => sinceNavigation(event) < rainWindowMs).length,
    longFramesFirst12s: {
      count: longFrames.length,
      totalMs: Math.round(longFrames.reduce((total, frame) => total + (frame.dur ?? 0) / 1_000, 0)),
      blockingMs: Math.round(longFrames.reduce((total, frame) => total + (frame.args?.blockingDuration ?? 0), 0)),
    },
  }
}

/** Per meetpunt: PO-opname, rig en de afwijking van de rig in procenten. */
export function calibrationRows(reference: PoReference, report: MobileReport): Array<{ measure: string; po: number | null; rig: number | null; deltaPercent: number | null }> {
  const row = (measure: string, po: number | null, rig: number | null) => ({ measure, po, rig, deltaPercent: relativeDelta(rig, po) })
  const phase = (name: string, key: 'p50Ms' | 'p95Ms' | 'count') => row(`${name} ${key}`, reference.phases[name]?.[key] ?? null, report.decode.phases[name]?.[key] ?? null)
  return [
    phase('frame-decode', 'p50Ms'),
    phase('frame-decode', 'p95Ms'),
    phase('basemap-tile', 'p50Ms'),
    phase('texture-upload', 'p50Ms'),
    phase('scrubber-paint', 'p50Ms'),
    row('eerste regenframe / eerste texture-upload', reference.firstTextureUploadMs, report.milestones.firstRainMs),
    row('ttfh (window-ready rain_rate)', reference.windowReadyMs.rain_rate ?? null, report.milestones.ttfhMs),
    row('ttfp / start uploads op afspeelcadans', reference.playbackUploadsFromMs, report.milestones.ttfpMs),
    row('lange frames eerste 12 s: aantal', reference.longFramesFirst12s.count, report.longFrames.first12s.count),
    row('lange frames eerste 12 s: totaal ms', reference.longFramesFirst12s.totalMs, Math.round(report.longFrames.first12s.totalMs)),
    row('lange frames eerste 12 s: blocking ms', reference.longFramesFirst12s.blockingMs, Math.round(report.longFrames.first12s.blockingMs)),
  ]
}

function main() {
  const [command, ...rest] = process.argv.slice(2)
  if (command === 'summarize' && rest.length === 2) {
    writeFileSync(rest[1]!, `${JSON.stringify(summarizePoRecording(rest[0]!), null, 2)}\n`)
    console.log(`PO-referentie: ${rest[1]}`)
    return
  }
  if (command === 'compare' && rest.length === 2) {
    const reference = JSON.parse(readFileSync(rest[0]!, 'utf8')) as PoReference
    const report = JSON.parse(readFileSync(rest[1]!, 'utf8')) as MobileReport
    console.log(`| meetpunt | PO-opname | rig ${report.meta.profile} (CPU ${report.meta.cpuThrottleRate}×) | afwijking |\n| --- | ---: | ---: | ---: |`)
    for (const { measure, po, rig, deltaPercent } of calibrationRows(reference, report)) {
      console.log(`| ${measure} | ${po ?? '—'} | ${rig ?? '—'} | ${deltaPercent === null ? '—' : `${deltaPercent > 0 ? '+' : ''}${deltaPercent.toFixed(0)} %`} |`)
    }
    return
  }
  throw new Error('Gebruik: tsx scripts/po-reference.ts summarize <opname.json> <uitvoer.json> | compare <referentie.json> <rigrapport.json>')
}

main()
