import { chunkField, type Field, type Manifest, type Source, type TimelineFrame } from './contract'

const priority: Record<Source, number> = { harmonie: 0, uv: 0, seamless: 1, nowcast: 2, rtcor: 3 }

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
  if (epoch <= timeline[0]!.epoch) return { left: 0, right: 0, mix: 0 }
  const last = timeline.length - 1
  if (epoch >= timeline[last]!.epoch) return { left: last, right: last, mix: 0 }
  let right = 1
  while (timeline[right]!.epoch < epoch) right++
  const left = right - 1
  return { left, right, mix: (epoch - timeline[left]!.epoch) / (timeline[right]!.epoch - timeline[left]!.epoch) }
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

export function timelineZones(timeline: TimelineFrame[]): TimelineZone[] {
  if (!timeline.length) return []
  const result: TimelineZone[] = []
  let start = 0
  let current = sourceZone(timeline[0]!.source)
  for (let index = 1; index <= timeline.length; index++) {
    const next = index < timeline.length ? sourceZone(timeline[index]!.source) : undefined
    if (next?.kind === current.kind) continue
    result.push({ ...current, start: start / timeline.length * 100, end: index / timeline.length * 100 })
    start = index
    if (next) current = next
  }
  return result
}

function sourceZone(source: Source): Pick<TimelineZone, 'label' | 'kind'> {
  if (source === 'rtcor') return { label: 'Observaties', kind: 'observations' }
  if (source === 'nowcast') return { label: 'Nowcast', kind: 'nowcast' }
  return { label: 'Model', kind: 'model' }
}
