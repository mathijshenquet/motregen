import { describe, expect, it } from 'vitest'
import type { StyleSpecification } from 'maplibre-gl'
import { firstBasemapTextLayerId, prepareBasemapStyle, temperatureLayerBeforeId } from './basemap'

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

  it('labels places in Dutch without a country label or enlarged capital', () => {
    const libertyName = ['case', ['has', 'name:nonlatin'],
      ['concat', ['get', 'name:latin'], '\n', ['get', 'name:nonlatin']],
      ['coalesce', ['get', 'name_en'], ['get', 'name']]]
    const place = (id: string, filter: unknown) => ({
      id, type: 'symbol', source: 'map', 'source-layer': 'place', filter, layout: { 'text-field': libertyName },
    })
    const style = {
      version: 8,
      sources: { map: { type: 'vector', url: 'https://example.test' } },
      layers: [
        { id: 'water_name', type: 'symbol', source: 'map', 'source-layer': 'water_name', layout: { 'text-field': libertyName } },
        place('label_town', ['==', ['get', 'class'], 'town']),
        place('label_city', ['all', ['==', ['get', 'class'], 'city'], ['!=', ['get', 'capital'], 2]]),
        place('label_city_capital', ['all', ['==', ['get', 'class'], 'city'], ['==', ['get', 'capital'], 2]]),
        place('label_country_3', ['all', ['==', ['get', 'class'], 'country'], ['>=', ['get', 'rank'], 3]]),
        { id: 'poi_ref', type: 'symbol', source: 'map', 'source-layer': 'poi', layout: { 'text-field': ['to-string', ['get', 'ref']] } },
      ],
    } as unknown as StyleSpecification

    for (const theme of ['light', 'dark'] as const) {
      const prepared = prepareBasemapStyle(style, theme)
      expect(prepared.layers.map((layer) => layer.id)).toEqual(['water_name', 'label_town', 'label_city', 'poi_ref'])
      const dutch = ['coalesce', ['get', 'name:nl'], ['get', 'name']]
      for (const layer of prepared.layers.slice(0, 3)) expect(layer.layout?.['text-field' as never]).toEqual(dutch)
      expect(prepared.layers[3]!.layout?.['text-field' as never]).toEqual(['to-string', ['get', 'ref']])
      expect('filter' in prepared.layers[2]! ? prepared.layers[2]!.filter : undefined).toEqual(['==', ['get', 'class'], 'city'])
    }
  })

  it('finds the first basemap text layer below which weather labels belong', () => {
    const layers = [
      { id: 'background', type: 'background' },
      { id: 'motregen-sun', type: 'symbol', source: 'sun', layout: { 'text-field': '☀' } },
      { id: 'icons', type: 'symbol', source: 'map', layout: { 'icon-image': 'marker' } },
      { id: 'water-labels', type: 'symbol', source: 'map', layout: { 'text-field': ['get', 'name'] } },
      { id: 'places', type: 'symbol', source: 'map', layout: { 'text-field': ['get', 'name'] } },
    ] as StyleSpecification['layers']
    expect(firstBasemapTextLayerId(layers)).toBe('water-labels')
  })

  it('ranks temperatures above villages and water names but below towns and cities', () => {
    const layers = [
      { id: 'water-labels', type: 'symbol', source: 'map', 'source-layer': 'water_name', layout: { 'text-field': ['get', 'name'] } },
      { id: 'label_other', type: 'symbol', source: 'map', 'source-layer': 'place', filter: ['match', ['get', 'class'], ['city', 'town', 'village'], false, true], layout: { 'text-field': ['get', 'name'] } },
      { id: 'label_village', type: 'symbol', source: 'map', 'source-layer': 'place', filter: ['==', ['get', 'class'], 'village'], layout: { 'text-field': ['get', 'name'] } },
      { id: 'label_town', type: 'symbol', source: 'map', 'source-layer': 'place', filter: ['==', ['get', 'class'], 'town'], layout: { 'text-field': ['get', 'name'] } },
      { id: 'label_city', type: 'symbol', source: 'map', 'source-layer': 'place', filter: ['all', ['==', ['get', 'class'], 'city']], layout: { 'text-field': ['get', 'name'] } },
    ] as StyleSpecification['layers']
    expect(temperatureLayerBeforeId(layers)).toBe('label_town')
    expect(temperatureLayerBeforeId(layers.slice(0, 3))).toBe('water-labels')
  })
})
