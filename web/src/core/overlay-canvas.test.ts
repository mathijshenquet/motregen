// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Map as MapLibreMap } from 'maplibre-gl'
import { LayerOverlay, type OverlayLayer } from './overlay-canvas'

function fakeGl() {
  const calls: string[] = []
  const record = (name: string) => () => { calls.push(name) }
  return { calls, gl: { bindFramebuffer: record('bindFramebuffer'), viewport: record('viewport'), clearColor: () => {}, clear: record('clear'), COLOR_BUFFER_BIT: 0x4000, FRAMEBUFFER: 0x8d40 } }
}

function fakeMap(size: { width: number; height: number }) {
  const source = document.createElement('canvas')
  Object.defineProperty(source, 'width', { get: () => size.width })
  Object.defineProperty(source, 'height', { get: () => size.height })
  return {
    getCanvas: () => source,
    on: () => {}, off: () => {},
    getCenter: () => ({ lng: 5, lat: 52 }), getZoom: () => 7, getBearing: () => 0, getPitch: () => 0,
    transform: { getProjectionDataForCustomLayer: () => ({}) },
  } as unknown as MapLibreMap
}

describe('LayerOverlay met drawKey (U111)', () => {
  afterEach(() => vi.restoreAllMocks())

  it('laat de canvas met rust zolang de laag hetzelfde zou tekenen', () => {
    const { gl, calls } = fakeGl()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(gl as unknown as RenderingContext)
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
    let key = 'a'
    const order: string[] = []
    const layer: OverlayLayer = {
      id: 'proef', type: 'custom',
      prerender: () => { order.push('prerender') },
      render: () => { order.push('render') },
      drawKey: () => key,
    }
    const size = { width: 300, height: 600 }
    const host = document.createElement('div')
    const above = document.createElement('canvas')
    host.append(above)
    const overlay = new LayerOverlay(fakeMap(size), layer, above)

    overlay.drawNow()
    expect(order).toEqual(['prerender', 'render'])
    expect(calls.filter((call) => call === 'clear')).toHaveLength(1)

    overlay.drawNow()
    expect(order).toEqual(['prerender', 'render', 'prerender'])
    expect(calls.filter((call) => call === 'clear')).toHaveLength(1)
    expect(overlay.skips).toBe(1)

    key = 'b'
    overlay.drawNow()
    expect(order.at(-1)).toBe('render')
    expect(calls.filter((call) => call === 'clear')).toHaveLength(2)

    // Een nieuwe canvasmaat wist de inhoud: ook met dezelfde sleutel opnieuw tekenen.
    size.width = 320
    overlay.drawNow()
    expect(order.at(-1)).toBe('render')
    expect(overlay.draws).toBe(3)
  })

  it('houdt met maxPixelRatio een kleinere canvas op dezelfde CSS-maat aan', () => {
    const { gl } = fakeGl()
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(gl as unknown as RenderingContext)
    vi.spyOn(window, 'requestAnimationFrame').mockReturnValue(1)
    vi.spyOn(window, 'devicePixelRatio', 'get').mockReturnValue(3)
    const layer: OverlayLayer = { id: 'proef', type: 'custom', render: () => {} }
    const host = document.createElement('div')
    const above = document.createElement('canvas')
    host.append(above)
    const overlay = new LayerOverlay(fakeMap({ width: 1206, height: 2532 }), layer, above, () => Infinity, 2)
    expect([overlay.canvas.width, overlay.canvas.height]).toEqual([804, 1688])
  })
})
