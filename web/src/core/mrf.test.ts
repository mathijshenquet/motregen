import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Field, Manifest, MrfHeader } from './contract'
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
  it.each([
    ['rain_rate', 0, true],
    ['radiation', 0, true],
    ['rain_rate', -30, false],
    ['radiation', -30, false],
    ['temp_c', -30, true],
    ['feels_like_c', -40, true],
    ['wind_u_ms', -30, true],
    ['wind_v_ms', -30, true],
    ['uv', 0.2, true],
    ['rel_humidity', 0, true],
    ['cloud_frac', 0, true],
  ] satisfies Array<[Field, number, boolean]>)('validates quantization by field for %s with quant[0]=%s', (field, first, valid) => {
    const quant: Array<number | null> = Array.from({ length: 255 }, (_, index) => first + index)
    quant.push(null)
    const header: MrfHeader = {
      version: 0,
      field,
      grid: { crs: 'EPSG:3857', x0: 0, y0: 1, dx: 1, dy: -1, width: 1, height: 1 },
      quant,
      source: 'harmonie',
      run: '2026-08-28T12:00:00Z',
      frames: [],
      dict: null,
    }
    const json = new TextEncoder().encode(JSON.stringify(header))
    const bytes = new Uint8Array(8 + json.length)
    bytes.set(new TextEncoder().encode('mrf0'))
    new DataView(bytes.buffer).setUint32(4, json.length, true)
    bytes.set(json, 8)
    if (valid) expect(parseMrfHeader(bytes).field).toBe(field)
    else expect(() => parseMrfHeader(bytes)).toThrow('Ongeldige kwantisatietabel')
  })

  it('requires index 255 to remain null for every field', () => {
    const quant: Array<number | null> = Array.from({ length: 256 }, (_, index) => index - 40)
    const header: MrfHeader = {
      version: 0,
      field: 'wind_u_ms',
      grid: { crs: 'EPSG:3857', x0: 0, y0: 1, dx: 1, dy: -1, width: 1, height: 1 },
      quant,
      source: 'harmonie',
      run: '2026-08-28T12:00:00Z',
      frames: [],
      dict: null,
    }
    const json = new TextEncoder().encode(JSON.stringify(header))
    const bytes = new Uint8Array(8 + json.length)
    bytes.set(new TextEncoder().encode('mrf0'))
    new DataView(bytes.buffer).setUint32(4, json.length, true)
    bytes.set(json, 8)
    expect(() => parseMrfHeader(bytes)).toThrow('Ongeldige kwantisatietabel')
  })

  it('parses the synthgen header and decodes a frame byte-exact', () => {
    const header = parseMrfHeader(file.subarray(0, headerLength))
    const indexed = header.frames[3]!
    const actual = decodeFrame(file.subarray(headerLength + indexed.offset, headerLength + indexed.offset + indexed.len), header.grid.width * header.grid.height)
    expect(actual.length).toBe(header.grid.width * header.grid.height)
    expect(createHash('sha256').update(actual).digest('hex')).toBe('ad6cb94652796a3940c6afd4cdea43242063be859be128f4b165ed71c958f26b')
  })

  it('decodes a synthgen motion annex byte-exact through the existing worker path', async () => {
    class DecodeWorker {
      onmessage?: (event: MessageEvent) => void
      postMessage(message: { id: number; bytes: ArrayBuffer; expectedLength: number }): void {
        const frame = decodeFrame(new Uint8Array(message.bytes), message.expectedLength)
        queueMicrotask(() => this.onmessage?.({ data: { id: message.id, frame: frame.slice().buffer } } as MessageEvent))
      }
    }
    vi.stubGlobal('Worker', DecodeWorker)
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input))
      const bytes = files.get(url.pathname.replace('/data/', ''))!
      const match = /^bytes=(\d+)-(\d+)$/.exec(new Headers(init?.headers).get('Range')!)!
      return new Response(Uint8Array.from(bytes.subarray(Number(match[1]), Number(match[2]) + 1)).buffer, { status: 206 })
    })
    const client = new MrfClient(new URL('https://example.test/data/manifest.json'))
    const motion = await client.getMotion(manifest.chunks[0]!, 3)

    expect(motion && [motion.width, motion.height, motion.vectors.length]).toEqual([19, 23, 874])
    expect(createHash('sha256').update(motion!.vectors).digest('hex')).toBe('5c93ea09d6e84618dcb2310660343c13716d809bbf7532203bab3f1a29d6525f')
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

  it('emits official-source synthetic UV only during its daylight publication window', async () => {
    const chunk = manifest.chunks.find((candidate) => candidate.field === 'uv')
    expect(chunk?.source).toBe('uv')
    expect(chunk?.times).toHaveLength(72)
    const uvFile = new Uint8Array(await readFile(resolve('public/data', chunk!.url)))
    const header = parseMrfHeader(uvFile.subarray(0, chunk!.header_len))
    const decode = (index: number) => {
      const frame = header.frames[index]!
      return decodeFrame(
        uvFile.subarray(chunk!.header_len + frame.offset, chunk!.header_len + frame.offset + frame.len),
        header.grid.width * header.grid.height,
      )
    }
    const beforeSunrise = chunk!.times.findIndex((time) => new Date(time).getUTCHours() === 3)
    const noon = chunk!.times.findIndex((time) => new Date(time).getUTCHours() === 12 && new Date(time).getUTCMinutes() === 0)
    expect(Math.max(...decode(beforeSunrise))).toBe(0)
    expect(header.quant[Math.max(...decode(noon))]!).toBeGreaterThan(3)
  })

  it('coalesces a full location sample per chunk and serves the next location entirely from cache', async () => {
    class DecodeWorker {
      onmessage?: (event: MessageEvent) => void
      postMessage(message: { id: number; bytes: ArrayBuffer; expectedLength: number }): void {
        const frame = decodeFrame(new Uint8Array(message.bytes), message.expectedLength)
        queueMicrotask(() => this.onmessage?.({ data: { id: message.id, frame: frame.slice().buffer } } as MessageEvent))
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
    const frames = [...buildTimeline(manifest), ...buildTimeline(manifest, 'radiation'), ...buildTimeline(manifest, 'uv')]
    const chunks = new Map(frames.map((frame) => [frame.chunk, [] as number[]]))
    for (const frame of frames) chunks.get(frame.chunk)!.push(frame.frameIndex)

    await client.getHeader(manifest.chunks[0]!)
    fetchMock.mockClear()
    await Promise.all([...chunks].map(([chunk, indexes]) => client.getFrames(chunk, indexes)))

    expect(frames).toHaveLength(131)
    expect(fetchMock).toHaveBeenCalledTimes(13)
    for (const [chunk] of chunks) {
      const chunkFile = files.get(chunk.url)!
      const header = parseMrfHeader(chunkFile.subarray(0, chunk.header_len))
      const finalOffset = Math.max(...header.frames.flatMap((frame) => [frame.offset + frame.len, frame.motion ? frame.motion.offset + frame.motion.len : 0]))
      const ranges = fetchMock.mock.calls
        .filter(([input]) => String(input).endsWith(chunk.url))
        .map(([, init]) => new Headers(init?.headers).get('Range'))
      expect(ranges).toContain(`bytes=${chunk.header_len}-${chunk.header_len + finalOffset - 1}`)
    }

    fetchMock.mockClear()
    await Promise.all([...chunks].map(([chunk, indexes]) => client.getFrames(chunk, indexes)))
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
