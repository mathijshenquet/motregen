import { distribution, relativeDelta } from './mobile-fidelity'

export type ResourceKind = 'manifest' | 'chunks' | 'tiles' | 'other'
export interface WireRequest {
  url: string
  startMs: number
  endMs: number | null
  encodedBodyBytes: number | null
  range: string | null
  status: number | null
  failure: string | null
  bodySizeSource?: 'playwright-sizes' | 'completed-content-length'
  playwrightBodySize?: number | null
  contentLength?: number | null
}
export interface TimingRequest {
  url: string
  startMs: number
  endMs: number
  encodedBodyBytes: number
}
export interface PhaseEntry {
  phase: string
  startTime: number
  duration: number
  detail?: Record<string, unknown>
}
export interface Totals { requests: number; bytes: number; meanRequestBytes: number }
export type WireTotals = Record<ResourceKind | 'total', Totals>

export function resourceKind(url: string): ResourceKind {
  const path = new URL(url, 'http://localhost').pathname
  if (path.endsWith('/manifest.json')) return 'manifest'
  if (path.endsWith('.mrf') || path.includes('/chunks/')) return 'chunks'
  if (path.includes('/tiles/') || /\.(pbf|png|jpe?g|webp)$/i.test(path)) return 'tiles'
  return 'other'
}

export function wireTotals(requests: Array<{ url: string; encodedBodyBytes: number | null }>): WireTotals {
  const totals: WireTotals = {
    manifest: { requests: 0, bytes: 0, meanRequestBytes: 0 },
    chunks: { requests: 0, bytes: 0, meanRequestBytes: 0 },
    tiles: { requests: 0, bytes: 0, meanRequestBytes: 0 },
    other: { requests: 0, bytes: 0, meanRequestBytes: 0 },
    total: { requests: 0, bytes: 0, meanRequestBytes: 0 },
  }
  for (const request of requests) {
    const kind = resourceKind(request.url)
    for (const group of [totals[kind], totals.total]) {
      group.requests++
      group.bytes += request.encodedBodyBytes ?? 0
    }
  }
  for (const group of Object.values(totals)) group.meanRequestBytes = group.requests ? group.bytes / group.requests : 0
  return totals
}

export function reconcileWire(requests: WireRequest[], timing: TimingRequest[]) {
  const playwright = wireTotals(requests)
  const resourceTiming = wireTotals(timing)
  const differences = Object.keys(playwright).map((kind) => {
    const group = kind as keyof WireTotals
    const actual = playwright[group]
    const observed = resourceTiming[group]
    const differencePercent = actual.bytes === 0 ? (observed.bytes === 0 ? 0 : 100) : 100 * Math.abs(actual.bytes - observed.bytes) / actual.bytes
    return { kind: group, differencePercent, requestDifference: observed.requests - actual.requests }
  })
  const findings = differences.filter((difference) => difference.differencePercent > 2 || difference.requestDifference !== 0)
    .map((difference) => `Netwerkbronnen verschillen voor ${difference.kind}: ${difference.differencePercent.toFixed(3)} % bytes, ${difference.requestDifference} requests`)
  const timingByUrl = new Map<string, TimingRequest[]>()
  for (const entry of [...timing].sort((left, right) => left.startMs - right.startMs)) {
    const entries = timingByUrl.get(entry.url) ?? []
    entries.push(entry)
    timingByUrl.set(entry.url, entries)
  }
  for (const request of [...requests].sort((left, right) => left.startMs - right.startMs)) {
    const entry = timingByUrl.get(request.url)?.shift()
    if (entry && request.encodedBodyBytes !== null) {
      const actual = request.encodedBodyBytes
      const differencePercent = actual === 0 ? (entry.encodedBodyBytes === 0 ? 0 : 100) : 100 * Math.abs(actual - entry.encodedBodyBytes) / actual
      if (differencePercent > 2) findings.push(`Responsebody verschilt: ${request.url} (${differencePercent.toFixed(3)} %)`)
    }
  }
  for (const request of requests) {
    const completeBodyAbort = request.failure === 'net::ERR_ABORTED' && request.contentLength !== null && request.contentLength !== undefined && request.encodedBodyBytes === request.contentLength
    if ((request.failure && !completeBodyAbort) || request.encodedBodyBytes === null) findings.push(`Onvolledige response: ${request.url} (${request.failure ?? 'bodygrootte onbekend'})`)
  }
  const completeBodyAborts = requests.filter((request) => request.failure === 'net::ERR_ABORTED' && request.contentLength !== null && request.contentLength !== undefined && request.encodedBodyBytes === request.contentLength).length
  const contentLengthFallbacks = requests.filter((request) => request.bodySizeSource === 'completed-content-length').length
  return { playwright, resourceTiming, differences, completeBodyAborts, contentLengthFallbacks, findings }
}

