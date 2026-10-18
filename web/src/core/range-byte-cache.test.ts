import 'fake-indexeddb/auto'
import { describe, expect, it } from 'vitest'
import { RangeByteCache } from './range-byte-cache'

const bytes = (length: number, fill: number) => new Uint8Array(length).fill(fill)

describe('RangeByteCache', () => {
  it('serves a sub-range of a cached URL range', async () => {
    const cache = new RangeByteCache('range-subrange')
    await cache.put('https://example.test/a-g0000000000000000.mrf', 100, 109, Uint8Array.from({ length: 10 }, (_, index) => index))
    expect(await cache.get('https://example.test/a-g0000000000000000.mrf', 102, 104)).toEqual(Uint8Array.from([2, 3, 4]))
    expect(await cache.get('https://example.test/a-g0000000000000000.mrf', 99, 104)).toBeUndefined()
  })

  it('stores members under their hash, apart from URL ranges', async () => {
    const cache = new RangeByteCache('range-members')
    await cache.putMembers([{ hash: 'aa'.repeat(16), bytes: bytes(3, 1) }, { hash: 'bb'.repeat(16), bytes: bytes(5, 2) }])
    const found = await cache.getMembers(['aa'.repeat(16), 'bb'.repeat(16), 'cc'.repeat(16)])
    expect([...found.keys()]).toEqual(['aa'.repeat(16), 'bb'.repeat(16)])
    expect(found.get('bb'.repeat(16))).toEqual(bytes(5, 2))
  })

  it('evicts members and URL ranges by the same count and byte limits, oldest first', async () => {
    const cache = new RangeByteCache('range-eviction', 10, 3)
    await cache.put('https://example.test/a-g0000000000000000.mrf', 0, 3, bytes(4, 1))
    await cache.putMembers([{ hash: '01'.repeat(16), bytes: bytes(2, 2) }])
    await cache.putMembers([{ hash: '02'.repeat(16), bytes: bytes(2, 3) }, { hash: '03'.repeat(16), bytes: bytes(2, 4) }])
    expect(await cache.get('https://example.test/a-g0000000000000000.mrf', 0, 3)).toBeUndefined()
    expect((await cache.getMembers(['01'.repeat(16), '02'.repeat(16), '03'.repeat(16)])).size).toBe(3)

    await cache.putMembers([{ hash: '04'.repeat(16), bytes: bytes(7, 5) }])
    const left = await cache.getMembers(['01'.repeat(16), '02'.repeat(16), '03'.repeat(16), '04'.repeat(16)])
    expect([...left.keys()]).toEqual(['03'.repeat(16), '04'.repeat(16)])
  })
})
