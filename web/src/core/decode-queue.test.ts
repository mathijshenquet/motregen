import { describe, expect, it } from 'vitest'
import { decodeDistance, DecodeQueue, type FrameTiming } from './decode-queue'

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

describe('decodeDistance', () => {
  it('is zero for the frames the cursor sits between, also for an hourly field', () => {
    const cursor = { epoch: noon + 20 * MINUTE, direction: 0 as const }
    expect(decodeDistance(hourly('temp_c', 0), cursor)).toBe(0)
    expect(decodeDistance(hourly('temp_c', 1), cursor)).toBe(0)
    expect(decodeDistance(hourly('temp_c', 2), cursor)).toBe(40 * MINUTE)
    expect(decodeDistance(rain(20), cursor)).toBe(0)
    expect(decodeDistance(rain(40), cursor)).toBe(15 * MINUTE)
  })

  it('counts frames in the playback direction as closer', () => {
    const playing = { epoch: noon, direction: 1 as const }
    expect(decodeDistance(rain(65), playing)).toBe(48 * MINUTE)
    expect(decodeDistance(rain(-65), playing)).toBe(60 * MINUTE)
    expect(decodeDistance(rain(-65), { epoch: noon, direction: -1 })).toBe(48 * MINUTE)
  })

  it('puts a frame without a known time last', () => {
    expect(decodeDistance({ epoch: Number.NaN, stepMs: 0, field: 'rain_rate' }, { epoch: noon, direction: 0 })).toBe(Number.POSITIVE_INFINITY)
  })
})

describe('DecodeQueue', () => {
  it('keeps arrival order until a cursor is known', () => {
    const queue = new DecodeQueue<string>()
    queue.enqueue(rain(60), 'far')
    queue.enqueue(rain(0), 'near')
    expect(queue.size).toBe(2)
    expect(drain(queue)).toEqual(['far', 'near'])
    expect(queue.size).toBe(0)
  })

  it('serves every field nearest to the cursor first instead of field by field', () => {
    const queue = new DecodeQueue<string>()
    queue.setCursor({ epoch: noon, direction: 0 })
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
    queue.setCursor({ epoch: noon, direction: 0 })
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
    queue.setCursor({ epoch: noon, direction: 1 })
    queue.enqueue(rain(-30), 'behind-30')
    queue.enqueue(rain(30), 'ahead-30')
    queue.enqueue(rain(-20), 'behind-20')
    queue.enqueue(rain(35), 'ahead-35')
    // Vooruit telt ×0,8: +30 → 20 min en +35 → 24 min, tegen 15 en 25 min achter de cursor.
    expect(drain(queue)).toEqual(['behind-20', 'ahead-30', 'ahead-35', 'behind-30'])
  })

  it('reorders what is still waiting when the cursor jumps', () => {
    const queue = new DecodeQueue<string>()
    queue.setCursor({ epoch: noon, direction: 0 })
    for (const hours of [0, 1, 2, 3, 4, 5, 6]) queue.enqueue(hourly('temp_c', hours), `temp+${hours}h`)
    expect(queue.take()).toBe('temp+0h')
    expect(queue.take()).toBe('temp+1h')
    queue.setCursor({ epoch: noon + 6 * HOUR, direction: 0 })
    expect(drain(queue)).toEqual(['temp+5h', 'temp+6h', 'temp+4h', 'temp+3h', 'temp+2h'])
  })
})