export function completedBytesBefore(requests: WireRequest[], cutoffMs: number | null): number | null {
  if (cutoffMs === null) return null
  return requests.reduce((total, request) => total + (request.endMs !== null && request.endMs <= cutoffMs ? request.encodedBodyBytes ?? 0 : 0), 0)
}

export function summarizePhases(entries: PhaseEntry[], durationMs: number) {
  const phases: Record<string, ReturnType<typeof distribution>> = {}
  const fields: Record<string, ReturnType<typeof distribution>> = {}
  const phaseDurations = new Map<string, number[]>()
  const fieldDurations = new Map<string, number[]>()
  const decodesPerSecond = Array<number>(Math.ceil(durationMs / 1_000)).fill(0)
  for (const entry of entries) {
    if (entry.startTime < 0 || entry.startTime + entry.duration > durationMs) continue
    const durations = phaseDurations.get(entry.phase) ?? []
    durations.push(entry.duration)
    phaseDurations.set(entry.phase, durations)
    if (entry.phase !== 'frame-decode') continue
    const field = String(entry.detail?.field ?? 'onbekend')
    const fieldTimes = fieldDurations.get(field) ?? []
    fieldTimes.push(entry.duration)
    fieldDurations.set(field, fieldTimes)
    decodesPerSecond[Math.floor(entry.startTime / 1_000)]!++
  }
  for (const [phase, durations] of phaseDurations) phases[phase] = distribution(durations)
  for (const [field, durations] of fieldDurations) fields[field] = distribution(durations)
  return { phases, fields, decodesPerSecond }
}

export interface MobileBaseline {
  schema: 1
  profile: string
  scenario: string
  sourceSha: string
  capturedAt: string
  contractHash: string
  regressionLimitPercent: number
  wireBytes: number
  decodes: number
  metrics?: Record<string, unknown>
}

export function compareBaseline(actual: MobileBaseline, baseline: MobileBaseline) {
  if (actual.schema !== baseline.schema || actual.profile !== baseline.profile || actual.scenario !== baseline.scenario || actual.contractHash !== baseline.contractHash) {
    throw new Error('Baseline heeft een ander profiel, scenario of meetcontract; maak een expliciete nieuwe baseline')
  }
  if (!Number.isFinite(baseline.regressionLimitPercent) || baseline.regressionLimitPercent < 0) throw new Error('Ongeldige regressiegrens')
  const delta = (measured: number, reference: number) => reference === 0 ? (measured === 0 ? 0 : Infinity) : relativeDelta(measured, reference)!
  const wireDeltaPercent = delta(actual.wireBytes, baseline.wireBytes)
  const decodeDeltaPercent = delta(actual.decodes, baseline.decodes)
  return { wireDeltaPercent, decodeDeltaPercent, passed: wireDeltaPercent <= baseline.regressionLimitPercent && decodeDeltaPercent <= baseline.regressionLimitPercent }
}

export function repetitionSpread(values: number[]): number {
  if (!values.length) throw new Error('Geen runs om te vergelijken')
  const mean = values.reduce((total, value) => total + value, 0) / values.length
  return mean === 0 ? 0 : 100 * (Math.max(...values) - Math.min(...values)) / mean
}

