import { readFile } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Manifest } from './contract'
import { decodeFrame, LruCache, parseMrfHeader } from './mrf'

let file: Uint8Array
let headerLength: number

beforeAll(async () => {
  const manifest = JSON.parse(await readFile(resolve('public/data/manifest.json'), 'utf8')) as Manifest
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
})
