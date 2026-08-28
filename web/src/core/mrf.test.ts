import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Manifest } from './contract'
import { decodeFrame, LruCache, MrfClient, parseMrfHeader } from './mrf'
import { buildTimeline } from './time-model'

let file: Uint8Array
let headerLength: number
let manifest: Manifest
const files = new Map<string, Uint8Array>()

beforeAll(async () => {
  manifest = JSON.parse(await readFile(resolve('public/data/manifest.json'), 'utf8')) as Manifest
  headerLength = manifest.chunks[0]!.header_len
  file = await readFile(resolve('public/data', manifest.chunks[0]!.url))
  for (const chunk of manifest.chunks) files.set(chunk.url, new Uint8Array(await readFile(resolve('public/data', chunk.url))))
})

afterEach(() => vi.unstubAllGlobals())

describe('mrf v0', () => {
  it('parses the synthgen header and decodes a frame byte-exact', () => {
    const header = parseMrfHeader(file.subarray(0, headerLength))
    const indexed = header.frames[3]!
    const actual = decodeFrame(file.subarray(headerLength + indexed.offset, headerLength + indexed.offset + indexed.len), header.grid.width * header.grid.height)
    expect(actual.length).toBe(header.grid.width * header.grid.height)
    expect(createHash('sha256').update(actual).digest('hex')).toBe('c2fb5773d09e81d8487c3cabfe4bdb04a0fdd66827089cd1886614bd10807b1b')
  })

  it('evicts the least recently used value', () => {
    const cache = new LruCache<string, number>(2)
    cache.set('a', 1); cache.set('b', 2); cache.get('a'); cache.set('c', 3)
    expect(cache.get('a')).toBe(1)
    expect(cache.get('b')).toBeUndefined()
  })

  it('emits an hourly radiation chunk with a plausible day-night cycle', async () => {
    const chunk = manifest.chunks.find((candidate) => candidate.field === 'radiation')
    expect(chunk?.times).toHaveLength(24)
    const radiationFile = new Uint8Array(await readFile(resolve('public/data', chunk!.url)))
    const header = parseMrfHeader(radiationFile.subarray(0, chunk!.header_len))
    expect(header.field).toBe('radiation')
    expect(header.quant[100]).toBe(500)

    const decode = (index: number) => {
      const frame = header.frames[index]!
      return decodeFrame(
        radiationFile.subarray(chunk!.header_len + frame.offset, chunk!.header_len + frame.offset + frame.len),
        header.grid.width * header.grid.height,
      )
    }
    const nightIndex = chunk!.times.findIndex((time) => new Date(time).getUTCHours() === 23)
    const noonIndex = chunk!.times.findIndex((time) => new Date(time).getUTCHours() === 12)
    expect(Math.max(...decode(nightIndex))).toBe(0)
    expect(Math.max(...decode(noonIndex))).toBeGreaterThan(100)
  })

  it('coalesces a full location sample per chunk and serves the next location entirely from cache', async () => {
    class DecodeWorker {
      onmessage?: (event: MessageEvent) => void
      postMessage(message: { id: number; bytes: ArrayBuffer; expectedLength: number }): void {
        const frame = decodeFrame(new Uint8Array(message.bytes), message.expectedLength)
        queueMicrotask(() => this.onmessage?.({ data: { id: message.id, frame: frame.buffer } } as MessageEvent))
      }
    }
    vi.stubGlobal('Worker', DecodeWorker)
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input))
      const name = url.pathname.replace('/data/', '')
      const bytes = files.get(name)
      if (!bytes) return new Response(null, { status: 404 })
      const range = new Headers(init?.headers).get('Range')
      const match = range && /^bytes=(\d+)-(\d+)$/.exec(range)
      if (!match) return new Response(Uint8Array.from(bytes).buffer, { status: 200 })
      const start = Number(match[1]), end = Number(match[2])
      return new Response(Uint8Array.from(bytes.subarray(start, end + 1)).buffer, { status: 206 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const client = new MrfClient(new URL('https://example.test/data/manifest.json'))
    const frames = [...buildTimeline(manifest), ...buildTimeline(manifest, 'radiation')]
    const chunks = new Map(frames.map((frame) => [frame.chunk, [] as number[]]))
    for (const frame of frames) chunks.get(frame.chunk)!.push(frame.frameIndex)

    await client.getHeader(manifest.chunks[0]!)
    fetchMock.mockClear()
    await Promise.all([...chunks].map(([chunk, indexes]) => client.getFrames(chunk, indexes)))

    expect(frames).toHaveLength(107)
    expect(fetchMock).toHaveBeenCalledTimes(11)
    for (const [chunk] of chunks) {
      const chunkFile = files.get(chunk.url)!
      const ranges = fetchMock.mock.calls
        .filter(([input]) => String(input).endsWith(chunk.url))
        .map(([, init]) => new Headers(init?.headers).get('Range'))
      expect(ranges).toContain(`bytes=${chunk.header_len}-${chunkFile.length - 1}`)
    }

    fetchMock.mockClear()
    await Promise.all([...chunks].map(([chunk, indexes]) => client.getFrames(chunk, indexes)))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
