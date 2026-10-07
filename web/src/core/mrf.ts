import { decompress } from 'fzstd'
import { chunkField, type ManifestChunk, type MrfHeader } from './contract'
import { browserDeviceHints, decodeBudget } from './decode-budget'
import { DecodeCancelled, DecodeQueue, type DecodeCursor, type FrameTiming } from './decode-queue'
import { recordPerfPhase, type LoadLayer, type LoadTrace } from './perf'
import { decodePredFrame, PRED_VERSION, type PredFrameSpec } from './pred'

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
  if (header.pred && header.pred.v !== PRED_VERSION) throw new Error(`Niet-ondersteunde predictieve frames v${header.pred.v}`)
  if (header.frames.some((frame) => frame.motion && (!Number.isInteger(frame.motion.offset) || !Number.isInteger(frame.motion.len) || frame.motion.offset < 0 || frame.motion.len < 1))) throw new Error('Ongeldige motion-verwijzing')
}

export function decodeFrame(bytes: Uint8Array, expectedLength: number, pred?: PredFrameSpec): Uint8Array {
  const decoded = pred ? decodePredFrame(decompress(bytes), pred) : decompress(bytes)
  if (decoded.length !== expectedLength) throw new Error(`Frame heeft ${decoded.length} bytes; verwacht ${expectedLength}`)
  return decoded
}

