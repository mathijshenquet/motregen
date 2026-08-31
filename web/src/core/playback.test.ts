import { describe, expect, it } from 'vitest'
import { startFrameLoop } from './playback'

describe('playback frame loop', () => {
  it('advances exactly once per frame across repeated horizon switches', () => {
    let nextHandle = 0
    let cursor = 0
    const steppedHorizons: Array<number | null> = []
    const pending = new Map<number, FrameRequestCallback>()
    const requestFrame = (callback: FrameRequestCallback) => {
      const handle = ++nextHandle
      pending.set(handle, callback)
      return handle
    }
    const cancelFrame = (handle: number) => pending.delete(handle)
    const fireFrame = (time: number) => {
      const callbacks = [...pending.values()]
      pending.clear()
      for (const callback of callbacks) callback(time)
    }

    let stop: () => void = () => undefined
    for (const horizon of [8, null, 8, null, 3, 24, 8]) {
      stop()
      stop = startFrameLoop(() => { cursor++; steppedHorizons.push(horizon) }, requestFrame, cancelFrame)
      const before = cursor
      fireFrame(1_000 + cursor * 16)
      expect(cursor).toBe(before + 1)
      expect(steppedHorizons.at(-1)).toBe(horizon)
      expect(pending.size).toBe(1)
    }
    stop()
    expect(pending.size).toBe(0)
  })

  it('does not let an already dequeued orphan schedule itself again', () => {
    let steps = 0
    let callback: FrameRequestCallback | undefined
    const stop = startFrameLoop(() => { steps++ }, (next) => { callback = next; return 1 }, () => undefined)
    const orphan = callback!
    stop()
    orphan(16)
    expect(steps).toBe(0)
  })
})
