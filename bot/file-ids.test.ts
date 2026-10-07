import { mkdtemp, readFile, rm, utimes, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FileIdCache, STILL_CACHE_TTL } from './file-ids.js'
import { StillRenderer, type RenderedStill } from './render.js'
import { cacheKey, type StillManifest, type StillSelection } from './stills.js'

const manifest: StillManifest = { version: 0, generated: '2026-10-07T12:00:00Z', now: '2026-10-07T12:00:00Z', chunks: [] }
let directory: string

async function fixture(selection: StillSelection, generation = manifest): Promise<RenderedStill> {
  const key = cacheKey(selection, generation)
  const path = join(directory, `${key}.jpg`)
  await writeFile(path, 'jpeg')
  return { key, path, url: `https://motregen.nl/telegram/stills/${key}.jpg`, epoch: Date.parse(generation.now), caption: 'test', milliseconds: 0, cached: true }
}

beforeEach(async () => { directory = await mkdtemp(join(tmpdir(), 'motregen-file-ids-')) })
afterEach(async () => { vi.restoreAllMocks(); await rm(directory, { recursive: true, force: true }) })

describe('Telegram file ids', () => {
  it('persists the largest photo only, reloads it, and isolates bots and manifest generations', async () => {
    const still = await fixture({ mode: 'weather', hour: 0 })
    const cache = new FileIdCache('motregen_bot')
    expect(await cache.get(still)).toBeUndefined()
    await cache.remember(still, { message_id: 12, chat: { id: 99, type: 'private' }, photo: [{ file_id: 'thumb' }, { file_id: 'largest' }] })
    expect(await cache.get(still)).toBe('largest')
    expect(await new FileIdCache('motregen_bot').get(still)).toBe('largest')
    expect(await new FileIdCache('another_bot').get(still)).toBeUndefined()
    const record = JSON.parse(await readFile(`${still.path}.file-id.json`, 'utf8'))
    expect(record).toEqual({ bot: 'motregen_bot', key: still.key, fileId: 'largest' })
    for (const other of [
      await fixture({ mode: 'air', hour: 0 }),
      await fixture({ mode: 'weather', hour: 3 }),
      await fixture({ mode: 'weather', hour: 0 }, { ...manifest, generated: '2026-10-07T12:05:00Z' }),
      await fixture({ mode: 'weather', hour: 0 }, { ...manifest, now: '2026-10-07T12:05:00Z' }),
    ]) expect(await cache.get(other)).toBeUndefined()
  })

  it('expires both memory and disk entries with the JPEG and prunes the sidecar', async () => {
    const still = await fixture({ mode: 'weather', hour: 0 })
    const cache = new FileIdCache('motregen_bot')
    await cache.remember(still, { message_id: 1, chat: { id: 99, type: 'private' }, photo: [{ file_id: 'photo' }] })
    const future = Date.now() + STILL_CACHE_TTL + 1000
    vi.spyOn(Date, 'now').mockReturnValue(future)
    expect(await cache.get(still)).toBeUndefined()
    expect(await new FileIdCache('motregen_bot').get(still)).toBeUndefined()
    await new StillRenderer('https://motregen.nl', directory).prune(future)
    await expect(readFile(still.path)).rejects.toThrow()
    await expect(readFile(`${still.path}.file-id.json`)).rejects.toThrow()
  })

  it('treats a missing, mismatched or corrupt sidecar and an inline true response as cache misses', async () => {
    const still = await fixture({ mode: 'weather', hour: 0 })
    const cache = new FileIdCache('motregen_bot')
    await cache.remember(still, true)
    expect(await cache.get(still)).toBeUndefined()
    for (const content of ['bad json', JSON.stringify({ bot: 'motregen_bot', key: 'wrong', fileId: 'photo' })]) {
      await writeFile(`${still.path}.file-id.json`, content)
      expect(await cache.get(still)).toBeUndefined()
    }
    const expired = new Date(Date.now() - STILL_CACHE_TTL - 1000)
    await utimes(still.path, expired, expired)
    await cache.remember(still, { message_id: 1, chat: { id: 99, type: 'private' }, photo: [{ file_id: 'photo' }] })
    expect(await cache.get(still)).toBeUndefined()
  })
})
