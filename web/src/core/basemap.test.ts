import { describe, expect, it } from 'vitest'
import type { StyleSpecification } from 'maplibre-gl'
import { prepareBasemapStyle } from './basemap'

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

    const prepared = prepareBasemapStyle(style, 'light')
    expect(prepared.layers.map((layer) => layer.id)).toEqual(['water', 'places', 'borders', 'motregen-province-boundaries'])
    expect('filter' in prepared.layers[2]! ? prepared.layers[2]!.filter : undefined).toEqual(['!=', ['get', 'maritime'], 1])
    expect('filter' in prepared.layers[3]! ? prepared.layers[3]!.filter : undefined).toEqual([
      'all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1],
    ])
  })

  it('builds dark mode from Liberty context layers instead of dropping terrain tinting', () => {
    const style = {
      version: 8,
      sources: { map: { type: 'vector', url: 'https://example.test' } },
      layers: [
        { id: 'background', type: 'background', paint: { 'background-color': '#fff' } },
        { id: 'landcover_wood', type: 'fill', source: 'map', 'source-layer': 'landcover', paint: { 'fill-color': '#bada55' } },
        { id: 'water', type: 'fill', source: 'map', 'source-layer': 'water', paint: { 'fill-color': '#aaf' } },
        { id: 'boundary', type: 'line', source: 'map', 'source-layer': 'boundary', paint: { 'line-color': '#333' } },
      ],
    } as StyleSpecification

    const dark = prepareBasemapStyle(style, 'dark')
    expect(dark.layers.map((layer) => layer.id)).toEqual(['background', 'landcover_wood', 'water', 'boundary', 'motregen-province-boundaries'])
    expect(dark.layers[1]!.paint).toMatchObject({ 'fill-color': '#203a2d' })
    expect(dark.layers[2]!.paint).toMatchObject({ 'fill-color': '#183746' })
    expect(dark.layers[4]!.paint).toMatchObject({ 'line-color': '#80969c', 'line-opacity': 0.72 })
  })
})
