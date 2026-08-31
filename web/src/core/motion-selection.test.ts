import { describe, expect, it } from 'vitest'
import type { ManifestChunk, TimelineFrame } from './contract'
import { selectPairMotion } from './motion-selection'

const time = (minute: number) => `2026-08-28T15:${String(minute).padStart(2, '0')}:00Z`
const chunk = (source: ManifestChunk['source'], times: string[]): ManifestChunk => ({
  url: `${source}.mrf`, source, run: times[0]!, header_len: 8, times,
})
const frame = (value: ManifestChunk, frameIndex: number): TimelineFrame => ({
  chunk: value,
  source: value.source,
  run: value.run,
  frameIndex,
  time: value.times[frameIndex]!,
  epoch: Date.parse(value.times[frameIndex]!),
})

describe('motion selection across timeline boundaries', () => {
  it('borrows the next annex in the right chunk before the left annex', () => {
    const observations = chunk('rtcor', ['2026-08-28T14:50:00Z', '2026-08-28T14:55:00Z'])
    const nowcast = chunk('nowcast', [time(0), time(5), time(10)])
    const left = frame(observations, 1)
    const right = frame(nowcast, 0)

    const selected = selectPairMotion(left, right, (candidate) =>
      candidate.chunk === nowcast ? candidate.frameIndex === 1 : candidate.frameIndex === 1)

    expect(selected?.kind).toBe('next')
    expect(selected?.frame.chunk).toBe(nowcast)
    expect(selected?.frame.frameIndex).toBe(1)
  })

  it('falls back to the left pair motion when the next annex is too far away', () => {
    const seamless = chunk('seamless', [time(0), time(5)])
    const model = chunk('harmonie', [time(10), '2026-08-28T16:10:00Z'])
    const left = frame(seamless, 1)
    const right = frame(model, 0)

    expect(selectPairMotion(left, right, (candidate) => candidate === left)?.kind).toBe('left')
    expect(selectPairMotion(left, right, () => false)).toBeUndefined()
  })

  it('keeps the right annex for ordinary adjacent pairs', () => {
    const nowcast = chunk('nowcast', [time(0), time(5)])
    const selected = selectPairMotion(frame(nowcast, 0), frame(nowcast, 1), (candidate) => candidate.frameIndex === 1)
    expect(selected).toMatchObject({ kind: 'right', frame: { frameIndex: 1 } })
  })
})
