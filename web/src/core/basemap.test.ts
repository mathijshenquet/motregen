import { describe, expect, it } from 'vitest'
import type { StyleSpecification } from 'maplibre-gl'
import { withoutRoads } from './basemap'

describe('road-free basemap', () => {
  it('removes transport geometry and names while retaining map context', () => {
    const style = {
      version: 8,
      sources: { map: { type: 'vector', url: 'https://example.test' } },
      layers: [
        { id: 'water', type: 'fill', source: 'map', 'source-layer': 'water' },
        { id: 'road', type: 'line', source: 'map', 'source-layer': 'transportation' },
        { id: 'road-name', type: 'symbol', source: 'map', 'source-layer': 'transportation_name', layout: {} },
        { id: 'places', type: 'symbol', source: 'map', 'source-layer': 'place', layout: {} },
        { id: 'borders', type: 'line', source: 'map', 'source-layer': 'boundary' },
      ],
    } as StyleSpecification

    expect(withoutRoads(style).layers.map((layer) => layer.id)).toEqual(['water', 'places', 'borders'])
  })
})
