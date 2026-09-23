import type { LoadFrameTrace, LoadLayer, LoadMarkTrace, LoadRequestTrace, LoadTraceSnapshot } from '../src/core/perf'

export interface HistogramSample {
  t: number
  bars: number
  pending: number
  stage: string | null
}

export interface NetworkRecord {
  url: string
  range: string | null
  startMs: number
  responseMs: number | null
  endMs: number | null
  bytes: number
  status: number | null
  fromCache: boolean
  failed: string | null
}

export interface RawLoadProfile {
  target: string
  origin: string
  profile: string
  profileLabel: string
  emulation: string
  cpuThrottleRate: number
  startedAt: string
  complete: boolean
  fillTimeoutMs: number
  ttfrMs: number | null
  samples: HistogramSample[]
  trace: LoadTraceSnapshot | null
  network: NetworkRecord[]
}

export interface RequestRow {
  startMs: number
  responseMs: number | null
  endMs: number | null
  bytes: number
  range: string | null
  path: string
  source: string
  field: string
  layer: LoadLayer | null
  priority: string | null
  frames: number[]
  fromCache: boolean
  failed: string | null
}

export type Gate = 'laag-trigger' | 'regenqueue' | 'aanvraag' | 'netwerk' | 'decode' | 'publicatie'

export interface BarRow {
  index: number
  epoch: number
  source: string
  layer: LoadLayer | null
  loadedMs: number | null
  scheduledMs: number | null
  queueStartMs: number | null
  requestStartMs: number | null
  bytesReadyMs: number | null
  decodedMs: number | null
  firstFetchedBy: LoadLayer | null
  gate: Gate | null
  gateMs: number
}

export interface LayerRow {
  layer: string
  scheduledMs: number | null
  reason: string | null
  firstRequestMs: number | null
  lastEndMs: number | null
  requests: number
  bytes: number
}

export interface LoadProfileAnalysis {
  meta: Omit<RawLoadProfile, 'samples' | 'trace' | 'network'> & { traced: boolean }
  milestones: {
    ttfrMs: number | null
    firstBarsMs: number | null
    fill50Ms: number | null
    fill90Ms: number | null
    histogramFullMs: number | null
    stages: Array<{ stage: string; t: number }>
  }
  fill: Array<{ t: number; filled: number; bars: number; stage: string | null }>
  requests: RequestRow[]
  otherRequests: { count: number; bytes: number }
  layers: LayerRow[]
  bars: BarRow[]
  gates: Array<{ gate: Gate; bars: number; totalMs: number }>
  criticalChain: string[]
}

const gateLabels: Record<Gate, string> = {
  'laag-trigger': 'wachten tot de laag wordt ingepland',
  regenqueue: 'wachten in de regenqueue op een eerdere laag',
  aanvraag: 'header/aanvraag vóór de eerste byte',
  netwerk: 'bytes onderweg (incl. rest van de gecoalesceerde span)',
  decode: 'zstd-decode in de worker',
  publicatie: 'publicatie naar het histogram (rAF-batch)',
}

export function analyzeLoadProfile(raw: RawLoadProfile): LoadProfileAnalysis {
  const { samples, trace, network, ...meta } = raw
  const fill = samples.map((sample) => ({ t: sample.t, filled: sample.bars - sample.pending, bars: sample.bars, stage: sample.stage }))
  const firstFraction = (fraction: number) => fill.find((sample) => sample.bars > 0 && sample.filled / sample.bars >= fraction)?.t ?? null
  const stageMarks = trace?.marks.filter((mark): mark is Extract<LoadMarkTrace, { kind: 'stage' }> => mark.kind === 'stage').map((mark) => ({ stage: mark.stage, t: mark.t }))
  const stages = stageMarks ?? samples.flatMap((sample, index) => sample.stage && sample.stage !== samples[index - 1]?.stage ? [{ stage: sample.stage, t: sample.t }] : [])

  const requests = joinRequests(network.filter((record) => new URL(record.url).pathname.includes('/data/')), trace?.requests ?? [])
  const others = network.filter((record) => !new URL(record.url).pathname.includes('/data/'))
  const bars = trace ? analyzeBars(trace) : []
  const gates = (Object.keys(gateLabels) as Gate[]).map((gate) => {
    const matching = bars.filter((bar) => bar.gate === gate)
    return { gate, bars: matching.length, totalMs: matching.reduce((sum, bar) => sum + bar.gateMs, 0) }
  }).filter((row) => row.bars > 0)

  return {
    meta: { ...meta, traced: trace !== null },
    milestones: {
      ttfrMs: raw.ttfrMs,
      firstBarsMs: fill.find((sample) => sample.bars > 0)?.t ?? null,
      fill50Ms: firstFraction(0.5),
      fill90Ms: firstFraction(0.9),
      histogramFullMs: firstFraction(1),
      stages,
    },
    fill,
    requests,
    otherRequests: { count: others.length, bytes: others.reduce((sum, record) => sum + record.bytes, 0) },
    layers: trace ? layerRows(trace, requests) : [],
    bars,
    gates,
    criticalChain: criticalChain(bars),
  }
}

