import assert from 'node:assert/strict'
import { chromium, firefox } from '@playwright/test'
const origin = process.argv[2] ?? 'http://127.0.0.1:4409'
for (const [name, type] of Object.entries({ chromium, firefox })) {
  const browser = await type.launch()
  try {
    const page = await browser.newPage()
    await page.route(origin + '/', route => route.fulfill({ contentType: 'text/html', body: '<title>Bytecachecheck</title>' }))
    await page.goto(origin)
    const dbName = `bytecache-test-${Date.now()}`
    const first = await page.evaluate(async ({ origin, dbName }) => {
      const { RangeByteCache, immutableWeatherUrl } = await import(origin + '/src/core/range-byte-cache.ts')
      const cache = new RangeByteCache(dbName, 8, 2)
      const a = '/a-g0123456789abcdef.mrf', b = '/b-g0123456789abcdef.mrf'
      await cache.put(a, 10, 13, new Uint8Array([1, 2, 3, 4]))
      await cache.put(b, 0, 3, new Uint8Array([5, 6, 7, 8]))
      return {
        subrange: Array.from(await cache.get(a, 11, 12)),
        outside: await cache.get(a, 9, 12),
        otherGeneration: await cache.get('/a-gfedcba9876543210.mrf', 10, 13),
        immutable: immutableWeatherUrl('https://example.test' + a),
        mutable: immutableWeatherUrl('https://example.test/weather.mrf'),
        query: immutableWeatherUrl('https://example.test' + a + '?version=2'),
      }
    }, { origin, dbName })
    assert.deepEqual(first, { subrange: [2, 3], outside: undefined, otherGeneration: undefined, immutable: true, mutable: false, query: false })
    await page.reload()
    const second = await page.evaluate(async ({ origin, dbName }) => {
      const { RangeByteCache } = await import(origin + '/src/core/range-byte-cache.ts')
      const cache = new RangeByteCache(dbName, 8, 2)
      const a = '/a-g0123456789abcdef.mrf', b = '/b-g0123456789abcdef.mrf'
      const persisted = Array.from(await cache.get(a, 10, 13))
      await cache.put('/c', 0, 3, new Uint8Array([9, 10, 11, 12]))
      const evicted = await cache.get(a, 10, 13)
      await cache.put(b, 0, 3, new Uint8Array([13, 14, 15, 16]))
      await cache.put('/invalid', 0, 4, new Uint8Array([1]))
      await cache.put('/too-large', 0, 9, new Uint8Array(10))
      const overwritten = Array.from(await cache.get(b, 0, 3))
      const invalid = await cache.get('/invalid', 0, 4)
      const tooLarge = await cache.get('/too-large', 0, 9)
      const counts = await new Promise((resolve, reject) => {
        const opening = indexedDB.open(dbName)
        opening.onerror = () => reject(opening.error)
        opening.onsuccess = () => {
          const db = opening.result, tx = db.transaction(['state', 'entries', 'bytes'], 'readonly')
          const totals = tx.objectStore('state').get('totals')
          const entries = tx.objectStore('entries').count(), bytes = tx.objectStore('bytes').count()
          tx.oncomplete = () => { resolve({ totals: totals.result, entries: entries.result, bytes: bytes.result }); db.close() }
        }
      })
      Object.defineProperty(window, 'indexedDB', { value: undefined, configurable: true })
      const unavailable = new RangeByteCache('unavailable')
      await unavailable.put('/a', 0, 0, new Uint8Array([1]))
      const fallback = await unavailable.get('/a', 0, 0)
      return { persisted, evicted, overwritten, invalid, tooLarge, counts, fallback }
    }, { origin, dbName })
    assert.deepEqual(second, { persisted: [1, 2, 3, 4], evicted: undefined, overwritten: [13, 14, 15, 16], invalid: undefined, tooLarge: undefined, counts: { totals: { size: 8, count: 2 }, entries: 2, bytes: 2 }, fallback: undefined })
    console.log(name + ': persistence, subranges, generation isolation, eviction, replacement and storage fallback passed')
  } finally { await browser.close() }
}
