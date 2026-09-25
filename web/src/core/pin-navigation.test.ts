import { describe, expect, it } from 'vitest'
import { edgePanVelocity, PIN_EDGE_MARGIN } from './pin-navigation'

const viewport = { width: 400, height: 300, insets: { top: 60, right: 0, bottom: 0, left: 0 } }

describe('edgePanVelocity', () => {
  it('keeps the map still while the pin is clear of the margin', () => {
    expect(edgePanVelocity({ x: 200, y: 180 }, viewport, { x: 900, y: -900 })).toEqual({ x: 0, y: 0 })
    expect(edgePanVelocity({ x: PIN_EDGE_MARGIN, y: 60 + PIN_EDGE_MARGIN }, viewport)).toEqual({ x: 0, y: 0 })
  })

  it('pans towards the edge the pin presses into, faster the deeper it sits', () => {
    const shallow = edgePanVelocity({ x: 400 - 40, y: 180 }, viewport)
    const deep = edgePanVelocity({ x: 400 - 5, y: 180 }, viewport)
    expect(shallow.x).toBeGreaterThan(0)
    expect(deep.x).toBeGreaterThan(shallow.x)
    expect(shallow.y).toBe(0)
    expect(edgePanVelocity({ x: 10, y: 180 }, viewport).x).toBeLessThan(0)
    expect(edgePanVelocity({ x: 200, y: 295 }, viewport).y).toBeGreaterThan(0)
  })

  it('measures the top margin below the covered inset', () => {
    expect(edgePanVelocity({ x: 200, y: 90 }, viewport).y).toBeLessThan(0)
    expect(edgePanVelocity({ x: 200, y: 90 }, { width: 400, height: 300 }).y).toBe(0)
  })

  it('follows a fast drag into the edge at drag speed, never against it', () => {
    const dwell = edgePanVelocity({ x: 390, y: 180 }, viewport)
    expect(edgePanVelocity({ x: 390, y: 180 }, viewport, { x: 5000, y: 0 }).x).toBe(5000)
    expect(edgePanVelocity({ x: 390, y: 180 }, viewport, { x: -5000, y: 0 }).x).toBe(dwell.x)
    expect(edgePanVelocity({ x: 10, y: 180 }, viewport, { x: -5000, y: 0 }).x).toBe(-5000)
  })

  it('caps the depth past the edge', () => {
    expect(edgePanVelocity({ x: 400 + 200, y: 180 }, viewport)).toEqual(edgePanVelocity({ x: 400, y: 180 }, viewport))
  })
})
