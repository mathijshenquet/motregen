import { describe, expect, it } from 'vitest'
import type { MrfHeader } from './contract'
import { TEMPERATURE_VARIABLE_ANCHORS, temperatureLabels, temperatureLayer } from './temperature'

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

  it.each(['light', 'dark'] as const)('dodges basemap names at every zoom in %s mode', (theme) => {
    const layer = temperatureLayer(theme)
    expect(layer.minzoom).toBeUndefined()
    expect(layer.maxzoom).toBeUndefined()
    expect(layer.layout).toMatchObject({
      'text-size': ['interpolate', ['linear'], ['zoom'], 5, 11, 8, 14],
      'text-variable-anchor': [...TEMPERATURE_VARIABLE_ANCHORS],
      'text-radial-offset': 1.15,
      'text-allow-overlap': false,
      'text-ignore-placement': false,
      'text-optional': true,
    })
    expect(layer.paint?.['text-color']).toBe(theme === 'dark' ? '#f3fbfd' : '#102630')
  })
})
