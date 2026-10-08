import { afterEach, describe, expect, it, vi } from 'vitest'
import { fetchInitialManifest } from './initial-manifest'

afterEach(() => vi.unstubAllGlobals())

describe('vroeg manifest', () => {
  it('gebruikt het eerste sessieverzoek eenmaal en haalt een refresh opnieuw op', async () => {
    const url = new URL('https://app.example.test/data/manifest.json?s=1')
    const initial = new Response('{"generated":"eerste"}')
    const fresh = new Response('{"generated":"nieuw"}')
    const request = vi.fn(async () => fresh)
    vi.stubGlobal('window', { __motregenInitialManifest: { url: url.href, response: Promise.resolve(initial) } })
    vi.stubGlobal('fetch', request)
    expect(await fetchInitialManifest(url, 'default')).toBe(initial)
    expect(request).not.toHaveBeenCalled()
    const refresh = new URL('https://app.example.test/data/manifest.json')
    expect(await fetchInitialManifest(refresh, 'no-cache')).toBe(fresh)
    expect(request).toHaveBeenCalledExactlyOnceWith(refresh, { cache: 'no-cache' })
  })

  it('gebruikt een bootstrap voor een andere URL niet voor stills', async () => {
    const url = new URL('https://app.example.test/data/manifest.json')
    const request = vi.fn(async () => new Response('{}'))
    vi.stubGlobal('window', { __motregenInitialManifest: { url: `${url.href}?s=1`, response: Promise.resolve(new Response('{}')) } })
    vi.stubGlobal('fetch', request)
    await fetchInitialManifest(url, 'default')
    expect(request).toHaveBeenCalledExactlyOnceWith(url, { cache: 'default' })
  })
})
