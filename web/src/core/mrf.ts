import { decompress } from 'fzstd'
import type { ManifestChunk, MrfHeader } from './contract'

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
  if (header.quant.length !== 256 || header.quant[0] !== 0 || header.quant[255] !== null) throw new Error('Ongeldige kwantisatietabel')
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
  private readonly frames = new LruCache<string, Uint8Array>(32)
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
    const url = new URL(chunk.url, this.manifestUrl).href
    const key = `${url}#${frameIndex}`
    const cached = this.frames.get(key)
    if (cached) return cached
    const pending = this.framePromises.get(key)
    if (pending) return pending
    const request = this.fetchFrame(url, chunk, frameIndex, key)
    this.framePromises.set(key, request)
    try { return await request } finally { this.framePromises.delete(key) }
  }

  private async fetchFrame(url: string, chunk: ManifestChunk, frameIndex: number, key: string): Promise<Uint8Array> {
    const header = await this.getHeader(chunk), frame = header.frames[frameIndex]
    if (!frame) throw new Error('Frame-index buiten bereik')
    const start = chunk.header_len + frame.offset
    const compressed = await fetchRange(url, start, start + frame.len - 1)
    const decoded = await this.decodeInWorker(compressed, header.grid.width * header.grid.height)
    this.frames.set(key, decoded)
    return decoded
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

async function fetchRange(url: string, start: number, end: number): Promise<Uint8Array> {
  const response = await fetch(url, { headers: { Range: `bytes=${start}-${end}` } })
  if (!response.ok) throw new Error(`Laden mislukt (${response.status})`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  return response.status === 206 ? bytes : bytes.subarray(start, end + 1)
}