function predSpec(header: MrfHeader): PredFrameSpec | undefined {
  return header.pred ? { width: header.grid.width, height: header.grid.height } : undefined
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

/** Komt als detail in de `frame-decode`-fase, zodat een opname laat zien wélk veld de workers bezet houdt. */
interface DecodeDetail { field: string; layer: LoadLayer }

interface DecodeJob {
  key: string
  compressed: Uint8Array
  expectedLength: number
  detail: DecodeDetail
  /** Wachttijd in de wachtrij, tot een worker het frame oppakte; komt bij het detail van de fase. */
  enqueuedAt: number
  waitMs?: number
  pred?: PredFrameSpec
  resolve: (frame: Uint8Array) => void
  reject: (error: Error) => void
}

/** Wie er nog op een wachtend frame wacht: zonder signaal blijvend, met signaal tot dat is afgebroken. */
interface FrameInterest {
  pinned: boolean
  signals: Set<AbortSignal>
}

interface WorkerReply { id: number; frame?: ArrayBuffer; error?: string; duration?: number }

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
    trace?: RangeTrace,
  ) {
    this.data = new Uint8Array(end - start)
    this.bytes = fetchRangeChunks(url, absoluteStart, absoluteEnd, priority, trace, (chunk) => {
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
  private readonly pending = new Map<number, { worker: number; job: DecodeJob }>()
  private readonly queue = new DecodeQueue<DecodeJob>()
  private readonly interest = new Map<string, FrameInterest>()
  private readonly chunkEpochs = new Map<string, number[]>()
  // Eén worker maakte zstd-decode de poort van het koude laden (U1-profiel:
  // alle bytes binnen op 3,3 s, laatste balk pas op 6,7 s).
  private readonly workers: Worker[]
  private readonly idleWorkers: number[]
  private requestId = 0
  onFrameDecoded?: (url: string, frameIndex: number, frame: Uint8Array) => void

  constructor(
    private readonly manifestUrl: URL,
    private readonly trace?: LoadTrace,
    workerCount = decodeBudget(browserDeviceHints()).workers,
  ) {
    this.workers = Array.from({ length: Math.max(1, workerCount) }, () => new Worker(new URL('./zstd.worker.ts', import.meta.url), { type: 'module' }))
    this.idleWorkers = this.workers.map((_, index) => index)
    for (const worker of this.workers) {
      worker.onmessage = ({ data }: MessageEvent<WorkerReply>) => {
        const request = this.pending.get(data.id)
        if (!request) return
        this.pending.delete(data.id)
        this.idleWorkers.push(request.worker)
        if (data.duration !== undefined) recordPerfPhase('frame-decode', data.duration, { codec: 'zstd/mrf', ...request.job.detail, waitMs: request.job.waitMs })
        if (data.error) request.job.reject(new Error(data.error)); else request.job.resolve(new Uint8Array(data.frame!))
        this.dispatch()
      }
    }
  }

  /** Waar de gebruiker in de tijd kijkt: de workers decoderen van daaruit naar buiten (decode-queue.ts). */
  setCursor(cursor: DecodeCursor): void {
    this.queue.setCursor(cursor)
  }

  getHeader(chunk: ManifestChunk): Promise<MrfHeader> {
    const url = new URL(chunk.url, this.manifestUrl).href
    let promise = this.headers.get(url)
    if (!promise) {
      promise = fetchRange(url, 0, chunk.header_len - 1, 'high', this.rangeTrace('header', [])).then((bytes) => {
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

  /**
   * Met een `signal` vervalt de vraag zodra dat is afgebroken: een frame dat dan nog op een worker
   * wacht en door niemand anders gevraagd is, wordt niet meer gedecodeerd (`DecodeCancelled`).
   */
  async getFrames(
    chunk: ManifestChunk,
    frameIndexes: number[],
    priority: FetchPriority = 'high',
    progress?: (frameIndex: number, frame: Uint8Array) => void,
    layer: LoadLayer = 'map',
    signal?: AbortSignal,
  ): Promise<Uint8Array[]> {
    const url = new URL(chunk.url, this.manifestUrl).href
    const header = await this.getHeader(chunk)
    const uniqueIndexes = [...new Set(frameIndexes)]
    for (const index of uniqueIndexes) if (!header.frames[index]) throw new Error('Frame-index buiten bereik')
    const missing = uniqueIndexes.filter((index) => {
      const key = frameKey(url, index)
      if (this.frames.get(key)) return false
      this.registerInterest(key, signal)
      return !this.framePromises.has(key)
    })

    if (missing.length >= 2) {
      const batch = this.fetchFrameSpan(url, chunk, header, missing, priority, layer)
      for (const [index, promise] of batch) this.trackFramePromise(frameKey(url, index), promise)
    } else {
      for (const index of missing) {
        const key = frameKey(url, index)
        this.trackFramePromise(key, this.fetchIndexedFrame(url, chunk, header, index, key, priority, layer))
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

  /**
   * The whole payload of a small chunk as one Range, without decoding. Later
   * getFrames reads from it; a few scattered frame Ranges on a tiny chunk come
   * back over the network on a warm reload, one covering Range does not.
   */
  async fetchPayload(chunk: ManifestChunk, priority: FetchPriority = 'low', layer: LoadLayer = 'L0'): Promise<void> {
    const url = new URL(chunk.url, this.manifestUrl).href
    const header = await this.getHeader(chunk)
    const end = Math.max(...header.frames.flatMap((frame) => [frame.offset + frame.len, frame.motion ? frame.motion.offset + frame.motion.len : 0]))
    await this.payload(url, chunk, 0, end, priority, layer, header.frames.map((_, index) => index)).bytes
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
          : await fetchRange(url, chunk.header_len + motion.offset, chunk.header_len + end - 1, 'high', this.rangeTrace('motion', [frameIndex]))
        const vectors = await this.decodeInWorker(motionKey(key), this.frameTiming(url, chunk, frameIndex, 'motion'), compressed, header.motion_grid!.bw * header.motion_grid!.bh * 2, { field: 'motion', layer: 'motion' })
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

  private async fetchIndexedFrame(url: string, chunk: ManifestChunk, header: MrfHeader, frameIndex: number, key: string, priority: FetchPriority, layer: LoadLayer): Promise<Uint8Array> {
    const frame = header.frames[frameIndex]!
    const start = chunk.header_len + frame.offset
    const payload = this.coveringPayload(url, frame.offset, frame.offset + frame.len)
    this.trace?.frame(url, frameIndex, layer)
    const compressed = payload
      ? await payload.read(frame.offset, frame.offset + frame.len)
      : await fetchRange(url, start, start + frame.len - 1, priority, this.rangeTrace(layer, [frameIndex]))
    this.trace?.frameBytesReady(url, frameIndex)
    const decoded = await this.decodeInWorker(key, this.frameTiming(url, chunk, frameIndex, chunkField(chunk)), compressed, header.grid.width * header.grid.height, { field: chunkField(chunk), layer }, predSpec(header))
    this.trace?.frameDecoded(url, frameIndex)
    this.frames.set(key, decoded)
    this.onFrameDecoded?.(url, frameIndex, decoded)
    return decoded
  }

  private fetchFrameSpan(
    url: string,
    chunk: ManifestChunk,
    header: MrfHeader,
    indexes: number[],
    priority: FetchPriority,
    layer: LoadLayer,
  ): Map<number, Promise<Uint8Array>> {
    // Bewust één omvattende span (incl. motion-annexen) en geen splitsing rond
    // al geladen frames: Chromium verliest gecachte Range-bytes bij aangrenzende,
    // apart geschreven Ranges, maar niet bij een omvattende (U1-probe).
    const selected = indexes.map((index) => header.frames[index]!)
    const fullChunk = indexes.length > header.frames.length / 2
    const start = fullChunk ? 0 : Math.min(...selected.flatMap((frame) => [frame.offset, frame.motion?.offset ?? frame.offset]))
    const end = fullChunk
      ? Math.max(...header.frames.flatMap((frame) => [frame.offset + frame.len, frame.motion ? frame.motion.offset + frame.motion.len : 0]))
      : Math.max(...selected.flatMap((frame) => [frame.offset + frame.len, frame.motion ? frame.motion.offset + frame.motion.len : 0]))
    const covered = header.frames.flatMap((frame, index) => frame.offset >= start && frame.offset + frame.len <= end ? [index] : [])
    const payload = this.payload(url, chunk, start, end, priority, layer, covered)
    for (const index of indexes) this.trace?.frame(url, index, layer)
    return new Map(indexes.map((index) => [index, (async () => {
      const frame = header.frames[index]!
      const compressed = await payload.read(frame.offset, frame.offset + frame.len)
      this.trace?.frameBytesReady(url, index)
      const decodedBytes = await this.decodeInWorker(frameKey(url, index), this.frameTiming(url, chunk, index, chunkField(chunk)), compressed, header.grid.width * header.grid.height, { field: chunkField(chunk), layer }, predSpec(header))
      this.trace?.frameDecoded(url, index)
      this.frames.set(frameKey(url, index), decodedBytes)
      this.onFrameDecoded?.(url, index, decodedBytes)
      return decodedBytes
    })()]))
  }

  private payload(url: string, chunk: ManifestChunk, start: number, end: number, priority: FetchPriority, layer: LoadLayer, frames: number[]): PayloadSpan {
    const covered = this.coveringPayload(url, start, end)
    if (covered) return covered
    const span = new PayloadSpan(start, end, url, chunk.header_len + start, chunk.header_len + end - 1, priority, this.rangeTrace(layer, frames))
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
    const clear = () => {
      if (this.framePromises.get(key) !== promise) return
      this.framePromises.delete(key)
      this.interest.delete(key)
    }
    void promise.then(clear, clear)
  }

  private registerInterest(key: string, signal: AbortSignal | undefined): void {
    let interest = this.interest.get(key)
    if (!interest) {
      interest = { pinned: false, signals: new Set() }
      this.interest.set(key, interest)
    }
    if (signal) interest.signals.add(signal); else interest.pinned = true
  }

  private stillWanted(key: string): boolean {
    const interest = this.interest.get(key)
    if (!interest || interest.pinned) return true
    for (const signal of interest.signals) if (!signal.aborted) return true
    return false
  }

  prefetch(chunk: ManifestChunk, indexes: number[], priority: FetchPriority = 'low'): void {
    void this.getFrames(chunk, indexes, priority, undefined, 'prefetch').catch(() => undefined)
  }

  private rangeTrace(layer: LoadLayer, frames: number[]): RangeTrace | undefined {
    const trace = this.trace
    return trace ? { trace, layer, frames } : undefined
  }

  prefetchMotion(chunk: ManifestChunk, indexes: number[]): void {
    for (const index of indexes) void this.getMotion(chunk, index).catch(() => undefined)
  }

  private frameTiming(url: string, chunk: ManifestChunk, frameIndex: number, field: string): FrameTiming {
    let epochs = this.chunkEpochs.get(url)
    if (!epochs) {
      epochs = chunk.times.map((time) => Date.parse(time))
      this.chunkEpochs.set(url, epochs)
    }
    const epoch = epochs[frameIndex] ?? Number.NaN
    const neighbours = [epochs[frameIndex - 1], epochs[frameIndex + 1]].filter((neighbour): neighbour is number => neighbour !== undefined)
    const stepMs = neighbours.length ? Math.min(...neighbours.map((neighbour) => Math.abs(neighbour - epoch))) : 0
    return { epoch, stepMs, field }
  }

  private decodeInWorker(key: string, timing: FrameTiming, compressed: Uint8Array, expectedLength: number, detail: DecodeDetail, pred?: PredFrameSpec): Promise<Uint8Array> {
    return new Promise((resolve, reject) => {
      this.queue.enqueue(timing, { key, compressed, expectedLength, detail, enqueuedAt: performance.now(), pred, resolve, reject })
      this.dispatch()
    })
  }

  // Eén decode per worker tegelijk; de rest wacht hier, zodat een frame dichter bij de cursor dat
  // later binnenkomt nog voor kan gaan en een afgebroken vraag de worker nooit bereikt.
  private dispatch(): void {
    while (this.idleWorkers.length) {
      const job = this.queue.take()
      if (!job) return
      if (!this.stillWanted(job.key)) {
        job.reject(new DecodeCancelled())
        continue
      }
      const worker = this.idleWorkers.pop()!
      job.waitMs = Math.round(performance.now() - job.enqueuedAt)
      const id = ++this.requestId
      this.pending.set(id, { worker, job })
      const bytes = job.compressed.byteOffset === 0 && job.compressed.byteLength === job.compressed.buffer.byteLength
        ? job.compressed.buffer
        : job.compressed.slice().buffer
      this.workers[worker]!.postMessage({ id, bytes, expectedLength: job.expectedLength, pred: job.pred }, [bytes])
    }
  }
}

interface RangeTrace {
  trace: LoadTrace
  layer: LoadLayer
  frames: number[]
}

function frameKey(url: string, index: number): string {
  return `${url}#${index}`
}

function motionKey(frame: string): string {
  return `motion:${frame}`
}

async function fetchRange(url: string, start: number, end: number, priority: FetchPriority = 'high', trace?: RangeTrace): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  await fetchRangeChunks(url, start, end, priority, trace, (chunk) => chunks.push(chunk.slice()))
  const bytes = new Uint8Array(end - start + 1)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length }
  return bytes
}

const rangeQueues = new Map<string, Promise<void>>()

// Eén Range tegelijk per chunk-URL: Chromium cachet een tweede, gelijktijdige
// Range op een bezette cache-entry niet, waarna die warm opnieuw overkomt.
function fetchRangeChunks(
  url: string,
  start: number,
  end: number,
  priority: FetchPriority,
  trace: RangeTrace | undefined,
  receive: (chunk: Uint8Array) => void,
): Promise<void> {
  const current = (rangeQueues.get(url) ?? Promise.resolve()).then(() => fetchTracedRange(url, start, end, priority, trace, receive))
  const settled = current.catch(() => undefined)
  rangeQueues.set(url, settled)
  void settled.then(() => { if (rangeQueues.get(url) === settled) rangeQueues.delete(url) })
  return current
}

async function fetchTracedRange(
  url: string,
  start: number,
  end: number,
  priority: FetchPriority,
  trace: RangeTrace | undefined,
  receive: (chunk: Uint8Array) => void,
): Promise<void> {
  const request = trace?.trace.request(url, [start, end], priority, trace.layer, trace.frames)
  try {
    await fetchRangeBody(url, start, end, priority, (chunk) => {
      if (request) trace!.trace.received(request, chunk.length)
      receive(chunk)
    }, () => { if (request) trace!.trace.response(request) })
    if (request) trace!.trace.finished(request)
  } catch (error) {
    if (request) trace!.trace.finished(request, error)
    throw error
  }
}

async function fetchRangeBody(
  url: string,
  start: number,
  end: number,
  priority: FetchPriority,
  receive: (chunk: Uint8Array) => void,
  responded: () => void,
): Promise<void> {
  const response = await fetch(url, { headers: { Range: `bytes=${start}-${end}` }, priority } as RequestInit & { priority: FetchPriority })
  responded()
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
