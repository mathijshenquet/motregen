import { describe, expect, it } from 'vitest'
import { basemapRangeCache } from './basemap-range-cache'

describe('PMTiles-rangecache', () => {
  const url = 'https://data.example.test/data/basemap/nl-0123456789abcdef.pmtiles'

  it('houdt verschillende bereiken en archiefversies uit elkaar', async () => {
    const key = async (archive: string, range: string) => basemapRangeCache.cacheKeyWillBeUsed({
      request: new Request(archive, { headers: { Range: range } }),
    })
    const header = await key(url, 'bytes=0-16383')
    const tile = await key(url, 'bytes=16384-32767')
    const updated = await key(url.replace('0123456789abcdef', 'fedcba9876543210'), 'bytes=0-16383')
    expect(new Set([header.url, tile.url, updated.url]).size).toBe(3)
    expect(new URL(header.url).searchParams.get('motregen-range')).toBe('bytes=0-16383')
    expect(header.headers.has('Range')).toBe(false)
  })

  it('bewaart deelresponses als 200 en levert dezelfde bytes en rangeheaders als 206', async () => {
    const bytes = new Uint8Array([0, 255, 17, 42])
    const response = new Response(bytes, { status: 206, headers: {
      'Content-Range': 'bytes 40-43/100',
      'Content-Length': '4',
      'Content-Type': 'application/vnd.pmtiles',
      ETag: '"archive-version"',
    } })
    const stored = await basemapRangeCache.cacheWillUpdate({ response })
    expect(stored?.status).toBe(200)
    const cached = await basemapRangeCache.cachedResponseWillBeUsed({ cachedResponse: stored! })
    expect(cached?.status).toBe(206)
    for (const name of ['Content-Range', 'Content-Length', 'Content-Type', 'ETag']) {
      expect(cached!.headers.get(name)).toBe(response.headers.get(name))
    }
    expect(new Uint8Array(await cached!.arrayBuffer())).toEqual(bytes)
  })

  it('cachet geen fouten of deelresponses zonder rangeheaders', async () => {
    for (const response of [new Response(null, { status: 404 }), new Response(null, { status: 206 })]) {
      expect(await basemapRangeCache.cacheWillUpdate({ response })).toBeNull()
    }
  })

  it('behoudt volledige responses en cachemissers', async () => {
    const request = new Request(url)
    const response = new Response('archive')
    expect(await basemapRangeCache.cacheKeyWillBeUsed({ request })).toBe(request)
    expect(await basemapRangeCache.cacheWillUpdate({ response })).toBe(response)
    expect(await basemapRangeCache.cachedResponseWillBeUsed({ cachedResponse: response })).toBe(response)
    expect(await basemapRangeCache.cachedResponseWillBeUsed({})).toBeUndefined()
  })
})