function joinRequests(records: NetworkRecord[], traced: LoadRequestTrace[]): RequestRow[] {
  const unmatched = [...traced]
  return records.sort((left, right) => left.startMs - right.startMs).map((record) => {
    const match = unmatched.findIndex((candidate) => candidate.url === record.url && `bytes=${candidate.range[0]}-${candidate.range[1]}` === record.range)
    const request = match >= 0 ? unmatched.splice(match, 1)[0]! : undefined
    const path = new URL(record.url).pathname
    const [source, field] = chunkIdentity(path)
    return {
      startMs: record.startMs,
      responseMs: record.responseMs,
      endMs: record.endMs,
      bytes: record.bytes,
      range: record.range,
      path,
      source,
      field,
      layer: request?.layer ?? null,
      priority: request?.priority ?? null,
      frames: request?.frames ?? [],
      fromCache: record.fromCache,
      failed: record.failed,
    }
  })
}

export function chunkIdentity(path: string): [string, string] {
  if (path.endsWith('/manifest.json')) return ['manifest', '—']
  const name = path.split('/').at(-1) ?? path
  const [source = name, second = ''] = name.split('-')
  if (/^\d/.test(second) || !second) return [source, source === 'uv' ? 'uv' : 'rain_rate']
  return [source, second]
}

function analyzeBars(trace: LoadTraceSnapshot): BarRow[] {
  const timeline = trace.marks.filter((mark): mark is Extract<LoadMarkTrace, { kind: 'timeline' }> => mark.kind === 'timeline').at(-1)
  if (!timeline) return []
  const rainMarks = trace.marks.filter((mark): mark is Extract<LoadMarkTrace, { kind: 'rain' }> => mark.kind === 'rain')
  const schedules = trace.marks.filter((mark): mark is Extract<LoadMarkTrace, { kind: 'schedule' }> => mark.kind === 'schedule' && mark.field === 'rain_rate')
  const starts = trace.marks.filter((mark): mark is Extract<LoadMarkTrace, { kind: 'start' }> => mark.kind === 'start' && mark.field === 'rain_rate')
  const frames = new Map<string, LoadFrameTrace>(trace.frames.map((frame) => [`${frame.url}#${frame.frameIndex}`, frame]))
  const requests = new Map(trace.requests.map((request) => [request.id, request]))

  return timeline.frames.flatMap((frame, index) => {
    const previous = timeline.frames[index - 1]
    const leftEdge = previous ? (previous.epoch + frame.epoch) / 2 : frame.epoch
    if (index > 0 && leftEdge >= timeline.horizonEnd) return []
    const loadedMs = rainMarks.find((mark) => mark.loaded.includes(index))?.t ?? null
    const start = loadedMs === null ? undefined : starts.filter((mark) => mark.t <= loadedMs && mark.indexes.includes(index)).at(-1)
    const schedule = start ? schedules.filter((mark) => mark.layer === start.layer && mark.t <= start.t && mark.indexes.includes(index)).at(-1) : undefined
    const frameTrace = frames.get(`${frame.url}#${frame.frameIndex}`)
    const request = frameTrace?.requestId ? requests.get(frameTrace.requestId) : undefined
    const row: BarRow = {
      index,
      epoch: frame.epoch,
      source: frame.source,
      layer: start?.layer ?? null,
      loadedMs,
      scheduledMs: schedule?.t ?? null,
      queueStartMs: start?.t ?? null,
      requestStartMs: request?.startMs ?? null,
      bytesReadyMs: frameTrace?.bytesReadyMs ?? null,
      decodedMs: frameTrace?.decodedMs ?? null,
      firstFetchedBy: frameTrace?.layer ?? null,
      gate: null,
      gateMs: 0,
    }
    const [gate, gateMs] = dominantGate(barSegments(row))
    row.gate = gate
    row.gateMs = gateMs
    return [row]
  })
}

