import { describe, expect, it } from 'vitest'
import { FrameCache } from './frame-cache'
import type { FrameTiming, Intent } from './intent'

const HOUR = 3_600_000
const noon = Date.UTC(2026, 9, 7, 12)
const frame = new Uint8Array(1)
const hourly = (field: string, hours: number): FrameTiming => ({ epoch: noon + hours * HOUR, stepMs: HOUR, field })
const intent: Intent = {
  cursorEpoch: noon,
  window: { start: noon - 3 * HOUR, end: noon + 5 * HOUR },
  playback: 0,
  scrubVelocity: 0,
  fields: new Set(['temp_c']),
}

describe('FrameCache', () => {
  it('drops the oldest frame while no intent is known', () => {
    const cache = new FrameCache(2)
    cache.set('first', frame, hourly('temp_c', 0))
    cache.set('second', frame, hourly('temp_c', 1))
    cache.set('third', frame, hourly('temp_c', 2))
    expect(cache.get('first')).toBeUndefined()
    expect(cache.size).toBe(2)
  })

  it('keeps the frames around the cursor, however long ago they were decoded', () => {
    const cache = new FrameCache(3)
    cache.intent = intent
    cache.set('now', frame, hourly('temp_c', 0))
    cache.set('+1h', frame, hourly('temp_c', 1))
    cache.set('+4h', frame, hourly('temp_c', 4))
    cache.set('+3h', frame, hourly('temp_c', 3))
    expect(cache.get('+4h')).toBeUndefined()
    expect(cache.get('now')).toBe(frame)
    expect(cache.get('+1h')).toBe(frame)
  })

  it('drops what is outside the window or not shown before anything in view', () => {
    const cache = new FrameCache(2)
    cache.intent = intent
    cache.set('hidden-now', frame, hourly('rel_humidity', 0))
    cache.set('+5h', frame, hourly('temp_c', 5))
    cache.set('tomorrow', frame, hourly('temp_c', 20))
    expect(cache.get('tomorrow')).toBeUndefined()
    cache.set('+4h', frame, hourly('temp_c', 4))
    expect(cache.get('hidden-now')).toBeUndefined()
    expect(cache.get('+5h')).toBe(frame)
  })
})
