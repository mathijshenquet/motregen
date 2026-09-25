import { describe, expect, it, vi } from 'vitest'
import {
  createUsageTracker, durationBucket, installUsageBeacon, sessionManifestUrls, USAGE_DURATIONS, USAGE_ENDPOINT, USAGE_FEATURES, USAGE_FIELDS,
  USAGE_RANGES, USAGE_THEMES, USAGE_WIDTHS, widthClass, type UsageEnvironment,
} from './usage'

function environment(overrides: Partial<UsageEnvironment> = {}) {
  const beacons: Array<{ url: string; body: string }> = []
  const env: UsageEnvironment = {
    now: () => 0,
    coarsePointer: () => false,
    viewportWidth: () => 1280,
    sendBeacon: (url, body) => { beacons.push({ url, body }); return true },
    ...overrides,
  }
  return { env, beacons }
}

class FakeTarget {
  visibilityState: DocumentVisibilityState = 'visible'
  private listeners = new Map<string, Set<() => void>>()
  addEventListener(type: string, listener: () => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set())
    this.listeners.get(type)!.add(listener)
  }
  removeEventListener(type: string, listener: () => void) { this.listeners.get(type)?.delete(listener) }
  dispatch(type: string) { for (const listener of [...this.listeners.get(type) ?? []]) listener() }
  count() { return [...this.listeners.values()].reduce((sum, set) => sum + set.size, 0) }
}

function install(tracker: ReturnType<typeof createUsageTracker>) {
  const document = new FakeTarget()
  const window = new FakeTarget()
  const dispose = installUsageBeacon(tracker, document as unknown as Document, window as unknown as Window)
  return { document, window, dispose }
}

const allowedValues: Record<string, ReadonlyArray<unknown>> = {
  range: [null, ...USAGE_RANGES],
  theme: USAGE_THEMES,
  width: USAGE_WIDTHS,
  dur: USAGE_DURATIONS,
}

const REQUIRED_FIELDS = ['range', 'theme', 'coarse', 'width', 'dur']

function expectWhitelisted(body: Record<string, unknown>): void {
  for (const key of Object.keys(body)) expect(USAGE_FIELDS).toContain(key)
  for (const key of REQUIRED_FIELDS) expect(body).toHaveProperty(key)
  for (const [key, value] of Object.entries(body)) {
    if (key in allowedValues) expect(allowedValues[key]).toContain(value)
    else if (key === 'coarse') expect(typeof value).toBe('boolean')
    else expect(value).toBe(true)
  }
}

describe('usage beacon body', () => {
  it('contains exactly the whitelisted fields, before and after every feature is used', () => {
    const { env } = environment()
    const tracker = createUsageTracker(env, 'light')
    expectWhitelisted(tracker.sessionBody())
    expect(Object.keys(tracker.sessionBody()).sort()).toEqual([...REQUIRED_FIELDS].sort())

    for (const feature of USAGE_FEATURES) tracker.mark(feature)
    tracker.setRange(24)
    tracker.setTheme('dark')
    const body = tracker.sessionBody()
    expectWhitelisted(body)
    expect(Object.keys(body).sort()).toEqual([...USAGE_FIELDS].sort())
    expect(JSON.stringify(body).length).toBeLessThan(240)
    for (const feature of USAGE_FEATURES) expect(body[feature]).toBe(true)
    expect(body.range).toBe('24')
    expect(body.theme).toBe('dark')
  })

  it('never carries numbers, timestamps or free text, whatever the environment reports', () => {
    const { env, beacons } = environment({ now: () => 1_234_567, viewportWidth: () => 390, coarsePointer: () => true })
    const tracker = createUsageTracker(env, 'system')
    tracker.mark('geo')
    tracker.mark('search')
    tracker.setRange(null)
    tracker.setRange(7)
    tracker.sendUsage()
    const sent = JSON.parse(beacons[0]!.body) as Record<string, unknown>
    expectWhitelisted(sent)
    expect(sent).toMatchObject({ geo: true, search: true, range: 'all', coarse: true, width: '<430', dur: '5-30', theme: 'system' })
    expect(beacons[0]!.body).not.toMatch(/\d{4,}|\d\.\d/)
    expect(beacons[0]!.body.length).toBeLessThan(200)
  })

  it('buckets width and session duration', () => {
    expect([429, 430, 959, 960].map(widthClass)).toEqual(['<430', '<960', '<960', '>=960'])
    expect([0, 59_999, 60_000, 299_999, 300_000, 1_799_999, 1_800_000].map(durationBucket))
      .toEqual(['<1', '<1', '1-5', '1-5', '5-30', '5-30', '>30'])
  })
})

describe('usage beacon sending', () => {
  it('sends once, to /hit, on the first hidden visibility change and not again after returning', () => {
    const { env, beacons } = environment()
    const tracker = createUsageTracker(env, 'light')
    const { document, window } = install(tracker)

    document.dispatch('visibilitychange')
    expect(beacons).toHaveLength(0)

    document.visibilityState = 'hidden'
    document.dispatch('visibilitychange')
    expect(beacons).toHaveLength(1)
    expect(beacons[0]!.url).toBe(USAGE_ENDPOINT)

    document.visibilityState = 'visible'
    tracker.mark('play')
    document.dispatch('visibilitychange')
    document.visibilityState = 'hidden'
    document.dispatch('visibilitychange')
    window.dispatch('pagehide')
    expect(beacons).toHaveLength(1)
    expect(tracker.sendUsage()).toBe(false)
    expect(document.count() + window.count()).toBe(0)
  })

  it('falls back to pagehide and survives a throwing sendBeacon', () => {
    const sendBeacon = vi.fn(() => { throw new Error('blocked') })
    const tracker = createUsageTracker(environment({ sendBeacon }).env, 'light')
    const { window } = install(tracker)
    window.dispatch('pagehide')
    window.dispatch('pagehide')
    expect(sendBeacon).toHaveBeenCalledTimes(1)
    expect(tracker.sent).toBe(true)
  })

  it('reports changes for the dev panel only when something changed', () => {
    const tracker = createUsageTracker(environment().env, 'light')
    const onChange = vi.fn()
    tracker.onChange = onChange
    tracker.mark('about')
    tracker.mark('about')
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})

describe('session manifest flag', () => {
  it('puts ?s=1 on the first manifest request of the session only', () => {
    const base = new URL('https://motregen.nl/data/manifest.json')
    const next = sessionManifestUrls(base)
    expect(next().href).toBe('https://motregen.nl/data/manifest.json?s=1')
    expect(next().href).toBe(base.href)
    expect(next().href).toBe(base.href)
    expect(base.search).toBe('')
  })
})
