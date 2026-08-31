import { describe, expect, it, vi } from 'vitest'
import { FrameBatcher } from './frame-batcher'

describe('FrameBatcher', () => {
  it('bundles frame progress into one publication per animation frame', () => {
    const queued = new Map<number, FrameRequestCallback>()
    let nextHandle = 0
    const publish = vi.fn()
    const batcher = new FrameBatcher(
      publish,
      (callback) => { const handle = ++nextHandle; queued.set(handle, callback); return handle },
      (handle) => { queued.delete(handle) },
    )

    batcher.schedule()
    batcher.schedule()
    batcher.schedule()
    expect(queued.size).toBe(1)
    const [handle, callback] = queued.entries().next().value!
    queued.delete(handle)
    callback(0)
    expect(publish).toHaveBeenCalledTimes(1)

    batcher.schedule()
    batcher.flush()
    expect(queued.size).toBe(0)
    expect(publish).toHaveBeenCalledTimes(2)
  })
})
