import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import { ZstdCodec } from 'zstd-codec'
import type { Field, Manifest, MrfHeader } from './contract'
import { decodeFrame, LruCache, MrfClient, parseMrfHeader } from './mrf'
import { encodePredFrame, type PredFrameSpec } from './pred'
import { buildTimeline } from './time-model'

let file: Uint8Array
let headerLength: number
let manifest: Manifest
const files = new Map<string, Uint8Array>()
// Ruim apparaat: één omvattende Range per chunk, zoals de tests hieronder tellen.
const roomy = { workers: 1, requests: 6, rangeBytes: Number.POSITIVE_INFINITY }
const everyField = new Set(['rain_rate', 'motion'])
const intentAt = (cursorEpoch: number, window = { start: cursorEpoch - 8 * 3_600_000, end: cursorEpoch + 8 * 3_600_000 }) =>
  ({ cursorEpoch, window, playback: 0 as const, scrubVelocity: 0, fields: everyField })

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
      postMessage(message: { id: number; bytes: ArrayBuffer; expectedLength: number; pred?: PredFrameSpec }): void {
        const frame = decodeFrame(new Uint8Array(message.bytes), message.expectedLength, message.pred)
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
    const client = new MrfClient(new URL('https://example.test/data/manifest.json'), undefined, roomy)
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
    expect(chunk?.times).toHaveLength(49)
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

  it('emits a visible nowcast-to-seamless boundary whose first frame borrows the next annex', () => {
    const timeline = buildTimeline(manifest)
    const boundary = timeline.findIndex((frame, index) => frame.source === 'seamless' && timeline[index - 1]?.source === 'nowcast')
    const first = timeline[boundary]!
    const chunkFile = files.get(first.chunk.url)!
    const header = parseMrfHeader(chunkFile.subarray(0, first.chunk.header_len))

    expect(first.frameIndex).toBe(0)
    expect(header.frames[0]?.motion).toBeUndefined()
    expect(header.frames[1]?.motion).toBeDefined()
  })

  it('coalesces a full location sample per chunk and serves the next location entirely from cache', async () => {
    class DecodeWorker {
      onmessage?: (event: MessageEvent) => void
      postMessage(message: { id: number; bytes: ArrayBuffer; expectedLength: number; pred?: PredFrameSpec }): void {
        const frame = decodeFrame(new Uint8Array(message.bytes), message.expectedLength, message.pred)
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
    const client = new MrfClient(new URL('https://example.test/data/manifest.json'), undefined, roomy)
    const frames = [...buildTimeline(manifest), ...buildTimeline(manifest, 'radiation'), ...buildTimeline(manifest, 'uv')]
    const chunks = new Map(frames.map((frame) => [frame.chunk, [] as number[]]))
    for (const frame of frames) chunks.get(frame.chunk)!.push(frame.frameIndex)

    await client.getHeader(manifest.chunks[0]!)
    fetchMock.mockClear()
    await Promise.all([...chunks].map(([chunk, indexes]) => client.getFrames(chunk, indexes)))

    expect(frames).toHaveLength(207)
    expect(fetchMock).toHaveBeenCalledTimes(19)
    for (const [chunk, indexes] of chunks) {
      const chunkFile = files.get(chunk.url)!
      const header = parseMrfHeader(chunkFile.subarray(0, chunk.header_len))
      const selected = indexes.map((index) => header.frames[index]!)
      const fullChunk = indexes.length > header.frames.length / 2
      const firstOffset = fullChunk ? 0 : Math.min(...selected.flatMap((frame) => [frame.offset, frame.motion?.offset ?? frame.offset]))
      const finalOffset = fullChunk
        ? Math.max(...header.frames.flatMap((frame) => [frame.offset + frame.len, frame.motion ? frame.motion.offset + frame.motion.len : 0]))
        : Math.max(...selected.flatMap((frame) => [frame.offset + frame.len, frame.motion ? frame.motion.offset + frame.motion.len : 0]))
      const ranges = fetchMock.mock.calls
        .filter(([input]) => String(input).endsWith(chunk.url))
        .map(([, init]) => new Headers(init?.headers).get('Range'))
      expect(ranges).toContain(`bytes=${chunk.header_len + firstOffset}-${chunk.header_len + finalOffset - 1}`)
    }

    fetchMock.mockClear()
    await Promise.all([...chunks].map(([chunk, indexes]) => client.getFrames(chunk, indexes)))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reuses decoded frames when a refreshed manifest recreates an unchanged chunk', async () => {
    class DecodeWorker {
      onmessage?: (event: MessageEvent) => void
      postMessage(message: { id: number; bytes: ArrayBuffer; expectedLength: number; pred?: PredFrameSpec }): void {
        const frame = decodeFrame(new Uint8Array(message.bytes), message.expectedLength, message.pred)
        queueMicrotask(() => this.onmessage?.({ data: { id: message.id, frame: frame.slice().buffer } } as MessageEvent))
      }
    }
    vi.stubGlobal('Worker', DecodeWorker)
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input))
      const bytes = files.get(url.pathname.replace('/data/', ''))!
      const match = /^(?:bytes=)(\d+)-(\d+)$/.exec(new Headers(init?.headers).get('Range')!)!
      return new Response(Uint8Array.from(bytes.subarray(Number(match[1]), Number(match[2]) + 1)).buffer, { status: 206 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const client = new MrfClient(new URL('https://example.test/data/manifest.json'), undefined, roomy)
    const original = manifest.chunks[0]!
    const decoded = await client.getFrame(original, 3)
    const refreshed = { ...original, times: [...original.times] }
    fetchMock.mockClear()

    expect(await client.getFrame(refreshed, 3)).toBe(decoded)
    expect(await client.getHeader(refreshed)).toBe(await client.getHeader(original))
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('fills a series in many incremental steps while one coalesced range is still streaming', async () => {
    class DecodeWorker {
      onmessage?: (event: MessageEvent) => void
      postMessage(message: { id: number; bytes: ArrayBuffer; expectedLength: number; pred?: PredFrameSpec }): void {
        const frame = decodeFrame(new Uint8Array(message.bytes), message.expectedLength, message.pred)
        queueMicrotask(() => this.onmessage?.({ data: { id: message.id, frame: frame.slice().buffer } } as MessageEvent))
      }
    }
    vi.stubGlobal('Worker', DecodeWorker)
    let streamPayload = false
    let deliveredParts = 0
    const partCount = 10
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(String(input))
      const bytes = files.get(url.pathname.replace('/data/', ''))!
      const match = /^bytes=(\d+)-(\d+)$/.exec(new Headers(init?.headers).get('Range')!)!
      const selected = Uint8Array.from(bytes.subarray(Number(match[1]), Number(match[2]) + 1))
      if (!streamPayload) return new Response(selected.buffer, { status: 206 })
      const partLength = Math.ceil(selected.length / partCount)
      let offset = 0
      return new Response(new ReadableStream<Uint8Array>({
        async pull(controller) {
          await new Promise((resolve) => setTimeout(resolve, 1))
          if (offset >= selected.length) { controller.close(); return }
          const next = Math.min(selected.length, offset + partLength)
          controller.enqueue(selected.slice(offset, next))
          offset = next
          deliveredParts++
        },
      }), { status: 206 })
    })
    vi.stubGlobal('fetch', fetchMock)
    const chunk = manifest.chunks.find((candidate) => candidate.source === 'nowcast')!
    const client = new MrfClient(new URL('https://example.test/data/manifest.json'), undefined, roomy)
    const header = await client.getHeader(chunk)
    fetchMock.mockClear()
    streamPayload = true
    const indexes = header.frames.map((_, index) => index)
    const loaded = new Set<number>()
    const steps: Array<{ loaded: number; deliveredParts: number }> = []

    await client.getFrames(chunk, indexes, 'low', (index) => {
      loaded.add(index)
      steps.push({ loaded: loaded.size, deliveredParts })
    })

    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(new Set(steps.map((step) => step.loaded)).size).toBeGreaterThan(5)
    expect(steps.some((step) => step.loaded < indexes.length && step.deliveredParts < partCount)).toBe(true)
    expect(loaded.size).toBe(indexes.length)
  })

  it('reports every decoded frame, whichever consumer requested it', async () => {
    class DecodeWorker {
      onmessage?: (event: MessageEvent) => void
      postMessage(message: { id: number; bytes: ArrayBuffer; expectedLength: number; pred?: PredFrameSpec }): void {
        const frame = decodeFrame(new Uint8Array(message.bytes), message.expectedLength, message.pred)
        queueMicrotask(() => this.onmessage?.({ data: { id: message.id, frame: frame.slice().buffer } } as MessageEvent))
      }
    }
    vi.stubGlobal('Worker', DecodeWorker)
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const bytes = files.get(new URL(String(input)).pathname.replace('/data/', ''))!
      const match = /^bytes=(\d+)-(\d+)$/.exec(new Headers(init?.headers).get('Range')!)!
      return new Response(Uint8Array.from(bytes.subarray(Number(match[1]), Number(match[2]) + 1)).buffer, { status: 206 })
    })
    const client = new MrfClient(new URL('https://example.test/data/manifest.json'), undefined, roomy)
    const decoded: string[] = []
    client.onFrameDecoded = (url, frameIndex) => decoded.push(`${url.split('/').at(-1)}#${frameIndex}`)
    const chunk = manifest.chunks[0]!

    await client.getFrame(chunk, 0)
    await client.getFrames(chunk, [1, 2], 'low')
    await client.getFrame(chunk, 0)

    expect(decoded).toEqual([`${chunk.url.split('/').at(-1)}#0`, `${chunk.url.split('/').at(-1)}#1`, `${chunk.url.split('/').at(-1)}#2`])
  })

  it('serves predictive feels_like_c frames byte-identical to the bitmap for every point (tabel en kaart)', async () => {
    class DecodeWorker {
      onmessage?: (event: MessageEvent) => void
      postMessage(message: { id: number; bytes: ArrayBuffer; expectedLength: number; pred?: PredFrameSpec }): void {
        const frame = decodeFrame(new Uint8Array(message.bytes), message.expectedLength, message.pred)
        queueMicrotask(() => this.onmessage?.({ data: { id: message.id, frame: frame.slice().buffer } } as MessageEvent))
      }
    }
    vi.stubGlobal('Worker', DecodeWorker)
    const zstd = await new Promise<{ compress(data: Uint8Array, level?: number): Uint8Array }>((done) => ZstdCodec.run((codec) => done(new codec.Simple())))
    // Bitmapbron: het synthetische temp_c-dagdeel (zelfde grid en tabel als gevoel); dezelfde cellen als pred-chunk.
    const bitmapChunk = manifest.chunks.find((chunk) => chunk.field === 'temp_c')!
    const bitmapFile = files.get(bitmapChunk.url)!
    const bitmapHeader = parseMrfHeader(bitmapFile.subarray(0, bitmapChunk.header_len))
    const cells = bitmapHeader.frames.map((frame) => decodeFrame(
      bitmapFile.subarray(bitmapChunk.header_len + frame.offset, bitmapChunk.header_len + frame.offset + frame.len),
      bitmapHeader.grid.width * bitmapHeader.grid.height,
    ))
    cells[0]!.fill(255, 0, bitmapHeader.grid.width * 2)
    cells[1]![777] = 0
    cells[1]![778] = 254
    const members = cells.map((frame) => zstd.compress(encodePredFrame(frame, bitmapHeader.grid.width), 3))
    let offset = 0
    const predHeader: MrfHeader = {
      ...bitmapHeader,
      field: 'feels_like_c',
      pred: { v: 1 },
      frames: bitmapHeader.frames.map((frame, index) => {
        const entry = { time: frame.time, offset, len: members[index]!.length }
        offset += entry.len
        return entry
      }),
    }
    const json = new TextEncoder().encode(JSON.stringify(predHeader))
    const predFile = new Uint8Array(8 + json.length + offset)
    predFile.set(new TextEncoder().encode('mrf0'))
    new DataView(predFile.buffer).setUint32(4, json.length, true)
    predFile.set(json, 8)
    members.reduce((at, member) => { predFile.set(member, at); return at + member.length }, 8 + json.length)
    const predChunk = { ...bitmapChunk, url: 'chunks/feels-pred.mrf', field: 'feels_like_c' as const, header_len: 8 + json.length }
    const served = new Map([[predChunk.url, predFile]])
    vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
      const bytes = served.get(new URL(String(input)).pathname.replace('/data/', ''))!
      const match = /^bytes=(\d+)-(\d+)$/.exec(new Headers(init?.headers).get('Range') ?? '')
      return match
        ? new Response(Uint8Array.from(bytes.subarray(Number(match[1]), Number(match[2]) + 1)).buffer, { status: 206 })
        : new Response(Uint8Array.from(bytes).buffer, { status: 200 })
    })
    const client = new MrfClient(new URL('https://example.test/data/manifest.json'), undefined, roomy)
    const indexes = predHeader.frames.map((_, index) => index)
    const frames = await Promise.all(indexes.map((index) => client.getFrame(predChunk, index)))

    expect(predFile.length).toBeLessThan(bitmapFile.length)
    frames.forEach((frame, index) => expect(frame).toEqual(cells[index]))
    for (const cell of [0, 777, 778, 12_345, cells[0]!.length - 1]) {
      expect(frames.map((frame) => frame[cell])).toEqual(cells.map((frame) => frame[cell]))
    }
  })

  describe('decode order and cancellation (U49)', () => {
    /** Eén worker die pas antwoordt als de test dat zegt, zodat de wachtrij zich kan vullen. */
    function stubHeldWorker(): { decodeOrder: number[]; releaseNext: () => void } {
      const decodeOrder: number[] = []
      const held: Array<() => void> = []
      class HeldWorker {
        onmessage?: (event: MessageEvent) => void
        postMessage(message: { id: number; bytes: ArrayBuffer; expectedLength: number; pred?: PredFrameSpec }): void {
          const frame = decodeFrame(new Uint8Array(message.bytes), message.expectedLength, message.pred)
          decodeOrder.push(frameIdentity.get(createHash('sha256').update(frame).digest('hex'))!)
          held.push(() => this.onmessage?.({ data: { id: message.id, frame: frame.slice().buffer } } as MessageEvent))
        }
      }
      vi.stubGlobal('Worker', HeldWorker)
      vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
        const bytes = files.get(new URL(String(input)).pathname.replace('/data/', ''))!
        const match = /^bytes=(\d+)-(\d+)$/.exec(new Headers(init?.headers).get('Range')!)!
        return new Response(Uint8Array.from(bytes.subarray(Number(match[1]), Number(match[2]) + 1)).buffer, { status: 206 })
      })
      return { decodeOrder, releaseNext: () => held.shift()!() }
    }

    const frameIdentity = new Map<string, number>()
    beforeAll(() => {
      const header = parseMrfHeader(file.subarray(0, headerLength))
      for (const [index, frame] of header.frames.entries()) {
        const decoded = decodeFrame(file.subarray(headerLength + frame.offset, headerLength + frame.offset + frame.len), header.grid.width * header.grid.height)
        frameIdentity.set(createHash('sha256').update(decoded).digest('hex'), index)
      }
    })

    const settle = () => new Promise((done) => setTimeout(done, 0))

    it('leaves a render turn between worker batches and uses the new cursor for the next decode', async () => {
      const worker = stubHeldWorker()
      const frames: FrameRequestCallback[] = []
      vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frames.push(callback); return frames.length })
      const client = new MrfClient(new URL('https://example.test/data/manifest.json'), undefined, { ...roomy, workers: 1 })
      const chunk = manifest.chunks[0]!
      const epochOf = (index: number) => Date.parse(chunk.times[index]!)
      client.setIntent(intentAt(epochOf(0)))
      const loading = client.getFrames(chunk, [0, 1, 2])
      await settle()
      worker.releaseNext()
      await settle()
      expect(worker.decodeOrder).toEqual([0])
      client.setIntent(intentAt(epochOf(2)))
      frames.shift()!(0)
      expect(worker.decodeOrder).toEqual([0, 2])
      worker.releaseNext()
      await settle()
      frames.shift()!(16)
      worker.releaseNext()
      await loading
      expect(worker.decodeOrder).toEqual([0, 2, 1])
    })

    it('decodes outward from the cursor, whoever asked first, and follows a cursor jump (U52)', async () => {
      const worker = stubHeldWorker()
      const client = new MrfClient(new URL('https://example.test/data/manifest.json'), undefined, { ...roomy, workers: 1 })
      const chunk = manifest.chunks[0]!
      const epochOf = (frameIndex: number) => Date.parse(chunk.times[frameIndex]!)

      client.setIntent(intentAt(epochOf(6)))
      const background = client.getFrames(chunk, [0, 1, 2, 3], 'low', undefined, 'prefetch')
      await settle()
      const series = client.getFrames(chunk, [4, 5, 6, 7, 8], 'high', undefined, 'L0')
      await settle()
      for (let reply = 0; reply < 4; reply++) { worker.releaseNext(); await settle() }
      client.setIntent(intentAt(epochOf(0)))
      for (let reply = 0; reply < 5; reply++) { worker.releaseNext(); await settle() }
      await Promise.all([background, series])

      // Frame 0 was al onderweg toen de rest binnenkwam. Daarna van de cursor (6) naar buiten: 5, 6 en
      // 7 liggen binnen één framestap, dan 4. Na de sprong naar frame 0 gaat 1 (en 2) voor 3 en 8.
      expect(worker.decodeOrder).toEqual([0, 5, 6, 7, 4, 1, 2, 3, 8])
    })

    it('skips a queued decode once every requester has aborted, but not one somebody still wants', async () => {
      const worker = stubHeldWorker()
      const client = new MrfClient(new URL('https://example.test/data/manifest.json'), undefined, { ...roomy, workers: 1 })
      const chunk = manifest.chunks[0]!
      const view = new AbortController()

      const windowed = client.getFrames(chunk, [0, 1, 2, 3], 'low', undefined, 'L1', view.signal)
      const outcome = windowed.then(() => 'geladen', (error: Error) => error.name)
      await settle()
      const keeper = client.getFrames(chunk, [2], 'low', undefined, 'prefetch')
      await settle()
      view.abort()
      for (let reply = 0; reply < 2; reply++) { worker.releaseNext(); await settle() }
      await keeper

      expect(worker.decodeOrder).toEqual([0, 2])
      expect(await outcome).toBe('DecodeCancelled')
      expect(client.getCachedFrame(chunk, 1)).toBeUndefined()

      // Een afgebroken frame is niet verloren: een nieuwe vraag decodeert het alsnog.
      const retry = client.getFrame(chunk, 1)
      await settle()
      worker.releaseNext()
      expect((await retry).length).toBeGreaterThan(0)
      expect(worker.decodeOrder).toEqual([0, 2, 1])
    })

    it('fetches a constrained device\'s frames in pieces, nearest to the cursor first (MIP-20)', async () => {
      const ranges: string[] = []
      const releases: Array<() => void> = []
      class InstantWorker {
        onmessage?: (event: MessageEvent) => void
        postMessage(message: { id: number; bytes: ArrayBuffer; expectedLength: number; pred?: PredFrameSpec }): void {
          const frame = decodeFrame(new Uint8Array(message.bytes), message.expectedLength, message.pred)
          queueMicrotask(() => this.onmessage?.({ data: { id: message.id, frame: frame.slice().buffer } } as MessageEvent))
        }
      }
      vi.stubGlobal('Worker', InstantWorker)
      vi.stubGlobal('fetch', async (input: string | URL | Request, init?: RequestInit) => {
        const bytes = files.get(new URL(String(input)).pathname.replace('/data/', ''))!
        const range = new Headers(init?.headers).get('Range')!
        const match = /^bytes=(\d+)-(\d+)$/.exec(range)!
        if (Number(match[1]) >= headerLength) {
          ranges.push(range)
          await new Promise<void>((release) => releases.push(release))
        }
        return new Response(Uint8Array.from(bytes.subarray(Number(match[1]), Number(match[2]) + 1)).buffer, { status: 206 })
      })
      const chunk = manifest.chunks[0]!
      const header = parseMrfHeader(file.subarray(0, headerLength))
      const frameRange = (index: number) =>
        `bytes=${headerLength + header.frames[index]!.offset}-${headerLength + header.frames[index]!.offset + header.frames[index]!.len - 1}`
      // Eén byte per stuk: elk frame wordt zijn eigen Range (een stuk heeft minstens één frame).
      const client = new MrfClient(new URL('https://example.test/data/manifest.json'), undefined, { workers: 1, requests: 1, rangeBytes: 1 })
      client.setIntent(intentAt(Date.parse(chunk.times[7]!)))

      const loaded = client.getFrames(chunk, [0, 1, 2, 3, 4, 5, 6, 7], 'low', undefined, 'L1')
      let settled = false
      void loaded.finally(() => { settled = true })
      while (!settled) {
        await settle()
        expect(releases.length).toBeLessThanOrEqual(1)
        releases.shift()?.()
      }
      expect((await loaded).length).toBe(8)

      // Eén request tegelijk, en de frames naast de cursor (6 en 7, binnen één framestap) gaan
      // voor het begin van het bestand, ook al staan ze daar achteraan.
      const frameRanges = ranges.filter((range) => [0, 1, 2, 3, 4, 5, 6, 7].some((index) => range === frameRange(index)))
      expect(frameRanges).toEqual([6, 7, 5, 4, 3, 2, 1, 0].map(frameRange))
    })
  })
})
