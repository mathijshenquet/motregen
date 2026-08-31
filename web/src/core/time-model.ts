import { chunkField, type Field, type Manifest, type Source, type TimelineFrame } from './contract'

const priority: Record<Source, number> = { harmonie: 0, uv: 0, seamless: 1, nowcast: 2, rtcor: 3 }
const PLAYBACK_FRAME_DURATION_MS = 650

export function buildTimeline(manifest: Manifest, field: Field = 'rain_rate'): TimelineFrame[] {
  const byTime = new Map<number, TimelineFrame>()
  const now = Date.parse(manifest.now)
  if (!Number.isFinite(now)) throw new Error(`Ongeldige nu-tijd: ${manifest.now}`)
  for (const chunk of manifest.chunks) {
    if (chunkField(chunk) !== field) continue
    for (let frameIndex = 0; frameIndex < chunk.times.length; frameIndex++) {
      const time = chunk.times[frameIndex]!
      const candidate: TimelineFrame = { time, epoch: Date.parse(time), source: chunk.source, run: chunk.run, chunk, frameIndex }
      if (!Number.isFinite(candidate.epoch)) throw new Error(`Ongeldige tijd: ${time}`)
      if (candidate.epoch < now && candidate.source !== 'rtcor') continue
      const current = byTime.get(candidate.epoch)
      if (!current || priority[candidate.source] > priority[current.source] ||
        (candidate.source === current.source && Date.parse(candidate.run) > Date.parse(current.run))) byTime.set(candidate.epoch, candidate)
    }
  }
  return [...byTime.values()].sort((a, b) => a.epoch - b.epoch)
}

export function frameBlend(timeline: TimelineFrame[], epoch: number): { left: number; right: number; mix: number } {
  if (timeline.length === 0) return { left: 0, right: 0, mix: 0 }
  if (!Number.isFinite(epoch)) return { left: 0, right: 0, mix: 0 }
  if (epoch <= timeline[0]!.epoch) return { left: 0, right: 0, mix: 0 }
  const last = timeline.length - 1
  if (epoch >= timeline[last]!.epoch) return { left: last, right: last, mix: 0 }
  let right = 1
  while (timeline[right]!.epoch < epoch) right++
  const left = right - 1
  return { left, right, mix: (epoch - timeline[left]!.epoch) / (timeline[right]!.epoch - timeline[left]!.epoch) }
}

export function timelineEpochAtCursor(timeline: TimelineFrame[], cursor: number): number {
  if (!timeline.length) return 0
  const bounded = Number.isFinite(cursor) ? Math.max(0, Math.min(timeline.length - 1, cursor)) : 0
  const lower = Math.floor(bounded)
  const upper = Math.ceil(bounded)
  return timeline[lower]!.epoch + (timeline[upper]!.epoch - timeline[lower]!.epoch) * (bounded - lower)
}

export function timelineCursorAtEpoch(timeline: TimelineFrame[], epoch: number): number {
  const blend = frameBlend(timeline, epoch)
  return blend.left + (blend.right - blend.left) * blend.mix
}

export function timelineHorizonEnd(timeline: TimelineFrame[], now: number, hours: number | null): number {
  const last = timeline.at(-1)?.epoch ?? 0
  return hours === null ? last : Math.min(last, now + hours * 3_600_000)
}

export function timelinePlaybackRate(timeline: TimelineFrame[], now: number, hours: number | null): number {
  if (timeline.length < 2) return 0
  const firstEpoch = timeline[0]!.epoch
  const lastEpoch = timelineHorizonEnd(timeline, now, hours)
  const cursorSpan = Math.max(1, timelineCursorAtEpoch(timeline, lastEpoch))
  return Math.max(0, lastEpoch - firstEpoch) / (cursorSpan * PLAYBACK_FRAME_DURATION_MS)
}

export function seriesValueAt(
  timeline: TimelineFrame[],
  values: Array<number | null>,
  epoch: number,
  edgeTolerance: number,
): number | null {
  if (!timeline.length || epoch < timeline[0]!.epoch - edgeTolerance || epoch > timeline.at(-1)!.epoch + edgeTolerance) return null
  const blend = frameBlend(timeline, epoch)
  const left = values[blend.left] ?? null
  const right = values[blend.right] ?? null
  return left == null ? right : right == null ? left : left * (1 - blend.mix) + right * blend.mix
}

export interface TimelineZone {
  label: 'Observaties' | 'Nowcast' | 'Model'
  start: number
  end: number
  kind: 'observations' | 'nowcast' | 'model'
}

export function timelineZones(timeline: TimelineFrame[], rangeStart?: number, rangeEnd?: number): TimelineZone[] {
  if (!timeline.length) return []
  if (timeline.length === 1) return [{ ...sourceZone(timeline[0]!.source), start: 0, end: 100 }]
  const result: TimelineZone[] = []
  const firstEpoch = timeline[0]!.epoch
  const lastEpoch = timeline.at(-1)!.epoch
  const visibleStart = Math.max(firstEpoch, rangeStart ?? firstEpoch)
  const visibleEnd = Math.min(lastEpoch, rangeEnd ?? lastEpoch)
  const span = Math.max(1, visibleEnd - visibleStart)
  let start = firstEpoch
  let current = sourceZone(timeline[0]!.source)
  for (let index = 1; index <= timeline.length; index++) {
    const next = index < timeline.length ? sourceZone(timeline[index]!.source) : undefined
    if (next?.kind === current.kind) continue
    const end = index === timeline.length
      ? timeline.at(-1)!.epoch
      : (timeline[index - 1]!.epoch + timeline[index]!.epoch) / 2
    const clippedStart = Math.max(start, visibleStart)
    const clippedEnd = Math.min(end, visibleEnd)
    if (clippedEnd > clippedStart) result.push({ ...current, start: (clippedStart - visibleStart) / span * 100, end: (clippedEnd - visibleStart) / span * 100 })
    start = end
    if (next) current = next
  }
  return result
}

function sourceZone(source: Source): Pick<TimelineZone, 'label' | 'kind'> {
  if (source === 'rtcor') return { label: 'Observaties', kind: 'observations' }
  if (source === 'nowcast') return { label: 'Nowcast', kind: 'nowcast' }
  return { label: 'Model', kind: 'model' }
}
