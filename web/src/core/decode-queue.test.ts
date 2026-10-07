import { describe, expect, it } from 'vitest'
import { DecodeQueue } from './decode-queue'
import type { FrameTiming, Intent } from './intent'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const noon = Date.UTC(2026, 9, 7, 12)

function drain(queue: DecodeQueue<string>): string[] {
  const order: string[] = []
  for (let job = queue.take(); job !== undefined; job = queue.take()) order.push(job)
  return order
}

const rain = (minutes: number): FrameTiming => ({ epoch: noon + minutes * MINUTE, stepMs: 5 * MINUTE, field: 'rain_rate' })
const hourly = (field: string, hours: number): FrameTiming => ({ epoch: noon + hours * HOUR, stepMs: HOUR, field })
const intent = (overrides: Partial<Intent> = {}): Intent => ({
  cursorEpoch: noon,
  window: { start: noon - 12 * HOUR, end: noon + 12 * HOUR },
  playback: 0,
  scrubVelocity: 0,
  fields: new Set(['rain_rate', 'cloud_low', 'temp_c', 'wind_u_ms', 'wind_v_ms']),
  ...overrides,
})

describe('DecodeQueue', () => {
  it('keeps arrival order until an intent is known', () => {
    const queue = new DecodeQueue<string>()
    queue.enqueue(rain(60), 'far')
    queue.enqueue(rain(0), 'near')
    expect(queue.size).toBe(2)
    expect(drain(queue)).toEqual(['far', 'near'])
    expect(queue.size).toBe(0)
  })

  it('serves every field nearest to the cursor first instead of field by field', () => {
    const queue = new DecodeQueue<string>()
    queue.setIntent(intent())
    for (const minutes of [0, 30, 60, 120]) queue.enqueue(rain(minutes), `rain+${minutes}`)
    for (const hours of [0, 1, 2, 3]) queue.enqueue(hourly('cloud_low', hours), `cloud+${hours}h`)
    for (const hours of [0, 1, 2, 3]) queue.enqueue(hourly('temp_c', hours), `temp+${hours}h`)
    expect(drain(queue)).toEqual([
      'rain+0', 'cloud+0h', 'temp+0h', 'cloud+1h', 'temp+1h',
      'rain+30',
      'rain+60',
      'cloud+2h', 'temp+2h',
      'rain+120',
      'cloud+3h', 'temp+3h',
    ])
  })

  it('takes turns between fields at the same distance, rain first', () => {
    const queue = new DecodeQueue<string>()
    queue.setIntent(intent())
    for (const field of ['wind_u_ms', 'wind_v_ms']) {
      queue.enqueue(hourly(field, -2), `${field}-2h`)
      queue.enqueue(hourly(field, 2), `${field}+2h`)
    }
    queue.enqueue(rain(-65), 'rain-65')
    queue.enqueue(rain(65), 'rain+65')
    expect(drain(queue)).toEqual(['rain-65', 'rain+65', 'wind_u_ms-2h', 'wind_v_ms-2h', 'wind_u_ms+2h', 'wind_v_ms+2h'])
  })

  it('prefers the playback direction at equal clock distance', () => {
    const queue = new DecodeQueue<string>()
    queue.setIntent(intent({ playback: 1 }))
    queue.enqueue(rain(-30), 'behind-30')
    queue.enqueue(rain(30), 'ahead-30')
    queue.enqueue(rain(-20), 'behind-20')
    queue.enqueue(rain(35), 'ahead-35')
    // Vooruit telt ×0,8: +30 → 20 min en +35 → 24 min, tegen 15 en 25 min achter de cursor.
    expect(drain(queue)).toEqual(['behind-20', 'ahead-30', 'ahead-35', 'behind-30'])
  })

  it('reorders what is still waiting when the cursor jumps', () => {
    const queue = new DecodeQueue<string>()
    queue.setIntent(intent())
    for (const hours of [0, 1, 2, 3, 4, 5, 6]) queue.enqueue(hourly('temp_c', hours), `temp+${hours}h`)
    expect(queue.take()).toBe('temp+0h')
    expect(queue.take()).toBe('temp+1h')
    queue.setIntent(intent({ cursorEpoch: noon + 6 * HOUR }))
    expect(drain(queue)).toEqual(['temp+5h', 'temp+6h', 'temp+4h', 'temp+3h', 'temp+2h'])
  })

  it('leaves what is outside the window or not shown in this mode for last', () => {
    const queue = new DecodeQueue<string>()
    queue.setIntent(intent({ window: { start: noon - HOUR, end: noon + 2 * HOUR }, fields: new Set(['rain_rate', 'temp_c']) }))
    queue.enqueue(hourly('rel_humidity', 0), 'hidden-field-now')
    queue.enqueue(hourly('temp_c', 5), 'outside-window')
    queue.enqueue(hourly('temp_c', 2), 'window-edge')
    queue.enqueue(rain(90), 'rain+90')
    expect(drain(queue)).toEqual(['window-edge', 'rain+90', 'hidden-field-now', 'outside-window'])
  })
})