export function barSegments(bar: BarRow): Array<{ gate: Gate; from: number; to: number }> {
  if (bar.loadedMs === null) return []
  const points: Array<[Gate, number | null]> = [
    ['laag-trigger', bar.scheduledMs],
    ['regenqueue', bar.queueStartMs],
    ['aanvraag', bar.requestStartMs],
    ['netwerk', bar.bytesReadyMs],
    ['decode', bar.decodedMs],
    ['publicatie', bar.loadedMs],
  ]
  const segments: Array<{ gate: Gate; from: number; to: number }> = []
  let cursor = 0
  for (const [gate, at] of points) {
    if (at === null) continue
    const to = Math.min(bar.loadedMs, Math.max(cursor, at))
    segments.push({ gate, from: cursor, to })
    cursor = to
  }
  return segments
}

function dominantGate(segments: Array<{ gate: Gate; from: number; to: number }>): [Gate | null, number] {
  let best: [Gate | null, number] = [null, 0]
  for (const segment of segments) if (segment.to - segment.from > best[1]) best = [segment.gate, segment.to - segment.from]
  return best
}

function layerRows(trace: LoadTraceSnapshot, requests: RequestRow[]): LayerRow[] {
  const layers = [...new Set<string>([...trace.requests.map((request) => request.layer), ...trace.marks.flatMap((mark) => mark.kind === 'schedule' ? [mark.layer] : [])])]
  return layers.map((layer) => {
    const schedule = trace.marks.find((mark): mark is Extract<LoadMarkTrace, { kind: 'schedule' }> => mark.kind === 'schedule' && mark.layer === layer)
    const rows = requests.filter((request) => request.layer === layer)
    const traced = trace.requests.filter((request) => request.layer === layer)
    return {
      layer,
      scheduledMs: schedule?.t ?? null,
      reason: schedule?.reason ?? null,
      firstRequestMs: traced.length ? Math.min(...traced.map((request) => request.startMs)) : null,
      lastEndMs: traced.some((request) => request.endMs !== undefined) ? Math.max(...traced.flatMap((request) => request.endMs === undefined ? [] : [request.endMs])) : null,
      requests: traced.length,
      bytes: rows.length ? rows.reduce((sum, row) => sum + row.bytes, 0) : traced.reduce((sum, request) => sum + request.bytes, 0),
    }
  }).sort((left, right) => (left.firstRequestMs ?? Infinity) - (right.firstRequestMs ?? Infinity))
}

function criticalChain(bars: BarRow[]): string[] {
  const last = bars.filter((bar) => bar.loadedMs !== null).sort((left, right) => right.loadedMs! - left.loadedMs!)[0]
  if (!last) return []
  const lines = [`Laatst gevulde zichtbare balk: #${last.index} (${clock(last.epoch)} UTC, ${last.source}), gevuld op ${ms(last.loadedMs)} ms via laag ${last.layer ?? '?'}.`]
  for (const segment of barSegments(last)) lines.push(`- ${ms(segment.from)} → ${ms(segment.to)} ms (+${ms(segment.to - segment.from)}): ${segment.gate} — ${gateLabels[segment.gate]}`)
  if (last.firstFetchedBy && last.firstFetchedBy !== last.layer && last.decodedMs !== null && last.queueStartMs !== null && last.decodedMs < last.queueStartMs) {
    lines.push(`- Let op: frame was al om ${ms(last.decodedMs)} ms gedecodeerd door laag ${last.firstFetchedBy}, maar de balk telde pas mee toen ${last.layer} hem opnieuw vroeg.`)
  }
  return lines
}

