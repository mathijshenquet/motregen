import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { StyleSpecification } from 'maplibre-gl'
import { firstBasemapTextLayerId, prepareBasemapStyle, temperatureLayerBeforeId } from './basemap'

const styles = ['licht', 'donker'].map((name) => JSON.parse(readFileSync(`public/basemap/${name}.json`, 'utf8')) as StyleSpecification)

describe('eigen basiskaart', () => {
  for (const [index, name] of ['licht', 'donker'].entries()) {
    it(`${name} gebruikt alleen ons schema met leesbare plaatsnamen en provinciegrenzen`, () => {
      const style = styles[index]!
      const schema = new Set(['water', 'landcover', 'boundary', 'place'])
      expect(Object.keys(style.sources)).toEqual(['basemap'])
      for (const layer of style.layers) {
        if ('source-layer' in layer) expect(schema.has(layer['source-layer']!)).toBe(true)
        if (layer.type === 'symbol') {
          expect(layer.layout?.['text-field']).toEqual(['get', 'name'])
          expect(layer.layout?.['text-size']).toBeDefined()
        }
      }
      expect(style.layers.find((layer) => layer.id === 'motregen-province-boundaries')).toMatchObject({
        type: 'line', 'source-layer': 'boundary',
        filter: ['all', ['==', ['get', 'admin_level'], 4], ['!=', ['get', 'maritime'], 1]],
      })
      expect(firstBasemapTextLayerId(style.layers)).toBe('label_village')
      expect(temperatureLayerBeforeId(style.layers)).toBe('label_town')
    })
  }

  it('lost de gehashte PMTiles-bron op de data-origin op en fonts op de frontend', () => {
    const style = styles[0]!
    const prepared = prepareBasemapStyle(style, 'https://data.example.test', 'https://app.example.test/basemap/licht.json')
    expect(prepared.sources.basemap).toMatchObject({ url: expect.stringMatching(/^pmtiles:\/\/https:\/\/data\.example\.test\/data\/basemap\/nl-[0-9a-f]{16}\.pmtiles$/) })
    expect(prepared.glyphs).toBe('https://app.example.test/basemap/fonts/{fontstack}/{range}.pbf')
    expect(prepared.layers).toBe(style.layers)
    expect(style.sources.basemap).toMatchObject({ url: expect.stringMatching(/^pmtiles:\/\/\/data\//) })
  })

  it('gebruikt hetzelfde kaartbestand en dezelfde laagvolgorde in beide thema’s', () => {
    expect(styles[0]!.sources).toEqual(styles[1]!.sources)
    expect(styles[0]!.layers.map((layer) => layer.id)).toEqual(styles[1]!.layers.map((layer) => layer.id))
    expect(styles[0]!.layers[0]!.paint).not.toEqual(styles[1]!.layers[0]!.paint)
  })

  it('behoudt de lokale e2e-bron en valt terug op het eerste basiskaartlabel', () => {
    const style = { version: 8, sources: { fixture: { type: 'vector', tiles: ['http://localhost/tiles/{z}/{x}/{y}.pbf'] } }, layers: [
      { id: 'background', type: 'background' },
      { id: 'motregen-sun', type: 'symbol', source: 'sun', layout: { 'text-field': '☀' } },
      { id: 'places', type: 'symbol', source: 'fixture', layout: { 'text-field': ['get', 'name'] } },
    ] } as StyleSpecification
    expect(prepareBasemapStyle(style, 'http://localhost').sources).toEqual(style.sources)
    expect(firstBasemapTextLayerId(style.layers)).toBe('places')
    expect(temperatureLayerBeforeId(style.layers)).toBe('places')
  })
})
