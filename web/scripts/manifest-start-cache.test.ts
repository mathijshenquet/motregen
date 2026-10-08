import { afterEach, describe, expect, it, vi } from 'vitest'
import { manifestStartCache } from './manifest-start-cache'

afterEach(() => vi.useRealTimers())

describe('begrensde startmanifestcache', () => {
  it('gebruikt alleen een recente complete respons en behoudt de inhoud', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-10-08T12:00:00Z'))
    const cachedResponse = await manifestStartCache.cacheWillUpdate({ response: Response.json({ generated: '2026-10-08T12:00:00Z' }) })
    const request = new Request('https://motregen.nl/data/manifest.json?s=1')
    expect(await manifestStartCache.cachedResponseWillBeUsed({ request, cachedResponse: cachedResponse! })).toBe(cachedResponse)
    expect(await cachedResponse!.clone().json()).toEqual({ generated: '2026-10-08T12:00:00Z' })
    vi.advanceTimersByTime(15_000)
    expect(await manifestStartCache.cachedResponseWillBeUsed({ request, cachedResponse: cachedResponse! })).toBeNull()
  })

  it('ververst expliciet en weigert foutieve of ongedateerde cache-inhoud', async () => {
    vi.useFakeTimers().setSystemTime(new Date('2026-10-08T12:00:00Z'))
    const cachedResponse = await manifestStartCache.cacheWillUpdate({ response: Response.json({ generated: 'recent' }) })
    for (const cache of ['no-cache', 'reload', 'no-store'] as const) {
      const request = new Request('https://motregen.nl/data/manifest.json?s=1', { cache })
      expect(await manifestStartCache.cachedResponseWillBeUsed({ request, cachedResponse: cachedResponse! })).toBeNull()
    }
    const request = new Request('https://motregen.nl/data/manifest.json?s=1')
    expect(await manifestStartCache.cachedResponseWillBeUsed({ request, cachedResponse: new Response('{}') })).toBeNull()
    expect(await manifestStartCache.cacheWillUpdate({ response: new Response('fout', { status: 503 }) })).toBeNull()
  })
})
