import type { TimelineFrame } from './contract'

export type MotionSelectionKind = 'right' | 'next' | 'left'

export interface MotionSelection {
  frame: TimelineFrame
  kind: MotionSelectionKind
}

export function selectPairMotion(
  left: TimelineFrame,
  right: TimelineFrame,
  hasMotion: (frame: TimelineFrame) => boolean,
): MotionSelection | undefined {
  if (left.epoch >= right.epoch) return undefined
  if (hasMotion(right)) return { frame: right, kind: 'right' }

  const step = right.epoch - left.epoch
  const nextIndex = right.frameIndex + 1
  const nextTime = right.chunk.times[nextIndex]
  if (nextTime) {
    const epoch = Date.parse(nextTime)
    const next = { ...right, time: nextTime, epoch, frameIndex: nextIndex }
    if (Number.isFinite(epoch) && epoch - right.epoch <= step && hasMotion(next)) return { frame: next, kind: 'next' }
  }

  if (right.epoch - left.epoch <= step && hasMotion(left)) return { frame: left, kind: 'left' }
  return undefined
}
