import type { Manifest, Source, TimelineFrame } from './contract'

const priority: Record<Source, number> = { harmonie: 0, nowcast: 1, rtcor: 2 }

export function buildTimeline(manifest: Manifest): TimelineFrame[] {
  const byTime = new Map<number, TimelineFrame>()
  for (const chunk of manifest.chunks) for (let frameIndex = 0; frameIndex < chunk.times.length; frameIndex++) {
    const time = chunk.times[frameIndex]!
    const candidate: TimelineFrame = { time, epoch: Date.parse(time), source: chunk.source, run: chunk.run, chunk, frameIndex }
    if (!Number.isFinite(candidate.epoch)) throw new Error(`Ongeldige tijd: ${time}`)
    const current = byTime.get(candidate.epoch)
    if (!current || priority[candidate.source] > priority[current.source] ||
      (candidate.source === current.source && Date.parse(candidate.run) > Date.parse(current.run))) byTime.set(candidate.epoch, candidate)
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

export function regimeLabel(source: Source): string {
  return source === 'rtcor' ? 'Verleden' : source === 'nowcast' ? 'Nowcast' : 'Model'
}
