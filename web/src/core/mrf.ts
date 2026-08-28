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

export class MrfClient {
  private readonly headers = new Map<string, Promise<MrfHeader>>()
  private readonly frames = new LruCache<string, Uint8Array>(256)
  private readonly framePromises = new Map<string, Promise<Uint8Array>>()
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
      promise = fetchRange(url, 0, chunk.header_len - 1).then(parseMrfHeader)
      this.headers.set(url, promise)
    }
    return promise
  }

  async getFrame(chunk: ManifestChunk, frameIndex: number): Promise<Uint8Array> {
    return (await this.getFrames(chunk, [frameIndex]))[0]!
  }

  async getFrames(chunk: ManifestChunk, frameIndexes: number[]): Promise<Uint8Array[]> {
    const url = new URL(chunk.url, this.manifestUrl).href
    const header = await this.getHeader(chunk)
    const uniqueIndexes = [...new Set(frameIndexes)]
    for (const index of uniqueIndexes) if (!header.frames[index]) throw new Error('Frame-index buiten bereik')
    const missing = uniqueIndexes.filter((index) => {
      const key = frameKey(url, index)
      return !this.frames.get(key) && !this.framePromises.has(key)
    })

    if (missing.length && (uniqueIndexes.length > header.frames.length / 2 || uniqueIndexes.length >= 12)) {
      const batch = this.fetchChunkPayload(url, chunk, header, missing)
      for (const index of missing) this.trackFramePromise(frameKey(url, index), batch.then((frames) => frames.get(index)!))
    } else {
      for (const index of missing) {
        const key = frameKey(url, index)
        this.trackFramePromise(key, this.fetchIndexedFrame(url, chunk, header, index, key))
      }
    }

    return Promise.all(frameIndexes.map((index) => {
      const key = frameKey(url, index)
      const cached = this.frames.get(key)
      if (cached) return cached
      return this.framePromises.get(key)!
    }))
  }

  private async fetchIndexedFrame(url: string, chunk: ManifestChunk, header: MrfHeader, frameIndex: number, key: string): Promise<Uint8Array> {
    const frame = header.frames[frameIndex]!
    const start = chunk.header_len + frame.offset
    const compressed = await fetchRange(url, start, start + frame.len - 1)
    const decoded = await this.decodeInWorker(compressed, header.grid.width * header.grid.height)
    this.frames.set(key, decoded)
    return decoded
  }

  private async fetchChunkPayload(
    url: string,
    chunk: ManifestChunk,
    header: MrfHeader,
    indexes: number[],
  ): Promise<Map<number, Uint8Array>> {
    const finalFrame = header.frames.at(-1)!
    const payload = await fetchRange(url, chunk.header_len, chunk.header_len + finalFrame.offset + finalFrame.len - 1)
    const decoded = await Promise.all(indexes.map(async (index) => {
      const frame = header.frames[index]!
      const compressed = payload.slice(frame.offset, frame.offset + frame.len)
      const bytes = await this.decodeInWorker(compressed, header.grid.width * header.grid.height)
      this.frames.set(frameKey(url, index), bytes)
      return [index, bytes] as const
    }))
    return new Map(decoded)
  }

  private trackFramePromise(key: string, promise: Promise<Uint8Array>): void {
    this.framePromises.set(key, promise)
    const clear = () => { if (this.framePromises.get(key) === promise) this.framePromises.delete(key) }
    void promise.then(clear, clear)
  }

  prefetch(chunk: ManifestChunk, indexes: number[]): void {
    for (const index of indexes) void this.getFrame(chunk, index).catch(() => undefined)
  }

  private decodeInWorker(compressed: Uint8Array, expectedLength: number): Promise<Uint8Array> {
    const id = ++this.requestId
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.worker.postMessage({ id, bytes: compressed.buffer, expectedLength }, [compressed.buffer])
    })
  }
}

function frameKey(url: string, index: number): string {
  return `${url}#${index}`
}

async function fetchRange(url: string, start: number, end: number): Promise<Uint8Array> {
  const response = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } })
  if (!response.ok) throw new Error(`Laden mislukt (${response.status})`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  return response.status === 206 ? bytes : bytes.subarray(start, end + 1)
}
