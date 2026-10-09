import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it, vi } from 'vitest'
import { NativeMaps } from './native-map.js'

it('captures a missing map plate when cached PNGs are read from file paths', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'motregen-map-cache-'))
  const context = vi.fn(async () => { throw new Error('Browser requested for missing plate') })
  vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ version: 8, sources: {}, layers: [] }))))
  try {
    const maps = new NativeMaps('https://fixture.test', directory, context)
    await expect(maps.get('light', { crs: 'EPSG:3857', x0: 0, y0: 0, dx: 1, dy: -1, width: 2, height: 2 })).rejects.toThrow('Browser requested for missing plate')
    expect(context).toHaveBeenCalledOnce()
  } finally {
    vi.unstubAllGlobals()
    await rm(directory, { recursive: true, force: true })
  }
})
