import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import type { Manifest } from './contract'
import { decodeFrame, parseMrfHeader } from './mrf'
import { buildWindTimeline, zipWindFrame } from './wind'

let manifest: Manifest

beforeAll(async () => {
  manifest = JSON.parse(await readFile(resolve('public/data/manifest.json'), 'utf8')) as Manifest
})

describe('wind field pairing', () => {
  it('publishes synthetic U/V chunks with identical grids and frame ordering', async () => {
    const uChunk = manifest.chunks.find((chunk) => chunk.field === 'wind_u_ms')!
    const vChunk = manifest.chunks.find((chunk) => chunk.field === 'wind_v_ms')!
    expect(uChunk.times).toEqual(vChunk.times)
    expect(uChunk.run).toBe(vChunk.run)
    const [uFile, vFile] = await Promise.all([
      readFile(resolve('public/data', uChunk.url)),
      readFile(resolve('public/data', vChunk.url)),
    ])
    const uHeader = parseMrfHeader(uFile.subarray(0, uChunk.header_len))
    const vHeader = parseMrfHeader(vFile.subarray(0, vChunk.header_len))
    expect(uHeader.grid).toEqual(vHeader.grid)
    expect(uHeader.frames.map((frame) => frame.time)).toEqual(vHeader.frames.map((frame) => frame.time))
    expect(buildWindTimeline(manifest)).toHaveLength(24)

    const uIndex = uHeader.frames[0]!
    const vIndex = vHeader.frames[0]!
    const vectors = zipWindFrame(
      decodeFrame(uFile.subarray(uChunk.header_len + uIndex.offset, uChunk.header_len + uIndex.offset + uIndex.len), uHeader.grid.width * uHeader.grid.height),
      decodeFrame(vFile.subarray(vChunk.header_len + vIndex.offset, vChunk.header_len + vIndex.offset + vIndex.len), vHeader.grid.width * vHeader.grid.height),
      uHeader,
      vHeader,
    )
    const speeds = Array.from({ length: vectors.length / 2 }, (_, index) => Math.hypot(vectors[index * 2]!, vectors[index * 2 + 1]!))
    expect(Math.min(...speeds)).toBeGreaterThan(1)
    expect(Math.max(...speeds)).toBeGreaterThan(8)
  })

  it('hides wind when only one component is present', () => {
    expect(buildWindTimeline({ ...manifest, chunks: manifest.chunks.filter((chunk) => chunk.field !== 'wind_v_ms') })).toEqual([])
  })
})
