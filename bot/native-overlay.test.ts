import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { BrowserContext } from 'playwright'
import { expect, it, vi } from 'vitest'
import { NativeOverlay } from './native-overlay.js'

it('awaits asset capture and propagates failures when no clock glyphs are requested', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'motregen-overlay-assets-'))
  const failure = new Error('Fixture browser unavailable')
  const context = vi.fn<() => Promise<BrowserContext>>().mockRejectedValue(failure)
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('<html></html>')))
  try {
    const overlay = new NativeOverlay('https://fixture.test', directory, context)
    await expect(overlay.prepare({ version: 0, generated: '2026-10-07T12:00:00Z', now: '2026-10-07T12:00:00Z', chunks: [] }, [])).rejects.toBe(failure)
    expect(context).toHaveBeenCalledTimes(1)
  } finally {
    vi.unstubAllGlobals()
    await rm(directory, { recursive: true, force: true })
  }
})
