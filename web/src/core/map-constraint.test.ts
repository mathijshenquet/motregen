import { describe, expect, it } from 'vitest'
import type { MapView } from './location-memory'
import { constrainView, containView, containZoom, MAP_CONTAIN_BOUNDS, type Viewport } from './map-constraint'
import { NETHERLANDS_FLANDERS_BOUNDS } from './map-frame'

const bounds = MAP_CONTAIN_BOUNDS
const desktop: Viewport = { width: 1280, height: 720 }
const portrait: Viewport = { width: 393, height: 727 }

describe('map constraint', () => {
  it('fits the bounds exactly on the tight axis at the contain zoom', () => {
    const landscape = screenBounds(containView(bounds, desktop), desktop)
    expect(landscape.bottom - landscape.top).toBeCloseTo(desktop.height, 6)
    expect(landscape.right - landscape.left).toBeLessThan(desktop.width)

    const phone = screenBounds(containView(bounds, portrait), portrait)
    expect(phone.right - phone.left).toBeCloseTo(portrait.width, 6)
    expect(phone.bottom - phone.top).toBeLessThan(portrait.height)
    expect(phone.left).toBeCloseTo(0, 6)
  })

  it('keeps the margin small around the Netherlands and Flanders', () => {
    expect(bounds.west).toBeLessThan(NETHERLANDS_FLANDERS_BOUNDS.west)
    expect(bounds.north).toBeGreaterThan(NETHERLANDS_FLANDERS_BOUNDS.north)
    expect(bounds.east - bounds.west).toBeCloseTo((NETHERLANDS_FLANDERS_BOUNDS.east - NETHERLANDS_FLANDERS_BOUNDS.west) * 1.08, 6)
  })

  it('frames all of Flanders with margin: Brussel, Leuven, Hasselt and the Voerstreek', () => {
    for (const [lng, lat] of [[4.35, 50.85], [4.7, 50.88], [5.34, 50.93], [5.78, 50.75], [4.23, 50.73], [2.54, 51.09]] as const) {
      expect(lng).toBeGreaterThan(bounds.west)
      expect(lng).toBeLessThan(bounds.east)
      expect(lat).toBeGreaterThan(bounds.south + 0.2)
    }
  })

  it('never zooms out beyond contain and never beyond the detail limit inward', () => {
    const minZoom = containZoom(bounds, desktop)
    expect(constrainView({ lng: 5, lat: 52, zoom: 2 }, bounds, desktop).zoom).toBeCloseTo(minZoom, 9)
    expect(constrainView({ lng: 5, lat: 52, zoom: 14 }, bounds, desktop, 11).zoom).toBe(11)
  })

  it('contain axis: the centre is pinned to the middle of the bounds, no sideways drift', () => {
    const zoom = containZoom(bounds, desktop) + 0.2
    const centred = containView(bounds, desktop)
    const pushedWest = constrainView({ lng: -10, lat: 52, zoom }, bounds, desktop)
    expect(pushedWest.lng).toBeCloseTo(centred.lng, 9)
    const nudged = constrainView({ lng: 5.4, lat: 52.1, zoom: containZoom(bounds, desktop) }, bounds, desktop)
    expect(nudged.lng).toBeCloseTo(centred.lng, 9)
    expect(nudged.lat).toBeCloseTo(centred.lat, 9)
  })

  it('cover axis: the viewport stays inside the bounds', () => {
    const zoom = containZoom(bounds, desktop) + 2
    const escaped = constrainView({ lng: 12, lat: 58, zoom }, bounds, desktop)
    const screen = screenBounds(escaped, desktop)
    expect(screen.right).toBeCloseTo(desktop.width, 6)
    expect(screen.top).toBeCloseTo(0, 6)

    const inside = { lng: 5.1, lat: 52.1, zoom }
    expect(constrainView(inside, bounds, desktop)).toEqual(expect.objectContaining({ lng: expect.closeTo(5.1, 9), lat: expect.closeTo(52.1, 9) }))
  })

  it('mixed portrait: latitude is pinned (contain) while longitude covers', () => {
    const zoom = containZoom(bounds, portrait) + 0.3
    const view = constrainView({ lng: 0, lat: 40, zoom }, bounds, portrait)
    const screen = screenBounds(view, portrait)
    expect(screen.left).toBeCloseTo(0, 6)
    expect(view.lat).toBeCloseTo(containView(bounds, portrait).lat, 9)
    expect(screen.bottom - screen.top).toBeLessThan(portrait.height)
    expect(screen.right - screen.left).toBeGreaterThan(portrait.width)
  })

  it('recomputes the minimum zoom when the viewport rotates or resizes', () => {
    const rotated: Viewport = { width: portrait.height, height: portrait.width }
    // Sinds U27 is het kader hoger dan breed: liggend past het pas verder uitgezoomd.
    expect(containZoom(bounds, rotated)).toBeLessThan(containZoom(bounds, portrait))
    const saved = { lng: 5.3, lat: 52.2, zoom: containZoom(bounds, rotated) }
    expect(constrainView(saved, bounds, portrait).zoom).toBeCloseTo(containZoom(bounds, portrait), 9)
    expect(containZoom(bounds, { width: 2560, height: 1440 })).toBeCloseTo(containZoom(bounds, desktop) + 1, 9)
  })

  it('insets: contain and clamp use the area below the search bar', () => {
    const landscapePhone: Viewport = { width: 393, height: 393, insets: { top: 60, right: 0, bottom: 0, left: 0 } }
    const fit = screenBounds(containView(bounds, landscapePhone), landscapePhone)
    expect(fit.top).toBeCloseTo(60, 6)
    expect(fit.bottom).toBeCloseTo(393, 6)
    expect(containZoom(bounds, landscapePhone)).toBeLessThan(containZoom(bounds, { width: 393, height: 393 }))

    const zoom = containZoom(bounds, landscapePhone) + 2
    const north = screenBounds(constrainView({ lng: 5, lat: 60, zoom }, bounds, landscapePhone), landscapePhone)
    expect(north.top).toBeCloseTo(60, 6)
    const south = screenBounds(constrainView({ lng: 5, lat: 45, zoom }, bounds, landscapePhone), landscapePhone)
    expect(south.bottom).toBeCloseTo(393, 6)

    // Portret: de vrije hoogte past ruim, dus alleen het midden schuift omlaag, de zoom blijft.
    const tallPhone: Viewport = { width: 393, height: 491, insets: { top: 60, right: 0, bottom: 0, left: 0 } }
    expect(containZoom(bounds, tallPhone)).toBeCloseTo(containZoom(bounds, { width: 393, height: 491 }), 9)
    const tall = screenBounds(containView(bounds, tallPhone), tallPhone)
    expect((tall.top + tall.bottom) / 2).toBeCloseTo(60 + (491 - 60) / 2, 6)
  })
})

function screenBounds(view: MapView, viewport: Viewport) {
  const worldSize = 512 * 2 ** view.zoom
  const x = (lng: number) => ((lng + 180) / 360 - (view.lng + 180) / 360) * worldSize + viewport.width / 2
  const y = (lat: number) => (mercatorY(lat) - mercatorY(view.lat)) * worldSize + viewport.height / 2
  return { left: x(bounds.west), right: x(bounds.east), top: y(bounds.north), bottom: y(bounds.south) }
}

function mercatorY(lat: number): number {
  const phi = lat * Math.PI / 180
  return (1 - Math.log(Math.tan(Math.PI / 4 + phi / 2)) / Math.PI) / 2
}
