import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Manifest } from './contract'
import { decodeFrame, LruCache, parseMrfHeader } from './mrf'

let file: Uint8Array
let headerLength: number
let manifest: Manifest

beforeAll(async () => {
  manifest = JSON.parse(await readFile(resolve('public/data/manifest.json'), 'utf8')) as Manifest
  headerLength = manifest.chunks[0]!.header_len
  file = await readFile(resolve('public/data', manifest.chunks[0]!.url))
})

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
})
