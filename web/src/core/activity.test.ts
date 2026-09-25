import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { watchIdle } from './activity'

describe('watchIdle', () => {
  beforeEach(() => { vi.useFakeTimers() })
  afterEach(() => { vi.useRealTimers() })
  const clock = () => ({ now: () => Date.now(), setTimeout: (callback: () => void, delay: number) => setTimeout(callback, delay) as unknown as number, clearTimeout: (handle: number) => clearTimeout(handle) })

  it('goes idle after a quiet minute and wakes on the first input', () => {
    const changes: boolean[] = []
    const watch = watchIdle(60_000, clock(), (idle) => changes.push(idle))
    vi.advanceTimersByTime(59_000)
    expect(changes).toEqual([])
    vi.advanceTimersByTime(1_000)
    expect(changes).toEqual([true])
    watch.input()
    expect(changes).toEqual([true, false])
    watch.dispose()
  })

  it('counts the quiet time from the last input, without a timer per input', () => {
    const changes: boolean[] = []
    const watch = watchIdle(60_000, clock(), (idle) => changes.push(idle))
    vi.advanceTimersByTime(50_000)
    for (let move = 0; move < 100; move++) watch.input()
    expect(vi.getTimerCount()).toBe(1)
    vi.advanceTimersByTime(59_000)
    expect(changes).toEqual([])
    vi.advanceTimersByTime(1_000)
    expect(changes).toEqual([true])
    watch.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })
})