export function renderMobileReport(report: MobileReport): string {
  const decode = report.decode.phases['frame-decode']
  const lines = [
    `# Mobiele laadrig: ${report.meta.profile} / ${report.meta.scenario}`,
    '',
    `Commit ${report.meta.sourceSha}, ${report.meta.capturedAt}. CPU ${report.meta.cpuThrottleRate}×; worker-CPU ongeremd.`,
    '',
    '| maat | waarde |',
    '| --- | ---: |',
    `| TTFR | ${report.milestones.ttfrMs ?? 'onbekend'} ms |`,
    `| splash klaar (DOM) | ${report.milestones.splashGoneMs ?? 'onbekend'} ms |`,
    `| ttfh (nu ±1 u) | ${report.milestones.ttfhMs ?? 'onbekend'} ms |`,
    `| decodes | ${decode?.count ?? 0} |`,
    `| decode totaal / p50 / p95 | ${decode?.totalMs ?? 0} / ${decode?.p50Ms ?? '—'} / ${decode?.p95Ms ?? '—'} ms |`,
    `| basemap-tegels aantal / totaal / p50 / p95 | ${report.decode.phases['basemap-tile']?.count ?? 0} / ${report.decode.phases['basemap-tile']?.totalMs ?? 0} / ${report.decode.phases['basemap-tile']?.p50Ms ?? '—'} / ${report.decode.phases['basemap-tile']?.p95Ms ?? '—'} ms |`,
    `| encoded body bytes na 30 s | ${report.wire.playwright.total.bytes} B |`,
    `| bytes voltooid vóór TTFR / ttfh | ${report.wire.beforeTtfrBytes ?? 'onbekend'} / ${report.wire.beforeTtfhBytes ?? 'onbekend'} B |`,
    `| Range-requests | ${report.wire.rangeRequests} |`,
    `| ERR_ABORTED met volledige gemeten body | ${report.wire.completeBodyAborts} |`,
    `| complete Content-Length-fallbacks | ${report.wire.contentLengthFallbacks} |`,
    `| lange frames / blocking | ${report.longFrames.count} / ${report.longFrames.blockingMs} ms |`,
    `| hoofddraad bezet (Self-Profiling) | ${report.mainThread.busyPercent ?? 'niet beschikbaar'} % |`,
    `| focusrequests voltooid na volgende modusintentie (kandidaten) | ${report.intent.lateOutsideIntent.length} |`,
    '',
    '| soort | PW requests | PW bytes | RT requests | RT bytes | gemiddelde PW body |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
  ]
  for (const kind of ['manifest', 'chunks', 'tiles', 'other', 'total'] as const) {
    const playwright = report.wire.playwright[kind]
    const resource = report.wire.resourceTiming[kind]
    lines.push(`| ${kind} | ${playwright.requests} | ${playwright.bytes} | ${resource.requests} | ${resource.bytes} | ${playwright.meanRequestBytes.toFixed(1)} |`)
  }
  lines.push('', '| veld | decodes | totaal ms | p50 ms | p95 ms |', '| --- | ---: | ---: | ---: | ---: |')
  for (const [field, stats] of Object.entries(report.decode.fields)) lines.push(`| ${field} | ${stats.count} | ${stats.totalMs} | ${stats.p50Ms} | ${stats.p95Ms} |`)
  lines.push('', 'Window-ready: `' + JSON.stringify(report.milestones.windowReadyMs) + '`.', '', 'Decodes per seconde: `' + report.decode.decodesPerSecond.join(', ') + '`.', '', 'Top-3 bronnen (prof:top):')
  for (const source of report.mainThread.topSources) lines.push(`- ${source.functionName}: ${source.selfSamples} samples — ${source.url}`)
  lines.push('', 'Bevindingen:')
  for (const finding of report.findings) lines.push(`- ${finding}`)
  if (!report.findings.length) lines.push('- Geen meetafwijkingen.')
  return `${lines.join('\n')}\n`
}

export interface MobileReport {
  meta: {
    profile: string; scenario: string; sourceSha: string; capturedAt: string
    cpuThrottleRate: number; contractHash: string; fixtureHash: string
    network: unknown; hardwareConcurrency: number
  }
  milestones: { ttfrMs: number | null; splashGoneMs: number | null; ttfhMs: number | null; windowReadyMs: Record<string, number>; histogramSource: string }
  decode: ReturnType<typeof summarizePhases>
  wire: ReturnType<typeof reconcileWire> & { rangeRequests: number; beforeTtfrBytes: number | null; beforeTtfhBytes: number | null }
  longFrames: { count: number; totalMs: number; blockingMs: number; topSources: Array<{ source: string; durationMs: number }> }
  mainThread: { samples: number; busySamples: number; busyPercent: number | null; topSources: Array<{ functionName: string; url: string; selfSamples: number }> }
  intent: { fieldBytes: Record<string, number>; lateOutsideIntent: WireRequest[] }
  actions: Array<{ action: string; plannedMs: number; actualMs: number; detail: string }>
  findings: string[]
}

export function compactBaseline(report: MobileReport): MobileBaseline {
  return {
    schema: 1,
    profile: report.meta.profile,
    scenario: report.meta.scenario,
    sourceSha: report.meta.sourceSha,
    capturedAt: report.meta.capturedAt,
    contractHash: report.meta.contractHash,
    regressionLimitPercent: 10,
    wireBytes: report.wire.playwright.total.bytes,
    decodes: report.decode.phases['frame-decode']?.count ?? 0,
    metrics: { milestones: report.milestones, decode: report.decode, wire: report.wire, longFrames: report.longFrames, mainThread: report.mainThread, intent: { fieldBytes: report.intent.fieldBytes, lateOutsideIntentCount: report.intent.lateOutsideIntent.length }, findings: report.findings },
  }
}