export function renderLoadTimeline(analysis: LoadProfileAnalysis): string {
  const { meta, milestones } = analysis
  const lines: string[] = []
  lines.push(`# Laadprofiel — ${meta.target} / ${meta.profileLabel}`, '')
  lines.push(`- start: ${meta.startedAt}; origin: ${meta.origin}`)
  lines.push(`- emulatie: ${meta.emulation}; CPU ${meta.cpuThrottleRate}×; loadtrace: ${meta.traced ? 'ja' : 'nee (alleen netwerk + DOM)'}`)
  lines.push(`- histogram volledig gevuld: ${meta.complete ? `ja, na ${ms(milestones.histogramFullMs)} ms` : `NEE binnen ${meta.fillTimeoutMs} ms`}`, '')
  lines.push('## Mijlpalen (ms sinds navigatie)', '')
  lines.push('| TTFR | eerste balken | 50% gevuld | 90% gevuld | 100% gevuld |', '| ---: | ---: | ---: | ---: | ---: |')
  lines.push(`| ${ms(milestones.ttfrMs)} | ${ms(milestones.firstBarsMs)} | ${ms(milestones.fill50Ms)} | ${ms(milestones.fill90Ms)} | ${ms(milestones.histogramFullMs)} |`, '')
  lines.push(`Laadstadia: ${milestones.stages.map((stage) => `${stage.stage} @ ${ms(stage.t)}`).join(' → ') || '—'}`, '')

  if (analysis.criticalChain.length) lines.push('## Kritieke keten', '', ...analysis.criticalChain, '')
  if (analysis.gates.length) {
    lines.push('## Poort per zichtbare balk (grootste wachtsegment)', '', '| poort | balken | som wachttijd (ms) | betekenis |', '| --- | ---: | ---: | --- |')
    for (const row of analysis.gates) lines.push(`| ${row.gate} | ${row.bars} | ${ms(row.totalMs)} | ${gateLabels[row.gate]} |`)
    lines.push('')
  }
  if (analysis.layers.length) {
    lines.push('## Lagen', '', '| laag | eerst ingepland | reden | eerste request | laatste einde | requests | bytes |', '| --- | ---: | --- | ---: | ---: | ---: | ---: |')
    for (const row of analysis.layers) lines.push(`| ${row.layer} | ${ms(row.scheduledMs)} | ${row.reason ?? '—'} | ${ms(row.firstRequestMs)} | ${ms(row.lastEndMs)} | ${row.requests} | ${bytes(row.bytes)} |`)
    lines.push('')
  }

  lines.push('## Histogramvulling (iedere wijziging)', '', '| t (ms) | gevuld / zichtbaar | fractie | stadium |', '| ---: | ---: | ---: | --- |')
  for (const sample of analysis.fill) lines.push(`| ${ms(sample.t)} | ${sample.filled} / ${sample.bars} | ${sample.bars ? (sample.filled / sample.bars * 100).toFixed(0) : '—'}% | ${sample.stage ?? '—'} |`)
  lines.push('')

  lines.push('## Requests naar /data', '', `Overige requests (app, tiles, fonts): ${analysis.otherRequests.count}, ${bytes(analysis.otherRequests.bytes)}.`, '')
  lines.push('| start | eerste byte | einde | duur | bytes | laag | prio | bron / veld | frames | range |', '| ---: | ---: | ---: | ---: | ---: | --- | --- | --- | --- | --- |')
  for (const row of analysis.requests) {
    const duration = row.endMs === null ? '—' : ms(row.endMs - row.startMs)
    const note = row.failed ? ` ✗ ${row.failed}` : row.fromCache ? ' (cache)' : ''
    lines.push(`| ${ms(row.startMs)} | ${ms(row.responseMs)} | ${ms(row.endMs)} | ${duration} | ${bytes(row.bytes)}${note} | ${row.layer ?? '—'} | ${row.priority ?? '—'} | ${row.source} / ${row.field} | ${frameList(row.frames)} | ${row.range ?? '—'} |`)
  }
  lines.push('')

  if (analysis.bars.length) {
    lines.push('## Zichtbare balken', '', '| # | tijd (UTC) | bron | laag | ingepland | queue-start | request | bytes klaar | decoded | balk | eerst gevraagd door | poort |', '| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | --- | --- |')
    for (const bar of analysis.bars) {
      lines.push(`| ${bar.index} | ${clock(bar.epoch)} | ${bar.source} | ${bar.layer ?? '—'} | ${ms(bar.scheduledMs)} | ${ms(bar.queueStartMs)} | ${ms(bar.requestStartMs)} | ${ms(bar.bytesReadyMs)} | ${ms(bar.decodedMs)} | ${ms(bar.loadedMs)} | ${bar.firstFetchedBy ?? '—'} | ${bar.gate ?? '—'} (+${ms(bar.gateMs)}) |`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

function frameList(frames: number[]): string {
  if (!frames.length) return '—'
  const runs: string[] = []
  let start = frames[0]!, previous = frames[0]!
  for (const frame of [...frames.slice(1), Number.NaN]) {
    if (frame === previous + 1) { previous = frame; continue }
    runs.push(start === previous ? `${start}` : `${start}–${previous}`)
    start = previous = frame
  }
  return runs.join(',')
}

function ms(value: number | null | undefined): string {
  return value === null || value === undefined ? '—' : Math.round(value).toLocaleString('nl-NL')
}

function bytes(value: number): string {
  return value >= 10_000 ? `${(value / 1_000).toLocaleString('nl-NL', { maximumFractionDigits: 0 })} kB` : `${value} B`
}

function clock(epoch: number): string {
  return new Date(epoch).toISOString().slice(11, 16)
}
