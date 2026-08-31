import { decompress } from 'fzstd'
import { chunkField, type ManifestChunk, type MrfHeader } from './contract'

const decoder = new TextDecoder()

export function parseMrfHeader(bytes: Uint8Array): MrfHeader {
  if (bytes.length < 8 || decoder.decode(bytes.subarray(0, 4)) !== 'mrf0') throw new Error('Ongeldige mrf-magic')
  const jsonLength = new DataView(bytes.buffer, bytes.byteOffset + 4, 4).getUint32(0, true)
  if (bytes.length !== jsonLength + 8) throw new Error('Onvolledige mrf-header')
  const header = JSON.parse(decoder.decode(bytes.subarray(8))) as MrfHeader
  validateHeader(header)
  return header
}

function validateHeader(header: MrfHeader): void {
  if (header.version !== 0 || header.grid.crs !== 'EPSG:3857') throw new Error('Niet-ondersteunde mrf-versie of projectie')
  const field = chunkField(header)
  const zeroBased = field === 'rain_rate' || field === 'radiation'
  if (header.quant.length !== 256 || header.quant[255] !== null || (zeroBased && header.quant[0] !== 0)) throw new Error('Ongeldige kwantisatietabel')
  if (header.dict !== null || header.grid.width < 1 || header.grid.height < 1) throw new Error('Ongeldige mrf-header')
  if (header.motion_grid && (!Number.isInteger(header.motion_grid.bw) || !Number.isInteger(header.motion_grid.bh) || header.motion_grid.bw < 1 || header.motion_grid.bh < 1)) throw new Error('Ongeldig motion-grid')
  if (!header.motion_grid && header.frames.some((frame) => frame.motion)) throw new Error('Motion-annex zonder motion-grid')
  if (header.frames.some((frame) => frame.motion && (!Number.isInteger(frame.motion.offset) || !Number.isInteger(frame.motion.len) || frame.motion.offset < 0 || frame.motion.len < 1))) throw new Error('Ongeldige motion-verwijzing')
}

export function decodeFrame(bytes: Uint8Array, expectedLength: number): Uint8Array {
  const decoded = decompress(bytes)
  if (decoded.length !== expectedLength) throw new Error(`Frame heeft ${decoded.length} bytes; verwacht ${expectedLength}`)
  return decoded
}

export class LruCache<K, V> {
  private readonly entries = new Map<K, V>()
  constructor(private readonly capacity: number) {}
  get(key: K): V | undefined {
    const value = this.entries.get(key)
    if (value !== undefined) { this.entries.delete(key); this.entries.set(key, value) }
    return value
  }
  set(key: K, value: V): void {
    this.entries.delete(key)
    this.entries.set(key, value)
    while (this.entries.size > this.capacity) this.entries.delete(this.entries.keys().next().value!)
  }
}

interface WorkerReply { id: number; frame?: ArrayBuffer; error?: string }

export interface MotionField {
  width: number
  height: number
  vectors: Uint8Array
}

type FetchPriority = 'high' | 'low' | 'auto'

interface PayloadWaiter {
  start: number
  end: number
  resolve: (bytes: Uint8Array) => void
  reject: (error: Error) => void
}

class PayloadSpan {
  readonly bytes: Promise<Uint8Array>
  private readonly data: Uint8Array
  private readonly waiters = new Set<PayloadWaiter>()
  private available = 0
  private failure?: Error

  constructor(
    readonly start: number,
    readonly end: number,
    url: string,
    absoluteStart: number,
    absoluteEnd: number,
    priority: FetchPriority,
  ) {
    this.data = new Uint8Array(end - start)
    this.bytes = fetchRangeChunks(url, absoluteStart, absoluteEnd, priority, (chunk) => {
      this.data.set(chunk, this.available)
      this.available += chunk.length
      this.releaseReady()
    }).then(() => this.data, (reason: unknown) => {
      const error = reason instanceof Error ? reason : new Error(String(reason))
      this.failure = error
      for (const waiter of this.waiters) waiter.reject(error)
      this.waiters.clear()
      throw error
    })
  }

  read(start: number, end: number): Promise<Uint8Array> {
    const relativeStart = start - this.start
    const relativeEnd = end - this.start
    if (relativeStart < 0 || relativeEnd > this.data.length || relativeStart >= relativeEnd) {
      return Promise.reject(new Error('Payloadbereik buiten geladen span'))
    }
    if (this.failure) return Promise.reject(this.failure)
    if (relativeEnd <= this.available) return Promise.resolve(this.data.slice(relativeStart, relativeEnd))
    return new Promise((resolve, reject) => {
      this.waiters.add({ start: relativeStart, end: relativeEnd, resolve, reject })
    })
  }

  private releaseReady(): void {
    for (const waiter of this.waiters) {
      if (waiter.end > this.available) continue
      this.waiters.delete(waiter)
      waiter.resolve(this.data.slice(waiter.start, waiter.end))
    }
  }
}

