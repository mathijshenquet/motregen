interface Entry {
  key: string
  url: string
  start: number
  end: number
  size: number
  used: number
}

const MAX_AGE = 7 * 24 * 60 * 60 * 1000
const request = <T>(value: IDBRequest<T>) => new Promise<T>((resolve, reject) => {
  value.onsuccess = () => resolve(value.result)
  value.onerror = () => reject(value.error)
})

export class RangeByteCache {
  private database?: Promise<IDBDatabase | undefined>

  constructor(private readonly name = 'motregen-weather-bytes-v1', private readonly budget = 48 * 1024 * 1024, private readonly limit = 512) {}

  private open(): Promise<IDBDatabase | undefined> {
    return this.database ??= new Promise((resolve) => {
      if (typeof indexedDB === 'undefined') { resolve(undefined); return }
      let settled = false
      const finish = (db?: IDBDatabase) => {
        if (settled) { db?.close(); return }
        settled = true
        clearTimeout(timer)
        resolve(db)
      }
      const timer = setTimeout(() => finish(), 250)
      try {
        const opening = indexedDB.open(this.name, 1)
        opening.onupgradeneeded = () => {
          const entries = opening.result.createObjectStore('entries', { keyPath: 'key' })
          entries.createIndex('url', 'url')
          entries.createIndex('used', 'used')
          opening.result.createObjectStore('bytes')
          opening.result.createObjectStore('state')
        }
        opening.onsuccess = () => {
          opening.result.onversionchange = () => opening.result.close()
          finish(opening.result)
        }
        opening.onerror = opening.onblocked = () => finish()
      } catch { finish() }
    })
  }

  async get(url: string, start: number, end: number): Promise<Uint8Array | undefined> {
    try {
      const db = await this.open()
      if (!db) return
      const tx = db.transaction(['entries', 'bytes'], 'readonly')
      const entries = await request(tx.objectStore('entries').index('url').getAll(url)) as Entry[]
      const entry = entries.find((item) => item.start <= start && item.end >= end && Date.now() - item.used < MAX_AGE)
      if (!entry) return
      const bytes = await request(tx.objectStore('bytes').get(entry.key)) as Uint8Array | undefined
      if (!bytes || bytes.byteLength !== entry.size) return
      return bytes.slice(start - entry.start, end - entry.start + 1)
    } catch { return }
  }

  async put(url: string, start: number, end: number, bytes: Uint8Array): Promise<void> {
    if (bytes.byteLength !== end - start + 1 || bytes.byteLength > this.budget) return
    try {
      const db = await this.open()
      if (!db) return
      const tx = db.transaction(['entries', 'bytes', 'state'], 'readwrite')
      const done = new Promise<void>((resolve) => {
        tx.oncomplete = tx.onabort = tx.onerror = () => resolve()
      })
      const entries = tx.objectStore('entries'), data = tx.objectStore('bytes'), state = tx.objectStore('state')
      const key = `${url}#${start}:${end}`
      const totals = (await request(state.get('totals')) as { size: number; count: number } | undefined) ?? { size: 0, count: 0 }
      const previous = await request(entries.get(key)) as Entry | undefined
      totals.size += bytes.byteLength - (previous?.size ?? 0)
      totals.count += previous ? 0 : 1
      entries.put({ key, url, start, end, size: bytes.byteLength, used: Date.now() } satisfies Entry)
      data.put(bytes, key)
      // Metadata stays separate: eviction never reads all cached weather bytes into memory.
      const cursor = entries.index('used').openCursor()
      cursor.onsuccess = () => {
        const row = cursor.result
        if (row && (totals.size > this.budget || totals.count > this.limit || Date.now() - (row.value as Entry).used >= MAX_AGE)) {
          const entry = row.value as Entry
          totals.size -= entry.size
          totals.count--
          row.delete()
          data.delete(entry.key)
          row.continue()
        } else state.put(totals, 'totals')
      }
      await done
    } catch { /* Storage is optional; quota/privacy failures must not stop the map. */ }
  }
}

export function immutableWeatherUrl(url: string): boolean {
  return /\/[^/?#]+-g[0-9a-f]{16}\.mrf$/.test(url)
}

export const weatherBytes = new RangeByteCache()
