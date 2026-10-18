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
      return await readRange(db.transaction(['entries', 'bytes'], 'readonly'), url, start, end)
    } catch { return }
  }

  /** Gecomprimeerde mrf-members op inhoudshash (U93), gelezen in één transactie; ontbrekende hashes ontbreken in de map. */
  async getMembers(hashes: string[]): Promise<Map<string, Uint8Array>> {
    const found = new Map<string, Uint8Array>()
    if (!hashes.length) return found
    try {
      const db = await this.open()
      if (!db) return found
      const tx = db.transaction(['entries', 'bytes'], 'readonly')
      await Promise.all(hashes.map(async (hash) => {
        const bytes = await readRange(tx, memberUrl(hash))
        if (bytes) found.set(hash, bytes)
      }))
    } catch { /* Een gedeeltelijke vondst is nog steeds bruikbaar. */ }
    return found
  }

  async put(url: string, start: number, end: number, bytes: Uint8Array): Promise<void> {
    if (bytes.byteLength !== end - start + 1) return
    await this.write([{ url, start, end, bytes }])
  }

  async putMembers(members: Array<{ hash: string; bytes: Uint8Array }>): Promise<void> {
    await this.write(members.map(({ hash, bytes }) => ({ url: memberUrl(hash), start: 0, end: bytes.byteLength - 1, bytes })))
  }

  private async write(items: Array<{ url: string; start: number; end: number; bytes: Uint8Array }>): Promise<void> {
    const storable = items.filter((item) => item.bytes.byteLength > 0 && item.bytes.byteLength <= this.budget)
    if (!storable.length) return
    try {
      const db = await this.open()
      if (!db) return
      const tx = db.transaction(['entries', 'bytes', 'state'], 'readwrite')
      const done = new Promise<void>((resolve) => {
        tx.oncomplete = tx.onabort = tx.onerror = () => resolve()
      })
      const entries = tx.objectStore('entries'), data = tx.objectStore('bytes'), state = tx.objectStore('state')
      const totals = (await request(state.get('totals')) as { size: number; count: number } | undefined) ?? { size: 0, count: 0 }
      for (const { url, start, end, bytes } of storable) {
        const key = `${url}#${start}:${end}`
        const previous = await request(entries.get(key)) as Entry | undefined
        totals.size += bytes.byteLength - (previous?.size ?? 0)
        totals.count += previous ? 0 : 1
        entries.put({ key, url, start, end, size: bytes.byteLength, used: Date.now() } satisfies Entry)
        data.put(bytes, key)
      }
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

async function readRange(tx: IDBTransaction, url: string, start?: number, end?: number): Promise<Uint8Array | undefined> {
  const entries = await request(tx.objectStore('entries').index('url').getAll(url)) as Entry[]
  const entry = entries.find((item) => item.start <= (start ?? item.start) && item.end >= (end ?? item.end) && Date.now() - item.used < MAX_AGE)
  if (!entry) return
  const bytes = await request(tx.objectStore('bytes').get(entry.key)) as Uint8Array | undefined
  if (!bytes || bytes.byteLength !== entry.size) return
  return bytes.slice((start ?? entry.start) - entry.start, (end ?? entry.end) - entry.start + 1)
}

/** Members delen de entries-tabel met de URL-bereiken, zodat dezelfde opruimregels gelden. */
function memberUrl(hash: string): string {
  return `member:${hash}`
}

export function immutableWeatherUrl(url: string): boolean {
  return /\/[^/?#]+-g[0-9a-f]{16}\.mrf$/.test(url)
}

export const weatherBytes = new RangeByteCache()