export class MrfClient {
  private readonly headers = new Map<string, Promise<MrfHeader>>()
  private readonly resolvedHeaders = new Map<string, MrfHeader>()
  private readonly frames = new LruCache<string, Uint8Array>(512)
  private readonly framePromises = new Map<string, Promise<Uint8Array>>()
  private readonly motions = new LruCache<string, MotionField>(256)
  private readonly motionPromises = new Map<string, Promise<MotionField>>()
  private readonly payloads = new Map<string, PayloadSpan[]>()
  private readonly pending = new Map<number, { resolve: (frame: Uint8Array) => void; reject: (error: Error) => void }>()
  private readonly worker = new Worker(new URL('./zstd.worker.ts', import.meta.url), { type: 'module' })
  private requestId = 0

  constructor(private readonly manifestUrl: URL) {
    this.worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
      const request = this.pending.get(data.id)
      if (!request) return
      this.pending.delete(data.id)
      if (data.error) request.reject(new Error(data.error)); else request.resolve(new Uint8Array(data.frame!))
    }
  }

  getHeader(chunk: ManifestChunk): Promise<MrfHeader> {
    const url = new URL(chunk.url, this.manifestUrl).href
    let promise = this.headers.get(url)
    if (!promise) {
      promise = fetchRange(url, 0, chunk.header_len - 1).then((bytes) => {
        const header = parseMrfHeader(bytes)
        this.resolvedHeaders.set(url, header)
        return header
      })
      this.headers.set(url, promise)
    }
    return promise
  }

  getCachedHeader(chunk: ManifestChunk): MrfHeader | undefined {
    return this.resolvedHeaders.get(new URL(chunk.url, this.manifestUrl).href)
  }

  getCachedFrame(chunk: ManifestChunk, frameIndex: number): Uint8Array | undefined {
    return this.frames.get(frameKey(new URL(chunk.url, this.manifestUrl).href, frameIndex))
  }

  async getFrame(chunk: ManifestChunk, frameIndex: number, priority: FetchPriority = 'high'): Promise<Uint8Array> {
    return (await this.getFrames(chunk, [frameIndex], priority))[0]!
  }

  async getFrames(
    chunk: ManifestChunk,
    frameIndexes: number[],
    priority: FetchPriority = 'high',
    progress?: (frameIndex: number, frame: Uint8Array) => void,
  ): Promise<Uint8Array[]> {
    const url = new URL(chunk.url, this.manifestUrl).href
    const header = await this.getHeader(chunk)
    const uniqueIndexes = [...new Set(frameIndexes)]
    for (const index of uniqueIndexes) if (!header.frames[index]) throw new Error('Frame-index buiten bereik')
    const missing = uniqueIndexes.filter((index) => {
      const key = frameKey(url, index)
      return !this.frames.get(key) && !this.framePromises.has(key)
    })

    if (missing.length >= 2) {
      const batch = this.fetchFrameSpan(url, chunk, header, missing, priority)
      for (const [index, promise] of batch) this.trackFramePromise(frameKey(url, index), promise)
    } else {
      for (const index of missing) {
        const key = frameKey(url, index)
        this.trackFramePromise(key, this.fetchIndexedFrame(url, chunk, header, index, key, priority))
      }
    }

    return Promise.all(frameIndexes.map(async (index) => {
      const key = frameKey(url, index)
      const cached = this.frames.get(key)
      const frame = cached ?? await this.framePromises.get(key)!
      progress?.(index, frame)
      return frame
    }))
  }

  async getMotion(chunk: ManifestChunk, frameIndex: number): Promise<MotionField | undefined> {
    const url = new URL(chunk.url, this.manifestUrl).href
    const header = await this.getHeader(chunk)
    const motion = header.frames[frameIndex]?.motion
    if (!motion || !header.motion_grid) return undefined
    const key = frameKey(url, frameIndex)
    const cached = this.motions.get(key)
    if (cached) return cached
    let pending = this.motionPromises.get(key)
    if (!pending) {
      pending = (async () => {
        const end = motion.offset + motion.len
        const payload = this.coveringPayload(url, motion.offset, end)
        const compressed = payload
          ? await payload.read(motion.offset, end)
          : await fetchRange(url, chunk.header_len + motion.offset, chunk.header_len + end - 1)
        const vectors = await this.decodeInWorker(compressed, header.motion_grid!.bw * header.motion_grid!.bh * 2)
        const field = { width: header.motion_grid!.bw, height: header.motion_grid!.bh, vectors }
        this.motions.set(key, field)
        return field
      })()
      this.motionPromises.set(key, pending)
      const clear = () => { if (this.motionPromises.get(key) === pending) this.motionPromises.delete(key) }
      void pending.then(clear, clear)
    }
    return pending
  }

  private async fetchIndexedFrame(url: string, chunk: ManifestChunk, header: MrfHeader, frameIndex: number, key: string, priority: FetchPriority): Promise<Uint8Array> {
    const frame = header.frames[frameIndex]!
    const start = chunk.header_len + frame.offset
    const payload = this.coveringPayload(url, frame.offset, frame.offset + frame.len)
    const compressed = payload
      ? await payload.read(frame.offset, frame.offset + frame.len)
      : await fetchRange(url, start, start + frame.len - 1, priority)
    const decoded = await this.decodeInWorker(compressed, header.grid.width * header.grid.height)
    this.frames.set(key, decoded)
    return decoded
  }

  private fetchFrameSpan(
    url: string,
    chunk: ManifestChunk,
    header: MrfHeader,
    indexes: number[],
    priority: FetchPriority,
  ): Map<number, Promise<Uint8Array>> {
    const selected = indexes.map((index) => header.frames[index]!)
    const fullChunk = indexes.length > header.frames.length / 2
    const start = fullChunk ? 0 : Math.min(...selected.flatMap((frame) => [frame.offset, frame.motion?.offset ?? frame.offset]))
    const end = fullChunk
      ? Math.max(...header.frames.flatMap((frame) => [frame.offset + frame.len, frame.motion ? frame.motion.offset + frame.motion.len : 0]))
      : Math.max(...selected.flatMap((frame) => [frame.offset + frame.len, frame.motion ? frame.motion.offset + frame.motion.len : 0]))
    const payload = this.payload(url, chunk, start, end, priority)
    return new Map(indexes.map((index) => [index, (async () => {
      const frame = header.frames[index]!
      const compressed = await payload.read(frame.offset, frame.offset + frame.len)
      const decodedBytes = await this.decodeInWorker(compressed, header.grid.width * header.grid.height)
      this.frames.set(frameKey(url, index), decodedBytes)
      return decodedBytes
    })()]))
  }

  private payload(url: string, chunk: ManifestChunk, start: number, end: number, priority: FetchPriority): PayloadSpan {
    const covered = this.coveringPayload(url, start, end)
    if (covered) return covered
    const span = new PayloadSpan(start, end, url, chunk.header_len + start, chunk.header_len + end - 1, priority)
    const spans = this.payloads.get(url) ?? []
    spans.push(span)
    this.payloads.set(url, spans)
    void span.bytes.catch(() => {
      const current = this.payloads.get(url)
      if (!current) return
      const remaining = current.filter((candidate) => candidate !== span)
      if (remaining.length) this.payloads.set(url, remaining); else this.payloads.delete(url)
    })
    return span
  }

  private coveringPayload(url: string, start: number, end: number): PayloadSpan | undefined {
    return this.payloads.get(url)?.find((span) => span.start <= start && span.end >= end)
  }

  private trackFramePromise(key: string, promise: Promise<Uint8Array>): void {
    this.framePromises.set(key, promise)
    const clear = () => { if (this.framePromises.get(key) === promise) this.framePromises.delete(key) }
    void promise.then(clear, clear)
  }

  prefetch(chunk: ManifestChunk, indexes: number[], priority: FetchPriority = 'low'): void {
    void this.getFrames(chunk, indexes, priority).catch(() => undefined)
  }

  prefetchMotion(chunk: ManifestChunk, indexes: number[]): void {
    for (const index of indexes) void this.getMotion(chunk, index).catch(() => undefined)
  }

  private decodeInWorker(compressed: Uint8Array, expectedLength: number): Promise<Uint8Array> {
    const id = ++this.requestId
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      const bytes = compressed.byteOffset === 0 && compressed.byteLength === compressed.buffer.byteLength
        ? compressed.buffer
        : compressed.slice().buffer
      this.worker.postMessage({ id, bytes, expectedLength }, [bytes])
    })
  }
}

