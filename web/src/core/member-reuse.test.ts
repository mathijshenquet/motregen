import 'fake-indexeddb/auto'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { FrameIndex, Manifest, ManifestChunk, MrfHeader } from './contract'
import { decodeFrame, MrfClient, parseMrfHeader } from './mrf'
import type { PredFrameSpec } from './pred'
import { weatherBytes } from './range-byte-cache'

const roomy = { workers: 1, requests: 6, rangeBytes: Number.POSITIVE_INFINITY }
const generation = 'g00000000000000aa'
const files = new Map<string, Uint8Array>()
let source: MrfHeader
let members: Member[]

interface Member { frame: Uint8Array; motion?: Uint8Array; time: string }
interface ChunkPair { earlier: ManifestChunk; later: ManifestChunk }

/**
 * Zoals de ingest: frames, dan de motion-annexen, elke member met een hash. De client controleert
 * het hashalgoritme niet; `salt` geeft elk scenario eigen hashes, zodat IndexedDB per test leeg begint.
 */
function writeChunk(chunkMembers: Member[], salt: string): Uint8Array {
  const hash = (bytes: Uint8Array) => createHash('sha256').update(salt).update(bytes).digest('hex').slice(0, 32)
  let offset = 0
  const frames: FrameIndex[] = chunkMembers.map((member) => {
    const entry = { time: member.time, offset, len: member.frame.length, hash: hash(member.frame) }
    offset += member.frame.length
    return entry
  })
  chunkMembers.forEach((member, index) => {
    if (!member.motion) return
    frames[index]!.motion = { offset, len: member.motion.length, hash: hash(member.motion) }
    offset += member.motion.length
  })
  const json = new TextEncoder().encode(JSON.stringify({ ...source, frames }))
  const chunk = new Uint8Array(8 + json.length + offset)
  chunk.set(new TextEncoder().encode('mrf0'))
  new DataView(chunk.buffer).setUint32(4, json.length, true)
  chunk.set(json, 8)
  let position = 8 + json.length
  for (const member of chunkMembers) { chunk.set(member.frame, position); position += member.frame.length }
  for (const member of chunkMembers) if (member.motion) { chunk.set(member.motion, position); position += member.motion.length }
  return chunk
}

function manifestChunk(name: string, bytes: Uint8Array): ManifestChunk {
  const headerLength = 8 + new DataView(bytes.buffer).getUint32(4, true)
  const header = parseMrfHeader(bytes.subarray(0, headerLength))
  files.set(name, bytes)
  return { url: name, source: 'rtcor', field: 'rain_rate', run: header.run, header_len: headerLength, times: header.frames.map((frame) => frame.time) }
}

/** Twee radarchunks vijf minuten na elkaar: het oudste frame valt weg, er komt er één bij, het nieuwe eerste frame verliest zijn annex. */
function chunkPair(salt: string): ChunkPair {
  const withoutFirstAnnex = (member: Member, index: number) => index === 0 ? { ...member, motion: undefined } : member
  return {
    earlier: manifestChunk(`chunks/rtcor-${salt}-1155-h3-${generation}.mrf`, writeChunk(members.slice(0, -1).map(withoutFirstAnnex), salt)),
    later: manifestChunk(`chunks/rtcor-${salt}-1200-h3-${generation}.mrf`, writeChunk(members.slice(1).map(withoutFirstAnnex), salt)),
  }
}

function headerOf(chunk: ManifestChunk): MrfHeader {
  return parseMrfHeader(files.get(chunk.url)!.subarray(0, chunk.header_len))
}

function memberHashes(chunk: ManifestChunk): string[] {
  return headerOf(chunk).frames.flatMap((frame) => [frame.hash!, ...(frame.motion ? [frame.motion.hash!] : [])])
}

beforeAll(async () => {
  const manifest = JSON.parse(await readFile(resolve('public/data/manifest.json'), 'utf8')) as Manifest
  const original = manifest.chunks[0]!
  const bytes = new Uint8Array(await readFile(resolve('public/data', original.url)))
  source = parseMrfHeader(bytes.subarray(0, original.header_len))
  const payload = bytes.subarray(original.header_len)
  members = source.frames.map((frame) => ({
    time: frame.time,
    frame: payload.slice(frame.offset, frame.offset + frame.len),
    motion: frame.motion && payload.slice(frame.motion.offset, frame.motion.offset + frame.motion.len),
  }))
})

afterEach(() => vi.unstubAllGlobals())

