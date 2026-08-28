import { describe, expect, it } from 'vitest'
import type { MrfHeader } from './contract'
import { temperatureLabels } from './temperature'

describe('temperature labels', () => {
  it('interpolates values in time and omits cities outside the field grid', () => {
    const quant: Array<number | null> = Array.from({ length: 255 }, (_, index) => index - 100)
    quant.push(null)
    const header = {
      version: 0,
      field: 'feels_like_c',
      grid: { crs: 'EPSG:3857', x0: 300_000, y0: 7_200_000, dx: 20_000, dy: -20_000, width: 30, height: 40 },
      quant,
      source: 'harmonie',
      run: '2026-08-28T12:00:00Z',
      frames: [],
      dict: null,
    } satisfies MrfHeader
    const size = header.grid.width * header.grid.height
    const labels = temperatureLabels(new Uint8Array(size).fill(110), new Uint8Array(size).fill(114), header, header, 0.25)
    expect(labels.features.length).toBeGreaterThan(5)
    expect(labels.features[0]!.properties.label).toBe('11°')
  })
})
