import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { describe, expect, it } from 'vitest'
import { stripUnusedMaplibreCss } from './maplibre-css-plugin'

const css = readFileSync(createRequire(import.meta.url).resolve('maplibre-gl/dist/maplibre-gl.css'), 'utf8')

describe('stripUnusedMaplibreCss', () => {
  const stripped = stripUnusedMaplibreCss(css)

  it('houdt kaart-, canvas- en hoekcontainerregels', () => {
    for (const selector of ['.maplibregl-map', '.maplibregl-canvas', '.maplibregl-canvas-container.maplibregl-interactive', '.maplibregl-ctrl-top-left', '.maplibregl-ctrl-bottom-right', '.maplibregl-boxzoom', '.maplibregl-cooperative-gesture-screen', '.maplibregl-marker']) {
      expect(stripped, selector).toContain(selector)
    }
  })

  it('laat controls, popups en hun SVG-iconen weg', () => {
    expect(stripped).not.toMatch(/\.maplibregl-ctrl(?![\w-])/)
    expect(stripped).not.toMatch(/\.maplibregl-(?:popup|user-location)/)
    expect(stripped).not.toContain('data:image/svg')
    expect(stripped.length).toBeLessThan(css.length / 4)
  })

  it('houdt een gemengde selectorlijst', () => {
    expect(stripUnusedMaplibreCss('.maplibregl-ctrl button,.maplibregl-map{color:red}')).toContain('.maplibregl-map')
    expect(stripUnusedMaplibreCss('@media print{.maplibregl-ctrl{display:none}}')).toBe('')
  })
})