function frameKey(url: string, index: number): string {
  return `${url}#${index}`
}

async function fetchRange(url: string, start: number, end: number, priority: FetchPriority = 'high'): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  await fetchRangeChunks(url, start, end, priority, (chunk) => chunks.push(chunk.slice()))
  const bytes = new Uint8Array(end - start + 1)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return bytes
}

async function fetchRangeChunks(
  url: string,
  start: number,
  end: number,
  priority: FetchPriority,
  receive: (chunk: Uint8Array) => void,
): Promise<void> {
  const response = await fetch(url, { headers: { Range: `bytes=${start}-${end}` }, priority } as RequestInit & { priority: FetchPriority })
  if (!response.ok) throw new Error(`Laden mislukt (${response.status})`)
  const wantedLength = end - start + 1
  const sourceStart = response.status === 206 ? 0 : start
  const sourceEnd = sourceStart + wantedLength
  let sourceOffset = 0
  let received = 0

  if (!response.body) {
    const bytes = new Uint8Array(await response.arrayBuffer())
    const selected = bytes.subarray(sourceStart, sourceEnd)
    receive(selected)
    received = selected.length
  } else {
    const reader = response.body.getReader()
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      const chunkStart = sourceOffset
      const chunkEnd = sourceOffset + value.length
      const overlapStart = Math.max(chunkStart, sourceStart)
      const overlapEnd = Math.min(chunkEnd, sourceEnd)
      if (overlapStart < overlapEnd) {
        const selected = value.subarray(overlapStart - chunkStart, overlapEnd - chunkStart)
        receive(selected)
        received += selected.length
      }
      sourceOffset = chunkEnd
    }
  }
  if (received !== wantedLength) throw new Error(`Onvolledig bereik (${received}/${wantedLength} bytes)`)
}
