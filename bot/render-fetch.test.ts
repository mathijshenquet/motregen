import { afterEach, expect, it, vi } from 'vitest'
import { installRenderFetch } from './render-fetch.js'

const manifest = { version: 0, generated: '2026-10-07T12:00:00Z', now: '2026-10-07T12:00:00Z', chunks: [] }

function setup() {
  const original = vi.fn<typeof fetch>()
  const browser = { fetch: original, location: new URL('https://motregen.nl/?still=1') }
  vi.stubGlobal('window', browser)
  installRenderFetch(manifest)
  return { original, request: browser.fetch }
}

afterEach(() => vi.unstubAllGlobals())

it('pins the manifest without a network request and keeps tile requests unchanged', async () => {
  const { original, request } = setup()
  expect(await (await request('/data/manifest.json')).json()).toEqual(manifest)
  expect(original).not.toHaveBeenCalled()
  original.mockResolvedValue(new Response('tile'))
  await request('/tiles/map', { cache: 'default' })
  expect(original).toHaveBeenCalledExactlyOnceWith('/tiles/map', { cache: 'default' })
})

it.each(['network', 'server'])('retries one temporary %s failure and preserves Range headers', async (failure) => {
  const { original, request } = setup()
  if (failure === 'network') original.mockRejectedValueOnce(new TypeError('Failed to fetch'))
  else original.mockResolvedValueOnce(new Response('proxy failed', { status: 500 }))
  original.mockResolvedValueOnce(new Response('chunk', { status: 206 }))
  const options = { headers: { Range: 'bytes=100-200' } }
  expect(await (await request('/data/chunks/rain.mrf', options)).text()).toBe('chunk')
  expect(original).toHaveBeenCalledTimes(2)
  expect(original).toHaveBeenLastCalledWith('/data/chunks/rain.mrf', { ...options, cache: 'reload' })
})

it('returns a repeated server failure without a third request', async () => {
  const { original, request } = setup()
  original.mockResolvedValue(new Response(null, { status: 503 }))
  expect((await request('/data/chunks/rain.mrf')).status).toBe(503)
  expect(original).toHaveBeenCalledTimes(2)
})

it('does not retry a permanent 404 or an aborted request', async () => {
  const { original, request } = setup()
  original.mockResolvedValueOnce(new Response(null, { status: 404 }))
  expect((await request('/data/chunks/missing.mrf')).status).toBe(404)
  expect(original).toHaveBeenCalledTimes(1)
  original.mockClear()
  original.mockRejectedValue(new DOMException('Aborted', 'AbortError'))
  await expect(request('/data/chunks/rain.mrf', { signal: AbortSignal.abort() })).rejects.toThrow('Aborted')
  expect(original).toHaveBeenCalledTimes(1)
})
