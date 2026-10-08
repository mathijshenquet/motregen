import { readFileSync } from 'node:fs'
import type { StyleSpecification } from 'maplibre-gl'
import { describe, expect, it } from 'vitest'
import { mapStartSource, mapStartStyle } from './map-start'

describe('progressieve z4-kaart', () => {
  for (const theme of ['licht', 'donker']) {
    it(`${theme}: behoudt de originele kleuren, opacity en laagvolgorde`, () => {
      const full = JSON.parse(readFileSync(`public/basemap/${theme}.json`, 'utf8')) as StyleSpecification
      const start = mapStartStyle(full)
      const placeholder = start.layers.filter((layer) => layer.id.startsWith(`${mapStartSource}-`))
      expect(placeholder.length).toBeGreaterThan(0)
      for (const layer of placeholder) {
        const original = full.layers.find((candidate) => `${mapStartSource}-${candidate.id}` === layer.id)!
        expect(layer).toEqual({ ...original, id: layer.id, source: mapStartSource })
      }
      expect(start.layers.filter((layer) => !layer.id.startsWith(`${mapStartSource}-`))).toEqual(full.layers)
      expect(start.sources[mapStartSource]).toMatchObject({ minzoom: 4, maxzoom: 4 })
      expect(full.sources[mapStartSource]).toBeUndefined()
    })
  }

  it('laat een externe of synthetische kaartstijl intact', () => {
    const style: StyleSpecification = { version: 8, sources: {}, layers: [{ id: 'land', type: 'background' }] }
    expect(mapStartStyle(style)).toBe(style)
  })
})
