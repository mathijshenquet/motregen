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

  it('publishes at once, then at most once per interval', () => {
    const queued: FrameRequestCallback[] = []
    let clock = 1_000
    const publish = vi.fn()
    const batcher = new FrameBatcher(publish, (callback) => queued.push(callback), () => undefined, 200, () => clock)
    const nextFrame = (elapsedMs: number) => { clock += elapsedMs; queued.shift()!(clock) }

    batcher.schedule()
    nextFrame(16)
    expect(publish).toHaveBeenCalledTimes(1)

    batcher.schedule()
    nextFrame(16)
    nextFrame(100)
    expect(publish).toHaveBeenCalledTimes(1)
    batcher.schedule()
    expect(queued).toHaveLength(1)
    nextFrame(100)
    expect(publish).toHaveBeenCalledTimes(2)
    expect(queued).toHaveLength(0)
  })
})
