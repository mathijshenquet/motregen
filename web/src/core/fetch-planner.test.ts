import { describe, expect, it } from 'vitest'
import { FetchPlanner } from './fetch-planner'
import type { FrameTiming, Intent } from './intent'

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const noon = Date.UTC(2026, 9, 7, 12)

const rain = (minutes: number): FrameTiming => ({ epoch: noon + minutes * MINUTE, stepMs: 5 * MINUTE, field: 'rain_rate' })
const hourly = (field: string, hours: number): FrameTiming => ({ epoch: noon + hours * HOUR, stepMs: HOUR, field })
const intent = (overrides: Partial<Intent> = {}): Intent => ({
  cursorEpoch: noon,
  window: { start: noon - 3 * HOUR, end: noon + 5 * HOUR },
  playback: 0,
  scrubVelocity: 0,
  fields: new Set(['rain_rate', 'cloud_low', 'temp_c']),
  ...overrides,
})
const settle = () => new Promise((done) => setTimeout(done, 0))

/** Requests die pas klaar zijn als de test dat zegt, zodat zichtbaar is wat tegelijk loopt. */
function harness(bulkRequests: number, startIntent: Intent | undefined = intent()) {
  const planner = new FetchPlanner(bulkRequests)
  if (startIntent) planner.setIntent(startIntent)
  const started: string[] = []
  const running = new Map<string, () => void>()
  const outcomes = new Map<string, string>()
  const wish = (name: string, url: string, frames: FrameTiming[], wanted = () => true, bytes = 250_000) => {
    void planner.fetch({ url, bytes, frames, wanted, run: () => new Promise<void>((finish) => { started.push(name); running.set(name, finish) }) })
      .then(() => outcomes.set(name, 'geladen'), (error: Error) => outcomes.set(name, error.name))
  }
  const finish = async (name: string) => { running.get(name)!(); running.delete(name); await settle() }
  return { planner, started, running, outcomes, wish, finish }
}

describe('FetchPlanner', () => {
  it('runs a limited number of large transfers at once, nearest to the cursor first across fields', async () => {
    const { started, wish, finish } = harness(2)
    wish('rain-far', 'seamless', [rain(180), rain(240)])
    wish('temp-far', 'temp-b', [hourly('temp_c', 4)])
    await settle()
    wish('cloud-now', 'cloud', [hourly('cloud_low', 0), hourly('cloud_low', 1)])
    wish('rain-now', 'nowcast', [rain(0), rain(60)])
    wish('temp-now', 'temp-a', [hourly('temp_c', 0)])
    await settle()
    // De eerste twee waren al onderweg; daarna gaat wat rond de cursor ligt voor, regen eerst.
    expect(started).toEqual(['rain-far', 'temp-far'])
    await finish('rain-far')
    expect(started).toEqual(['rain-far', 'temp-far', 'rain-now'])
    await finish('temp-far')
    await finish('rain-now')
    expect(started).toEqual(['rain-far', 'temp-far', 'rain-now', 'cloud-now', 'temp-now'])
  })

  it('lets a wish without frames through before any frame', async () => {
    const { started, wish, finish } = harness(1)
    wish('frames', 'a', [rain(0)])
    wish('more-frames', 'b', [rain(0)])
    wish('untimed', 'c', [])
    await settle()
    expect(started).toEqual(['untimed'])
    await finish('untimed')
    expect(started).toEqual(['untimed', 'frames'])
  })

  it('keeps one request per chunk at a time', async () => {
    const { started, wish, finish } = harness(3)
    wish('piece-near', 'rtcor', [rain(-5), rain(0)])
    wish('piece-next', 'rtcor', [rain(-15), rain(-10)])
    wish('cloud', 'cloud', [hourly('cloud_low', 2)])
    await settle()
    expect(started).toEqual(['piece-near', 'cloud'])
    await finish('piece-near')
    expect(started).toEqual(['piece-near', 'cloud', 'piece-next'])
  })

  it('starts work outside the window only when nothing inside it is running', async () => {
    const { started, wish, finish } = harness(3)
    wish('rain-now', 'nowcast', [rain(0)])
    wish('tomorrow', 'temp-b', [hourly('temp_c', 20)])
    wish('hidden-field', 'humidity', [hourly('rel_humidity', 0)])
    await settle()
    expect(started).toEqual(['rain-now'])
    await finish('rain-now')
    // Ook idle-werk gaat op afstand: het verborgen veld van nu voor de tabel van morgen.
    expect(started).toEqual(['rain-now', 'hidden-field', 'tomorrow'])
  })

  it('lets small requests through next to the large transfers, up to what the browser keeps open', async () => {
    const { started, wish } = harness(1)
    wish('rain-piece', 'nowcast', [rain(0)])
    wish('rain-next', 'rtcor', [rain(-5)])
    for (const layer of ['low', 'mid', 'high']) wish(`cloud-${layer}`, `cloud-${layer}`, [hourly('cloud_low', 0)], () => true, 30_000)
    for (const part of ['a', 'b', 'c']) wish(`temp-${part}`, `temp-${part}`, [hourly('temp_c', 0)], () => true, 9_000)
    await settle()
    expect(started).toEqual(['rain-piece', 'cloud-low', 'temp-a', 'cloud-mid', 'temp-b', 'cloud-high'])
  })

  it('reorders the waiting wishes for a new intent and drops the ones nobody wants any more', async () => {
    const { planner, started, outcomes, wish, finish } = harness(1)
    let viewMoved = false
    wish('running', 'a', [rain(0)])
    wish('old-window', 'b', [rain(30)], () => !viewMoved)
    wish('evening', 'c', [rain(240)])
    wish('afternoon', 'd', [rain(120)])
    await settle()
    viewMoved = true
    planner.setIntent(intent({ cursorEpoch: noon + 4 * HOUR }))
    await finish('running')
    expect(started).toEqual(['running', 'evening'])
    expect(outcomes.get('old-window')).toBe('DecodeCancelled')
    await finish('evening')
    expect(started).toEqual(['running', 'evening', 'afternoon'])
  })

  it('passes a failed request on to whoever asked for it and carries on', async () => {
    const planner = new FetchPlanner(1)
    const failed = planner.fetch({ url: 'a', bytes: 250_000, frames: [rain(0)], wanted: () => true, run: () => Promise.reject(new Error('Laden mislukt (503)')) })
    const next = planner.fetch({ url: 'b', bytes: 250_000, frames: [rain(5)], wanted: () => true, run: () => Promise.resolve() })
    await expect(failed).rejects.toThrow('Laden mislukt (503)')
    await expect(next).resolves.toBeUndefined()
  })
})