function stubNetwork() {
  class DecodeWorker {
    onmessage?: (event: MessageEvent) => void
    postMessage(message: { id: number; bytes: ArrayBuffer; expectedLength: number; pred?: PredFrameSpec }): void {
      const frame = decodeFrame(new Uint8Array(message.bytes), message.expectedLength, message.pred)
      queueMicrotask(() => this.onmessage?.({ data: { id: message.id, frame: frame.slice().buffer } } as MessageEvent))
    }
  }
  vi.stubGlobal('Worker', DecodeWorker)
  const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const bytes = files.get(new URL(String(input)).pathname.replace('/data/', ''))!
    const match = /^bytes=(\d+)-(\d+)$/.exec(new Headers(init?.headers).get('Range')!)!
    return new Response(Uint8Array.from(bytes.subarray(Number(match[1]), Number(match[2]) + 1)).buffer, {
      status: 206,
      headers: { 'Content-Range': `bytes ${match[1]}-${match[2]}/${bytes.length}`, 'Cache-Control': 'public, max-age=31536000, immutable' },
    })
  })
  vi.stubGlobal('fetch', fetchMock)
  const ranges = () => fetchMock.mock.calls.map(([input, init]) => `${String(input).split('/').at(-1)} ${new Headers(init?.headers).get('Range')}`)
  return { fetchMock, ranges }
}

const newClient = () => new MrfClient(new URL('https://example.test/data/manifest.json'), undefined, roomy)
const allFrames = (chunk: ManifestChunk) => chunk.times.map((_, index) => index)
const rangeOf = (chunk: ManifestChunk, member: { offset: number; len: number }) =>
  `${chunk.url.split('/').at(-1)} bytes=${chunk.header_len + member.offset}-${chunk.header_len + member.offset + member.len - 1}`
const headerRange = (chunk: ManifestChunk) => `${chunk.url.split('/').at(-1)} bytes=0-${chunk.header_len - 1}`

async function allStored(hashes: string[]): Promise<void> {
  await vi.waitFor(async () => expect((await weatherBytes.getMembers(hashes)).size).toBe(hashes.length))
}

describe('frames op inhoudshash (U93)', () => {
  it('een hernoemde chunk hergebruikt frames op hash, ook uit IndexedDB', async () => {
    const { earlier, later } = chunkPair('reuse')
    const { fetchMock, ranges } = stubNetwork()
    const newest = headerOf(later).frames.at(-1)!

    const open = newClient()
    const earlierFrames = await open.getFrames(earlier, allFrames(earlier))
    await allStored(memberHashes(earlier))

    // Koude start na heropenen: een nieuwe client vindt de gedeelde frames en annexen in IndexedDB.
    fetchMock.mockClear()
    const reopened = newClient()
    const reopenedFrames = await reopened.getFrames(later, allFrames(later))
    const motions = await Promise.all(allFrames(later).map((index) => reopened.getMotion(later, index)))
    expect(motions.filter(Boolean)).toHaveLength(later.times.length - 1)
    expect(ranges()).toEqual([headerRange(later), rangeOf(later, newest), rangeOf(later, newest.motion!)])
    for (let index = 0; index < reopenedFrames.length - 1; index++) expect(reopenedFrames[index]).toEqual(earlierFrames[index + 1])

    // Terwijl de app openstaat: de gedeelde frames zijn dezelfde gedecodeerde objecten.
    fetchMock.mockClear()
    const laterFrames = await open.getFrames(later, allFrames(later))
    for (let index = 0; index < laterFrames.length - 1; index++) expect(laterFrames[index]).toBe(earlierFrames[index + 1])
    expect(laterFrames.at(-1)).toEqual(reopenedFrames.at(-1))
  })

  it('haalt ontbrekende frames op zonder de aanwezige ertussen mee te nemen', async () => {
    const { earlier } = chunkPair('gaps')
    const { fetchMock, ranges } = stubNetwork()
    const client = newClient()
    await client.getFrames(earlier, [2, 3, 4])
    fetchMock.mockClear()
    await client.getFrames(earlier, [0, 1, 2, 3, 4, 5, 6])
    const frames = headerOf(earlier).frames
    const span = (first: number, last: number) => rangeOf(earlier, { offset: frames[first]!.offset, len: frames[last]!.offset + frames[last]!.len - frames[first]!.offset })
    const annexStart = Math.min(...frames.flatMap((frame) => frame.motion ? [frame.motion.offset] : []))
    const frameRanges = ranges().filter((range) => Number(/bytes=(\d+)/.exec(range)![1]) - earlier.header_len < annexStart)
    expect(frameRanges.sort()).toEqual([span(0, 1), span(5, 6)].sort())
  })
})
